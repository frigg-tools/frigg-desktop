import { describe, expect, it } from 'vitest';
import { AUTOMATION_NODE_TYPE, type AutomationDefinition, type AutomationNode } from '@frigg/shared';
import { appendAction, arrangeAutomation, commitCanvasPositions, connectLinearNodes, insertActionAfter, removeAction } from './graph.ts';

function flow(): AutomationDefinition {
  return {
    name: 'Flow', description: '', schemaVersion: 1,
    nodes: [
      { id: 'start', type: AUTOMATION_NODE_TYPE.start, data: {}, position: { x: 80, y: 20 } },
      { id: 'tap', type: AUTOMATION_NODE_TYPE.tap, data: {}, position: { x: 80, y: 160 } },
      { id: 'wait', type: AUTOMATION_NODE_TYPE.wait, data: { durationMs: 500 }, position: { x: 80, y: 300 } },
      { id: 'end', type: AUTOMATION_NODE_TYPE.end, data: {}, position: { x: 80, y: 440 } },
    ],
    edges: [
      { id: 'a', source: 'start', target: 'tap' },
      { id: 'b', source: 'tap', target: 'wait' },
      { id: 'c', source: 'wait', target: 'end' },
    ],
  };
}

describe('automation canvas graph helpers', () => {
  it('persists freely dragged coordinates without changing execution order or connections', () => {
    const definition = flow();
    const moved = commitCanvasPositions(definition, [
      { id: 'start', position: { x: 520, y: 45 } },
      { id: 'tap', position: { x: 540, y: 225 } },
      { id: 'wait', position: { x: 350, y: 390 } },
      { id: 'end', position: { x: 620, y: 540 } },
    ]);

    expect(moved.nodes.find((node) => node.id === 'start')?.position).toEqual({ x: 520, y: 45 });
    expect(moved.nodes.find((node) => node.id === 'tap')?.position).toEqual({ x: 540, y: 225 });
    expect(moved.nodes.find((node) => node.id === 'end')?.position).toEqual({ x: 620, y: 540 });
    expect(moved.nodes.map((node) => node.id)).toEqual(definition.nodes.map((node) => node.id));
    expect(moved.edges).toEqual(definition.edges);
  });

  it('changes execution order through connections while leaving card positions alone', () => {
    const definition = flow();
    const movedTap = { ...definition.nodes[1]!, position: { x: 420, y: 100 } };
    definition.nodes[1] = movedTap;

    const reordered = connectLinearNodes(definition, 'wait', 'tap');

    expect(reordered.edges).toEqual([
      { id: 'edge-start-wait', source: 'start', target: 'wait' },
      { id: 'edge-wait-tap', source: 'wait', target: 'tap' },
      { id: 'edge-tap-end', source: 'tap', target: 'end' },
    ]);
    expect(reordered.nodes.find((node) => node.id === 'tap')?.position).toEqual({ x: 420, y: 100 });
  });

  it('adds a new action without moving existing cards', () => {
    const definition = flow();
    const action: AutomationNode = {
      id: 'new', type: AUTOMATION_NODE_TYPE.key, data: { key: 'HOME' }, position: { x: 0, y: 0 },
    };

    const appended = appendAction(definition, action);

    expect(appended.nodes.find((node) => node.id === 'tap')?.position).toEqual({ x: 80, y: 160 });
    expect(appended.nodes.find((node) => node.id === 'wait')?.position).toEqual({ x: 80, y: 300 });
    expect(appended.nodes.at(-2)?.id).toBe('new');
    expect(appended.edges.at(-2)).toMatchObject({ source: 'wait', target: 'new' });
    expect(appended.edges.at(-1)).toMatchObject({ source: 'new', target: 'end' });
  });

  it('inserts a newly selected action at a pending connector drop position', () => {
    const definition = flow();
    const action: AutomationNode = {
      id: 'new', type: AUTOMATION_NODE_TYPE.key, data: { key: 'HOME' }, position: { x: 460, y: 205 },
    };

    const inserted = insertActionAfter(definition, 'tap', action);

    expect(inserted.nodes.find((node) => node.id === 'new')?.position).toEqual({ x: 460, y: 205 });
    expect(inserted.edges).toEqual([
      { id: 'edge-start-tap', source: 'start', target: 'tap' },
      { id: 'edge-tap-new', source: 'tap', target: 'new' },
      { id: 'edge-new-wait', source: 'new', target: 'wait' },
      { id: 'edge-wait-end', source: 'wait', target: 'end' },
    ]);
  });

  it('removes a card and reconnects the remaining sequence without relayout', () => {
    const definition = flow();
    const removed = removeAction(definition, 'tap');

    expect(removed.nodes.find((node) => node.id === 'wait')?.position).toEqual({ x: 80, y: 300 });
    expect(removed.edges).toEqual([
      { id: 'edge-start-wait', source: 'start', target: 'wait' },
      { id: 'edge-wait-end', source: 'wait', target: 'end' },
    ]);
  });

  it('offers an explicit vertical layout based on connection order', () => {
    const definition = flow();
    definition.nodes[1] = { ...definition.nodes[1]!, position: { x: 900, y: -100 } };
    const arranged = arrangeAutomation(definition);

    expect(arranged.nodes.map((node) => node.position)).toEqual([
      { x: 70, y: 22 }, { x: 70, y: 105 }, { x: 70, y: 240 }, { x: 70, y: 375 },
    ]);
    expect(arranged.nodes.map((node) => node.id)).toEqual(['start', 'tap', 'wait', 'end']);
  });
});
