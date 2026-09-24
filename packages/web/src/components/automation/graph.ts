import { AUTOMATION_NODE_TYPE, type AutomationDefinition, type AutomationNode, type AutomationPosition } from '@frigg/shared';

type FlowPosition = { id: string; position: AutomationPosition };

function isAction(node: AutomationNode): boolean {
  return node.type !== AUTOMATION_NODE_TYPE.start && node.type !== AUTOMATION_NODE_TYPE.end;
}

function makeEdges(nodes: AutomationNode[]): AutomationDefinition['edges'] {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${node.id}-${nodes[index + 1]!.id}`,
    source: node.id,
    target: nodes[index + 1]!.id,
  }));
}

export function orderedNodes(definition: AutomationDefinition): AutomationNode[] {
  const start = definition.nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.start);
  const end = definition.nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.end);
  if (!start || !end) return definition.nodes;

  const nextBySource = new Map(definition.edges.map((edge) => [edge.source, edge.target]));
  const ordered: AutomationNode[] = [];
  const visited = new Set<string>();
  let node: AutomationNode | undefined = start;
  while (node && !visited.has(node.id)) {
    ordered.push(node);
    visited.add(node.id);
    if (node.id === end.id) break;
    const nextId = nextBySource.get(node.id);
    node = nextId ? definition.nodes.find((candidate) => candidate.id === nextId) : undefined;
  }

  for (const candidate of definition.nodes) {
    if (!visited.has(candidate.id) && candidate.id !== end.id) ordered.push(candidate);
  }
  if (!visited.has(end.id)) ordered.push(end);
  return ordered;
}

export function commitCanvasPositions(
  definition: AutomationDefinition,
  flowNodes: FlowPosition[],
): AutomationDefinition {
  const positions = new Map(flowNodes.map(({ id, position }) => [id, position]));
  return {
    ...definition,
    nodes: definition.nodes.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position: { ...position } } : node;
    }),
  };
}

export function connectLinearNodes(
  definition: AutomationDefinition,
  sourceId: string,
  targetId: string,
): AutomationDefinition {
  const sequence = orderedNodes(definition);
  const start = sequence.find((node) => node.type === AUTOMATION_NODE_TYPE.start);
  const end = sequence.find((node) => node.type === AUTOMATION_NODE_TYPE.end);
  if (!start || !end || sourceId === end.id || targetId === start.id || sourceId === targetId) return definition;

  let actions = sequence.filter(isAction);
  if (targetId === end.id) {
    const moved = actions.find((node) => node.id === sourceId);
    if (!moved) return definition;
    actions = [...actions.filter((node) => node.id !== sourceId), moved];
  } else {
    const moved = actions.find((node) => node.id === targetId);
    if (!moved) return definition;
    actions = actions.filter((node) => node.id !== targetId);
    const sourceIndex = sourceId === start.id ? -1 : actions.findIndex((node) => node.id === sourceId);
    if (sourceIndex === -1 && sourceId !== start.id) return definition;
    actions.splice(sourceIndex + 1, 0, moved);
  }

  const nodes = [start, ...actions, end];
  return { ...definition, nodes, edges: makeEdges(nodes) };
}

export function appendAction(definition: AutomationDefinition, action: AutomationNode): AutomationDefinition {
  const sequence = orderedNodes(definition);
  const start = sequence.find((node) => node.type === AUTOMATION_NODE_TYPE.start);
  const end = sequence.find((node) => node.type === AUTOMATION_NODE_TYPE.end);
  if (!start || !end) return definition;

  const actions = sequence.filter(isAction);
  const previous = actions.at(-1) ?? start;
  const position = { x: previous.position.x, y: previous.position.y + 135 };
  const placed = { ...action, position };
  const movedEnd = { ...end, position: { x: position.x, y: position.y + 135 } };
  const nodes = [start, ...actions, placed, movedEnd];
  return { ...definition, nodes, edges: makeEdges(nodes) };
}

export function insertActionAfter(
  definition: AutomationDefinition,
  sourceId: string,
  action: AutomationNode,
): AutomationDefinition {
  if (!isAction(action) || definition.nodes.some((node) => node.id === action.id)) return definition;
  const withAction = { ...definition, nodes: [...definition.nodes, action] };
  const inserted = connectLinearNodes(withAction, sourceId, action.id);
  return inserted.nodes.some((node) => node.id === action.id) && inserted.edges !== definition.edges ? inserted : definition;
}

export function removeAction(definition: AutomationDefinition, nodeId: string): AutomationDefinition {
  const sequence = orderedNodes(definition);
  if (!sequence.some((node) => node.id === nodeId && isAction(node))) return definition;
  const nodes = sequence.filter((node) => node.id !== nodeId);
  return { ...definition, nodes, edges: makeEdges(nodes) };
}

export function arrangeAutomation(definition: AutomationDefinition): AutomationDefinition {
  const nodes = orderedNodes(definition).map((node, index) => ({
    ...node,
    position: { x: 70, y: index === 0 ? 22 : 105 + (index - 1) * 135 },
  }));
  return { ...definition, nodes, edges: makeEdges(nodes) };
}
