import { describe, expect, it } from 'vitest';
import { validateAutomation } from './validation.ts';

function node(id: string, type: string, data: Record<string, unknown> = {}) {
  return { id, type, data, position: { x: 10, y: 20 } };
}

function linearFlow(action: ReturnType<typeof node>) {
  return {
    name: 'Sign in smoke test',
    schemaVersion: 1,
    nodes: [node('start', 'start'), action, node('end', 'end')],
    edges: [
      { id: 'edge-start-action', source: 'start', target: action.id },
      { id: 'edge-action-end', source: action.id, target: 'end' },
    ],
  };
}

describe('validateAutomation', () => {
  it('preserves a valid optional folder assignment', () => {
    const result = validateAutomation({
      ...linearFlow(node('action', 'wait', { durationMs: 100 })),
      folderId: 'folder-1',
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.automation).toHaveProperty('folderId', 'folder-1');
  });

  it('rejects an empty folder assignment instead of silently dropping it', () => {
    const result = validateAutomation({
      ...linearFlow(node('action', 'wait', { durationMs: 100 })),
      folderId: '   ',
    });

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_folder_id', field: 'folderId' }));
  });

  it.each([
    node('action', 'launchApp', { packageName: 'com.example.app' }),
    node('action', 'forceStopApp', { packageName: 'com.example.app' }),
    node('action', 'clearAppData', { packageName: 'com.example.app' }),
    node('action', 'adbCommand', { command: 'dumpsys activity' }),
    node('action', 'tap', {
      point: { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 },
    }),
    node('action', 'longPress', {
      point: { x: 0.25, y: 0.75, referenceWidth: 400, referenceHeight: 800, referenceRotation: 1 },
      durationMs: 900,
    }),
    node('action', 'swipe', {
      start: { x: 0.5, y: 0.8, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 },
      end: { x: 0.5, y: 0.2, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 },
      durationMs: 350,
    }),
    node('action', 'text', { text: 'Hi 42' }),
    node('action', 'key', { key: 'ENTER' }),
    node('action', 'wait', { durationMs: 1_000 }),
    node('action', 'screenshot'),
  ])('accepts a valid %s action', (action) => {
    expect(validateAutomation(linearFlow(action))).toMatchObject({ valid: true });
  });

  it.each([
    'input tap 120 640',
    'am force-stop com.example.app',
    'pm list packages -3',
    'dumpsys window',
  ])('accepts a supported ADB shell command: %s', (command) => {
    expect(validateAutomation(linearFlow(node('action', 'adbCommand', { command })))).toMatchObject({ valid: true });
  });

  it.each([
    'input tap 1 2; reboot',
    'pm clear com.example.app',
    'rm -rf /',
    'dumpsys window | reboot',
  ])('rejects unsafe ADB shell command: %s', (command) => {
    expect(validateAutomation(linearFlow(node('action', 'adbCommand', { command }))).issues).toContainEqual(
      expect.objectContaining({ code: 'unsupported_adb_command', nodeId: 'action', field: 'data.command' }),
    );
  });

  it('keeps valid reference capture IDs on coordinate actions and rejects malformed IDs', () => {
    const captureId = '8c7fb58a-5cf9-46fa-829b-d443fe611388';
    const point = { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 };
    const valid = validateAutomation(linearFlow(node('tap', 'tap', { point, referenceCaptureId: captureId })));
    expect(valid.valid).toBe(true);
    if (valid.valid) expect(valid.automation.nodes.find((item) => item.id === 'tap')?.data).toHaveProperty('referenceCaptureId', captureId);
    expect(validateAutomation(linearFlow(node('tap', 'tap', { point, referenceCaptureId: '../capture.png' }))).issues)
      .toContainEqual(expect.objectContaining({ code: 'invalid_capture', nodeId: 'tap' }));
  });

  it('rejects a branch before execution and reports the branching node', () => {
    const flow = {
      name: 'Branch',
      nodes: [node('start', 'start'), node('tap', 'tap', {
        point: { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 },
      }), node('end', 'end')],
      edges: [
        { id: 'a', source: 'start', target: 'tap' },
        { id: 'b', source: 'start', target: 'end' },
        { id: 'c', source: 'tap', target: 'end' },
      ],
    };
    expect(validateAutomation(flow).issues[0]).toMatchObject({ code: 'branch_not_supported', nodeId: 'start' });
  });

  it('rejects duplicate node IDs', () => {
    const flow = linearFlow(node('start', 'end'));
    expect(validateAutomation(flow).issues).toContainEqual(
      expect.objectContaining({ code: 'duplicate_node_id', nodeId: 'start' }),
    );
  });

  it('rejects a missing start and multiple end nodes', () => {
    const flow = {
      name: 'No start',
      nodes: [node('tap', 'tap', {
        point: { x: 0.5, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 },
      }), node('end-a', 'end'), node('end-b', 'end')],
      edges: [],
    };
    expect(validateAutomation(flow).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'start_count' }),
      expect.objectContaining({ code: 'end_count' }),
    ]));
  });

  it('rejects a cycle and identifies an orphan that cannot be reached from the start', () => {
    const flow = {
      name: 'Cycle',
      nodes: [node('start', 'start'), node('a', 'wait', { durationMs: 100 }), node('b', 'wait', { durationMs: 100 }), node('orphan', 'wait', { durationMs: 100 }), node('end', 'end')],
      edges: [
        { id: 'sa', source: 'start', target: 'a' },
        { id: 'ab', source: 'a', target: 'b' },
      { id: 'ba', source: 'b', target: 'a' },
      { id: 'be', source: 'b', target: 'end' },
      ],
    };
    expect(validateAutomation(flow).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'cycle_detected' }),
      expect.objectContaining({ code: 'unreachable_node', nodeId: 'orphan' }),
    ]));
  });

  it('rejects points outside the screenshot and non-finite canvas positions', () => {
    const flow = linearFlow(node('tap', 'tap', {
      point: { x: 1.1, y: 0.5, referenceWidth: 400, referenceHeight: 800, referenceRotation: 0 },
    }));
    flow.nodes[1]!.position.x = Number.NaN;
    expect(validateAutomation(flow).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_point', nodeId: 'tap' }),
      expect.objectContaining({ code: 'invalid_position', nodeId: 'tap' }),
    ]));
  });

  it('rejects flows exceeding the 100-node limit', () => {
    const nodes = Array.from({ length: 101 }, (_, index) =>
      node(`wait-${index}`, 'wait', { durationMs: 1 }),
    );
    const edges = nodes.slice(1).map((item, index) => ({
      id: `edge-${index}`,
      source: nodes[index]!.id,
      target: item.id,
    }));
    expect(validateAutomation({ name: 'Too large', nodes, edges }).issues).toContainEqual(
      expect.objectContaining({ code: 'node_limit_exceeded' }),
    );
  });

  it('rejects shell-significant text before it can reach adb', () => {
    expect(validateAutomation(linearFlow(node('text', 'text', { text: 'ok; reboot' }))).issues).toContainEqual(
      expect.objectContaining({ code: 'unsupported_text', nodeId: 'text' }),
    );
  });

  it('rejects unknown nodes, dangling edges, and unsupported schema versions', () => {
    const result = validateAutomation({
      ...linearFlow(node('future', 'shell', { command: 'anything' })),
      schemaVersion: 99,
      edges: [{ id: 'broken', source: 'missing', target: 'future' }],
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unknown_node_type', nodeId: 'future' }),
      expect.objectContaining({ code: 'dangling_edge', edgeId: 'broken' }),
      expect.objectContaining({ code: 'unsupported_schema_version' }),
    ]));
  });

  it('rejects an invalid launch package and wait duration', () => {
    const flow = {
      name: 'Invalid inputs',
      nodes: [node('start', 'start'), node('launch', 'launchApp', { packageName: '../shell' }), node('wait', 'wait', { durationMs: 60_001 }), node('end', 'end')],
      edges: [
        { id: 'a', source: 'start', target: 'launch' },
        { id: 'b', source: 'launch', target: 'wait' },
        { id: 'c', source: 'wait', target: 'end' },
      ],
    };
    expect(validateAutomation(flow).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_package_name', nodeId: 'launch' }),
      expect.objectContaining({ code: 'invalid_wait_duration', nodeId: 'wait' }),
    ]));
  });
});
