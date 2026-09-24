import {
  AUTOMATION_KEY,
  AUTOMATION_NODE_TYPE,
  type AutomationActionData,
  type AutomationDefinition,
  type AutomationEdge,
  type AutomationNode,
  type AutomationNodeType,
  type AutomationPoint,
  type AutomationValidationIssue,
  type AutomationValidationResult,
} from '@frigg/shared';
import { parseSafeAdbCommand } from './adb-command.ts';

const MAX_NODES = 100;
const MAX_WAIT_MS = 60_000;
const MAX_GESTURE_MS = 10_000;
const MIN_GESTURE_MS = 1;
const SUPPORTED_TEXT = /^[A-Za-z0-9.,:@/_ -]*$/;
const PACKAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const CAPTURE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NODE_TYPES = new Set<string>(Object.values(AUTOMATION_NODE_TYPE));
const KEYS = new Set<string>(Object.values(AUTOMATION_KEY));

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: AutomationValidationIssue[],
  code: string,
  message: string,
  details: Pick<AutomationValidationIssue, 'nodeId' | 'edgeId' | 'field'> = {},
): void {
  issues.push({ code, message, ...details });
}

function validPosition(value: unknown): value is { x: number; y: number } {
  if (!isRecord(value)) return false;
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function parsePoint(
  value: unknown,
  nodeId: string,
  field: string,
  issues: AutomationValidationIssue[],
): AutomationPoint | null {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid_point', 'A point with screen coordinates is required.', { nodeId, field });
    return null;
  }
  const { x, y, referenceWidth, referenceHeight, referenceRotation } = value;
  if (
    typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1 ||
    typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1 ||
    typeof referenceWidth !== 'number' || !Number.isInteger(referenceWidth) || referenceWidth < 1 || referenceWidth > 16_384 ||
    typeof referenceHeight !== 'number' || !Number.isInteger(referenceHeight) || referenceHeight < 1 || referenceHeight > 16_384 ||
    typeof referenceRotation !== 'number' || !Number.isInteger(referenceRotation) || referenceRotation < 0 || referenceRotation > 3
  ) {
    addIssue(issues, 'invalid_point', 'Screen point or reference geometry is invalid.', { nodeId, field });
    return null;
  }
  return {
    x,
    y,
    referenceWidth: referenceWidth as number,
    referenceHeight: referenceHeight as number,
    referenceRotation: referenceRotation as 0 | 1 | 2 | 3,
  };
}

function parseDuration(
  value: unknown,
  nodeId: string,
  field: string,
  min: number,
  max: number,
  code: string,
  issues: AutomationValidationIssue[],
): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    addIssue(issues, code, `Duration must be an integer between ${min} and ${max} ms.`, { nodeId, field });
    return null;
  }
  return value;
}

function parseReferenceCaptureId(data: RecordValue, nodeId: string, issues: AutomationValidationIssue[]): string | undefined | null {
  if (data.referenceCaptureId === undefined) return undefined;
  if (typeof data.referenceCaptureId !== 'string' || !CAPTURE_ID.test(data.referenceCaptureId)) {
    addIssue(issues, 'invalid_capture', 'Reference capture ID is invalid.', { nodeId, field: 'data.referenceCaptureId' });
    return null;
  }
  return data.referenceCaptureId;
}

function parseNode(value: unknown, index: number, issues: AutomationValidationIssue[]): AutomationNode | null {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid_node', 'Node must be an object.', { field: `nodes.${index}` });
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const nodeId = id || undefined;
  const type = typeof value.type === 'string' ? value.type : '';
  if (id === '' || id.length > 128) {
    addIssue(issues, 'invalid_node_id', 'Node ID must contain 1 to 128 characters.', { nodeId, field: `nodes.${index}.id` });
  }
  if (!NODE_TYPES.has(type)) {
    addIssue(issues, 'unknown_node_type', `Unknown automation node type: ${type || '(empty)'}.`, { nodeId, field: `nodes.${index}.type` });
    return null;
  }
  const position = validPosition(value.position) ? value.position : null;
  if (position === null) {
    addIssue(issues, 'invalid_position', 'Canvas position must contain finite x and y values.', { nodeId, field: 'position' });
  }

  const data = isRecord(value.data) ? value.data : {};
  if (!isRecord(value.data)) {
    addIssue(issues, 'invalid_action_data', 'Node data must be an object.', { nodeId, field: 'data' });
  }
  let parsed: AutomationActionData | null = null;

  switch (type as AutomationNodeType) {
    case AUTOMATION_NODE_TYPE.start:
    case AUTOMATION_NODE_TYPE.end:
      parsed = {};
      break;
    case AUTOMATION_NODE_TYPE.launchApp: {
      const packageName = typeof data.packageName === 'string' ? data.packageName.trim() : '';
      if (!PACKAGE_NAME.test(packageName)) {
        addIssue(issues, 'invalid_package_name', 'Enter a valid Android package name.', { nodeId, field: 'data.packageName' });
      } else {
        parsed = { packageName };
      }
      break;
    }
    case AUTOMATION_NODE_TYPE.forceStopApp:
    case AUTOMATION_NODE_TYPE.clearAppData: {
      const packageName = typeof data.packageName === 'string' ? data.packageName.trim() : '';
      if (!PACKAGE_NAME.test(packageName)) {
        addIssue(issues, 'invalid_package_name', 'Enter a valid Android package name.', { nodeId, field: 'data.packageName' });
      } else {
        parsed = { packageName };
      }
      break;
    }
    case AUTOMATION_NODE_TYPE.adbCommand: {
      if (parseSafeAdbCommand(data.command) === null) {
        addIssue(issues, 'unsupported_adb_command', 'This ADB command is not supported. Use a safe input, am force-stop, pm list packages, dumpsys, getprop, or settings get command.', { nodeId, field: 'data.command' });
      } else {
        parsed = { command: data.command as string };
      }
      break;
    }
    case AUTOMATION_NODE_TYPE.tap:
    case AUTOMATION_NODE_TYPE.longPress: {
      const point = parsePoint(data.point, id, 'data.point', issues);
      const referenceCaptureId = parseReferenceCaptureId(data, id, issues);
      if (type === AUTOMATION_NODE_TYPE.tap && point && referenceCaptureId !== null) parsed = { point, ...(referenceCaptureId ? { referenceCaptureId } : {}) };
      if (type === AUTOMATION_NODE_TYPE.longPress) {
        const durationMs = parseDuration(data.durationMs, id, 'data.durationMs', MIN_GESTURE_MS, MAX_GESTURE_MS, 'invalid_gesture_duration', issues);
        if (point && durationMs !== null && referenceCaptureId !== null) parsed = { point, durationMs, ...(referenceCaptureId ? { referenceCaptureId } : {}) };
      }
      break;
    }
    case AUTOMATION_NODE_TYPE.swipe: {
      const start = parsePoint(data.start, id, 'data.start', issues);
      const end = parsePoint(data.end, id, 'data.end', issues);
      const durationMs = parseDuration(data.durationMs, id, 'data.durationMs', MIN_GESTURE_MS, MAX_GESTURE_MS, 'invalid_gesture_duration', issues);
      const referenceCaptureId = parseReferenceCaptureId(data, id, issues);
      if (start && end && durationMs !== null && referenceCaptureId !== null) parsed = { start, end, durationMs, ...(referenceCaptureId ? { referenceCaptureId } : {}) };
      break;
    }
    case AUTOMATION_NODE_TYPE.text: {
      const text = typeof data.text === 'string' ? data.text : '';
      if (!SUPPORTED_TEXT.test(text)) {
        addIssue(issues, 'unsupported_text', 'Text supports ASCII letters, digits, spaces, and . , : @ / _ - only.', { nodeId: id, field: 'data.text' });
      } else if (text.length > 1_000) {
        addIssue(issues, 'text_too_long', 'Text must be at most 1,000 characters.', { nodeId: id, field: 'data.text' });
      } else {
        parsed = { text };
      }
      break;
    }
    case AUTOMATION_NODE_TYPE.key: {
      const key = typeof data.key === 'string' ? data.key : '';
      if (!KEYS.has(key)) {
        addIssue(issues, 'unsupported_key', 'Select a supported Android key.', { nodeId: id, field: 'data.key' });
      } else {
        parsed = { key: key as (typeof AUTOMATION_KEY)[keyof typeof AUTOMATION_KEY] };
      }
      break;
    }
    case AUTOMATION_NODE_TYPE.wait: {
      const durationMs = parseDuration(data.durationMs, id, 'data.durationMs', 0, MAX_WAIT_MS, 'invalid_wait_duration', issues);
      if (durationMs !== null) parsed = { durationMs };
      break;
    }
    case AUTOMATION_NODE_TYPE.screenshot: {
      if (data.label !== undefined && (typeof data.label !== 'string' || data.label.length > 80)) {
        addIssue(issues, 'invalid_screenshot_label', 'Screenshot label must be at most 80 characters.', { nodeId: id, field: 'data.label' });
      } else {
        parsed = data.label === undefined ? {} : { label: data.label as string };
      }
      break;
    }
  }

  return parsed === null || id === '' || position === null
    ? null
    : { id, type: type as AutomationNodeType, data: parsed, position: { x: position.x, y: position.y } };
}

function parseEdges(value: unknown, nodeIds: Set<string>, issues: AutomationValidationIssue[]): AutomationEdge[] {
  if (!Array.isArray(value)) {
    addIssue(issues, 'invalid_edges', 'Edges must be an array.', { field: 'edges' });
    return [];
  }
  const ids = new Set<string>();
  const edges: AutomationEdge[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isRecord(raw)) {
      addIssue(issues, 'invalid_edge', 'Edge must be an object.', { field: `edges.${index}` });
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const source = typeof raw.source === 'string' ? raw.source : '';
    const target = typeof raw.target === 'string' ? raw.target : '';
    let invalid = false;
    if (id === '' || ids.has(id)) {
      addIssue(issues, id === '' ? 'invalid_edge_id' : 'duplicate_edge_id', 'Edge IDs must be non-empty and unique.', { edgeId: id || undefined });
      invalid = true;
    }
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      addIssue(issues, 'dangling_edge', 'Edge source and target must reference existing nodes.', { edgeId: id || undefined });
      invalid = true;
    }
    if (source === target && source !== '') {
      addIssue(issues, 'cycle_detected', 'An edge cannot connect a node to itself.', { edgeId: id || undefined, nodeId: source });
      invalid = true;
    }
    if (!invalid) {
      ids.add(id);
      edges.push({ id, source, target });
    }
  }
  return edges;
}

function validatePath(nodes: AutomationNode[], edges: AutomationEdge[], issues: AutomationValidationIssue[]): void {
  const starts = nodes.filter((node) => node.type === AUTOMATION_NODE_TYPE.start);
  const ends = nodes.filter((node) => node.type === AUTOMATION_NODE_TYPE.end);
  if (starts.length !== 1) addIssue(issues, 'start_count', 'Automation must contain exactly one start node.');
  if (ends.length !== 1) addIssue(issues, 'end_count', 'Automation must contain exactly one end node.');

  const outgoing = new Map<string, AutomationEdge[]>();
  const incoming = new Map<string, AutomationEdge[]>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge);
    incoming.get(edge.target)?.push(edge);
  }

  for (const node of nodes) {
    if ((outgoing.get(node.id)?.length ?? 0) > 1 || (incoming.get(node.id)?.length ?? 0) > 1) {
      addIssue(issues, 'branch_not_supported', 'Only one sequential path is supported.', { nodeId: node.id });
    }
  }

  if (starts.length !== 1) return;
  const start = starts[0]!;
  const reached = new Set<string>();
  const pathStack: string[] = [];
  const cycleNodes = new Set<string>();
  const visit = (nodeId: string): void => {
    if (pathStack.includes(nodeId)) {
      cycleNodes.add(nodeId);
      return;
    }
    if (reached.has(nodeId)) return;
    reached.add(nodeId);
    pathStack.push(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) visit(edge.target);
    pathStack.pop();
  };
  visit(start.id);
  for (const nodeId of cycleNodes) addIssue(issues, 'cycle_detected', 'Automation path contains a cycle.', { nodeId });
  for (const node of nodes) {
    if (!reached.has(node.id)) addIssue(issues, 'unreachable_node', 'Node is not reachable from the start.', { nodeId: node.id });
    if (node.type === AUTOMATION_NODE_TYPE.start && (incoming.get(node.id)?.length ?? 0) !== 0) {
      addIssue(issues, 'invalid_start_degree', 'Start node cannot have an incoming edge.', { nodeId: node.id });
    } else if (node.type === AUTOMATION_NODE_TYPE.end && (outgoing.get(node.id)?.length ?? 0) !== 0) {
      addIssue(issues, 'invalid_end_degree', 'End node cannot have an outgoing edge.', { nodeId: node.id });
    } else if (node.type !== AUTOMATION_NODE_TYPE.start && node.type !== AUTOMATION_NODE_TYPE.end) {
      if ((incoming.get(node.id)?.length ?? 0) !== 1 || (outgoing.get(node.id)?.length ?? 0) !== 1) {
        addIssue(issues, 'invalid_path_degree', 'Action nodes require one incoming and one outgoing edge.', { nodeId: node.id });
      }
    }
  }
}

export function validateAutomation(input: unknown): AutomationValidationResult {
  const issues: AutomationValidationIssue[] = [];
  if (!isRecord(input)) {
    return { valid: false, issues: [{ code: 'invalid_automation', message: 'Automation must be an object.' }] };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name === '' || name.length > 80) addIssue(issues, 'invalid_name', 'Name must contain 1 to 80 characters.', { field: 'name' });
  const description = input.description === undefined ? '' : input.description;
  if (typeof description !== 'string' || description.length > 500) {
    addIssue(issues, 'invalid_description', 'Description must be at most 500 characters.', { field: 'description' });
  }
  const schemaVersion = input.schemaVersion === undefined ? 1 : input.schemaVersion;
  if (schemaVersion !== 1) addIssue(issues, 'unsupported_schema_version', 'Only schema version 1 is supported.', { field: 'schemaVersion' });
  const folderId = input.folderId === undefined ? undefined : typeof input.folderId === 'string' ? input.folderId.trim() : '';
  if (input.folderId !== undefined && (!folderId || folderId.length > 128)) {
    addIssue(issues, 'invalid_folder_id', 'Folder ID must contain 1 to 128 characters.', { field: 'folderId' });
  }
  if (!Array.isArray(input.nodes)) addIssue(issues, 'invalid_nodes', 'Nodes must be an array.', { field: 'nodes' });
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  if (rawNodes.length > MAX_NODES) addIssue(issues, 'node_limit_exceeded', `Automation can contain at most ${MAX_NODES} nodes.`, { field: 'nodes' });

  const nodes: AutomationNode[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < rawNodes.length; index += 1) {
    const parsed = parseNode(rawNodes[index], index, issues);
    if (!parsed) continue;
    if (ids.has(parsed.id)) {
      addIssue(issues, 'duplicate_node_id', 'Node IDs must be unique.', { nodeId: parsed.id });
      continue;
    }
    ids.add(parsed.id);
    nodes.push(parsed);
  }

  const edges = parseEdges(input.edges, ids, issues);
  validatePath(nodes, edges, issues);

  if (issues.length > 0) return { valid: false, issues };
  const automation: AutomationDefinition = {
    name,
    description: description as string,
    schemaVersion: 1,
    ...(folderId ? { folderId } : {}),
    nodes,
    edges,
  };
  return { valid: true, automation, issues: [] };
}
