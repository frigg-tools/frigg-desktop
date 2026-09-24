import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  ConnectionLineType,
  Controls,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AUTOMATION_NODE_TYPE, AUTOMATION_STEP_STATUS, type AutomationDefinition, type AutomationNode, type AutomationNodeType, type AutomationRun } from '@frigg/shared';
import type { TranslateFn } from '../../i18n';
import ActionLibrary from './ActionLibrary';
import AutomationNodeCard, { type AutomationCanvasNodeData } from './AutomationNodeCard';

const nodeTypes = { action: AutomationNodeCard } satisfies NodeTypes;
const startGap = 105;
const stepGap = 135;

function nextId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isAction(node: AutomationNode): boolean {
  return node.type !== AUTOMATION_NODE_TYPE.start && node.type !== AUTOMATION_NODE_TYPE.end;
}

function makeEdges(nodes: AutomationNode[]): AutomationDefinition['edges'] {
  return nodes.slice(0, -1).map((node, index) => ({ id: `edge-${node.id}-${nodes[index + 1].id}`, source: node.id, target: nodes[index + 1].id }));
}

function layout(nodes: AutomationNode[]): AutomationNode[] {
  const start = nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.start)!;
  const end = nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.end)!;
  const actions = nodes.filter(isAction);
  return [
    { ...start, position: { x: 70, y: 22 } },
    ...actions.map((node, index) => ({ ...node, position: { x: 70, y: startGap + index * stepGap } })),
    { ...end, position: { x: 70, y: startGap + actions.length * stepGap } },
  ];
}

function initialActionData(type: AutomationNodeType): AutomationNode['data'] {
  if (type === AUTOMATION_NODE_TYPE.tap) return {};
  if (type === AUTOMATION_NODE_TYPE.longPress) return {};
  if (type === AUTOMATION_NODE_TYPE.swipe) return {};
  if (type === AUTOMATION_NODE_TYPE.launchApp) return { packageName: '' };
  if (type === AUTOMATION_NODE_TYPE.text) return { text: '' };
  if (type === AUTOMATION_NODE_TYPE.key) return { key: 'BACK' };
  if (type === AUTOMATION_NODE_TYPE.wait) return { durationMs: 500 };
  if (type === AUTOMATION_NODE_TYPE.screenshot) return { label: '' };
  return {};
}

function detailFor(node: AutomationNode, t: TranslateFn): string {
  if ((node.type === AUTOMATION_NODE_TYPE.tap || node.type === AUTOMATION_NODE_TYPE.longPress) && 'point' in node.data) return `${Math.round(node.data.point.x * 100)}%, ${Math.round(node.data.point.y * 100)}%`;
  if (node.type === AUTOMATION_NODE_TYPE.swipe && 'start' in node.data) return `${Math.round(node.data.start.x * 100)}% → ${Math.round(node.data.end.x * 100)}%`;
  if (node.type === AUTOMATION_NODE_TYPE.launchApp && 'packageName' in node.data) return node.data.packageName || t('automation.properties.packagePlaceholder');
  if (node.type === AUTOMATION_NODE_TYPE.text && 'text' in node.data) return node.data.text || t('automation.properties.emptyText');
  if (node.type === AUTOMATION_NODE_TYPE.key && 'key' in node.data) return node.data.key;
  if ((node.type === AUTOMATION_NODE_TYPE.wait || node.type === AUTOMATION_NODE_TYPE.longPress || node.type === AUTOMATION_NODE_TYPE.swipe) && 'durationMs' in node.data) return `${node.data.durationMs} ms`;
  if (node.type === AUTOMATION_NODE_TYPE.screenshot && 'label' in node.data) return node.data.label || t('automation.properties.screenshotLabel');
  return node.type === AUTOMATION_NODE_TYPE.start ? t('automation.editor.start') : node.type === AUTOMATION_NODE_TYPE.end ? t('automation.editor.end') : t('automation.properties.configure');
}

function defaultRunStatus(run: AutomationRun | null, nodeId: string): AutomationCanvasNodeData['runStatus'] {
  if (!run) return undefined;
  const step = run.steps.find((item) => item.nodeId === nodeId);
  if (!step) return undefined;
  if (step.status === AUTOMATION_STEP_STATUS.completed) return 'step-completed';
  if (step.status === AUTOMATION_STEP_STATUS.failed) return 'step-failed';
  if (step.status === AUTOMATION_STEP_STATUS.running) return 'running';
  if (step.status === AUTOMATION_STEP_STATUS.cancelled) return 'cancelled';
  return undefined;
}

export default function AutomationCanvas({
  definition,
  selectedNodeId,
  run,
  t,
  onChange,
  onSelectNode,
}: {
  definition: AutomationDefinition;
  selectedNodeId: string | null;
  run: AutomationRun | null;
  t: TranslateFn;
  onChange: (nodes: AutomationNode[], edges: AutomationDefinition['edges']) => void;
  onSelectNode: (id: string | null) => void;
}) {
  const startNode = definition.nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.start)!;
  const endNode = definition.nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.end)!;
  const removeAction = useCallback((id: string) => {
    if (!definition.nodes.some((node) => node.id === id && isAction(node))) return;
    const nextNodes = layout(definition.nodes.filter((node) => node.id !== id));
    onChange(nextNodes, makeEdges(nextNodes));
    if (selectedNodeId === id) onSelectNode(null);
  }, [definition.nodes, onChange, onSelectNode, selectedNodeId]);
  const flowNodes = useMemo<Node<AutomationCanvasNodeData>[]>(() => definition.nodes.map((action) => ({
    id: action.id,
    type: 'action',
    position: action.position,
    selected: action.id === selectedNodeId,
    data: {
      action,
      title: action.type === AUTOMATION_NODE_TYPE.start ? t('automation.editor.start') : action.type === AUTOMATION_NODE_TYPE.end ? t('automation.editor.end') : t(`automation.node.${action.type}`),
      detail: detailFor(action, t),
      removeLabel: t('automation.canvas.removeAction'),
      runStatus: defaultRunStatus(run, action.id),
      onRemove: removeAction,
    },
    draggable: action.type !== AUTOMATION_NODE_TYPE.start && action.type !== AUTOMATION_NODE_TYPE.end,
  })), [definition.nodes, removeAction, run, selectedNodeId, t]);
  const flowEdges = useMemo<Edge[]>(() => definition.edges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    selectable: false,
    deletable: false,
    animated: Boolean(run?.steps.some((step) => step.nodeId === edge.source && step.status === AUTOMATION_STEP_STATUS.completed)),
    style: { stroke: 'rgb(82 82 91)', strokeWidth: 1.6 },
  })), [definition.edges, run]);
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  const actionMap = useMemo(() => new Map(definition.nodes.filter(isAction).map((node) => [node.id, node])), [definition.nodes]);

  const addAction = useCallback((type: AutomationNodeType) => {
    const newNode: AutomationNode = { id: nextId(), type, data: initialActionData(type), position: { x: 70, y: 0 } };
    const nextNodes = layout([startNode, ...definition.nodes.filter(isAction), newNode, endNode]);
    onChange(nextNodes, makeEdges(nextNodes));
    onSelectNode(newNode.id);
  }, [definition.nodes, endNode, onChange, onSelectNode, startNode]);

  const handleNodesChange = useCallback((changes: NodeChange<Node<AutomationCanvasNodeData>>[]) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const actionNodes = definition.nodes.filter(isAction).sort((a, b) => a.position.y - b.position.y);
    if (connection.target === startNode.id || connection.source === endNode.id) return;
    let nextActions = [...actionNodes];
    if (connection.target === endNode.id) {
      const moving = nextActions.find((node) => node.id === connection.source);
      if (!moving) return;
      nextActions = [...nextActions.filter((node) => node.id !== moving.id), moving];
    } else {
      const moving = nextActions.find((node) => node.id === connection.target);
      if (!moving) return;
      nextActions = nextActions.filter((node) => node.id !== moving.id);
      const sourceIndex = connection.source === startNode.id ? -1 : nextActions.findIndex((node) => node.id === connection.source);
      if (sourceIndex === -1 && connection.source !== startNode.id) return;
      nextActions.splice(sourceIndex + 1, 0, moving);
    }
    const nextNodes = layout([startNode, ...nextActions, endNode]);
    onChange(nextNodes, makeEdges(nextNodes));
  }, [definition.nodes, endNode, onChange, startNode]);

  const handleDragStop = useCallback((_event: MouseEvent | TouchEvent, dragged: Node<AutomationCanvasNodeData>) => {
    if (dragged.id === startNode.id || dragged.id === endNode.id) return;
    const byVerticalPosition = nodes.filter((node) => actionMap.has(node.id)).sort((a, b) => a.position.y - b.position.y);
    const ordered = byVerticalPosition.map((node) => actionMap.get(node.id)!);
    const nextNodes = layout([startNode, ...ordered, endNode]);
    onChange(nextNodes, makeEdges(nextNodes));
  }, [actionMap, definition.nodes, endNode, nodes, onChange, startNode]);

  return (
    <section className="flex min-h-[430px] min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/20 xl:flex-1">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-zinc-100">{t('automation.editor.sequence')}</h2>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">{t('automation.editor.sequenceHint')}</p>
        </div>
        <span className="ml-2 rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">{definition.nodes.filter(isAction).length} {t('automation.editor.actions')}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <ActionLibrary onAdd={addAction} t={t} />
        <div className="dot-grid h-[390px] min-h-[320px] min-w-0 flex-1 xl:h-auto">
          <ReactFlow
            nodes={nodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onConnect={handleConnect}
            isValidConnection={(connection) => Boolean(connection.source && connection.target && connection.source !== endNode.id && connection.target !== startNode.id && connection.source !== connection.target)}
            onNodeClick={(_event, node) => onSelectNode(actionMap.has(node.id) ? node.id : null)}
            onPaneClick={() => onSelectNode(null)}
            onNodeDragStop={handleDragStop}
            connectionLineType={ConnectionLineType.SmoothStep}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            fitView
            fitViewOptions={{ padding: 0.18, minZoom: 0.45, maxZoom: 0.9 }}
            minZoom={0.3}
            maxZoom={1.5}
            nodesConnectable
            nodesFocusable
            elementsSelectable
            panOnScroll
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: false }}
          >
            <Background color="rgb(63 63 70)" gap={20} size={1} />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        </div>
      </div>
    </section>
  );
}
