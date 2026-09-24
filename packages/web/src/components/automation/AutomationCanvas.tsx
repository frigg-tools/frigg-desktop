import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type OnConnectEnd,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AUTOMATION_NODE_TYPE, AUTOMATION_STEP_STATUS, type AutomationDefinition, type AutomationNode, type AutomationNodeType, type AutomationRun } from '@frigg/shared';
import type { TranslateFn } from '../../i18n';
import ActionLibrary from './ActionLibrary';
import AutomationNodeCard, { type AutomationCanvasNodeData } from './AutomationNodeCard';
import { appendAction, arrangeAutomation, commitCanvasPositions, connectLinearNodes, insertActionAfter, removeAction as removeGraphAction } from './graph';

const nodeTypes = { action: AutomationNodeCard, placeholder: AutomationNodeCard } satisfies NodeTypes;

interface PendingInsertion {
  id: string;
  sourceId: string;
  position: { x: number; y: number };
}

function nextId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isAction(node: AutomationNode): boolean {
  return node.type !== AUTOMATION_NODE_TYPE.start && node.type !== AUTOMATION_NODE_TYPE.end;
}

function initialActionData(type: AutomationNodeType): AutomationNode['data'] {
  if (type === AUTOMATION_NODE_TYPE.tap) return {};
  if (type === AUTOMATION_NODE_TYPE.longPress) return {};
  if (type === AUTOMATION_NODE_TYPE.swipe) return {};
  if (type === AUTOMATION_NODE_TYPE.launchApp) return { packageName: '' };
  if (type === AUTOMATION_NODE_TYPE.forceStopApp || type === AUTOMATION_NODE_TYPE.clearAppData) return { packageName: '' };
  if (type === AUTOMATION_NODE_TYPE.adbCommand) return { command: '' };
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
  if ((node.type === AUTOMATION_NODE_TYPE.forceStopApp || node.type === AUTOMATION_NODE_TYPE.clearAppData) && 'packageName' in node.data) return node.data.packageName || t('automation.properties.packagePlaceholder');
  if (node.type === AUTOMATION_NODE_TYPE.adbCommand && 'command' in node.data) return node.data.command || t('automation.properties.adbCommand');
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
  const [pendingInsertion, setPendingInsertion] = useState<PendingInsertion | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<AutomationCanvasNodeData>, Edge> | null>(null);
  const startNode = definition.nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.start)!;
  const endNode = definition.nodes.find((node) => node.type === AUTOMATION_NODE_TYPE.end)!;
  const removeAction = useCallback((id: string) => {
    if (!definition.nodes.some((node) => node.id === id && isAction(node))) return;
    const updated = removeGraphAction(definition, id);
    onChange(updated.nodes, updated.edges);
    if (selectedNodeId === id) onSelectNode(null);
  }, [definition, onChange, onSelectNode, selectedNodeId]);
  const flowNodes = useMemo<Node<AutomationCanvasNodeData>[]>(() => [ ...definition.nodes.map((action) => ({
    id: action.id,
    type: 'action',
    position: action.position,
    selected: action.id === selectedNodeId,
    data: {
      action,
      title: action.type === AUTOMATION_NODE_TYPE.start ? t('automation.editor.start') : action.type === AUTOMATION_NODE_TYPE.end ? t('automation.editor.end') : t(`automation.node.${action.type}`),
      detail: detailFor(action, t),
      removeLabel: t('automation.canvas.removeAction'),
      moveLabel: t('automation.canvas.moveAction'),
      hasReferenceCapture: 'referenceCaptureId' in action.data && Boolean(action.data.referenceCaptureId),
      referenceCaptureLabel: t('automation.canvas.hasReferenceCapture'),
      runStatus: defaultRunStatus(run, action.id),
      onRemove: removeAction,
    },
    draggable: true,
  })), ...(pendingInsertion ? [{
    id: pendingInsertion.id,
    type: 'placeholder',
    position: pendingInsertion.position,
    draggable: false,
    data: {
      title: '', detail: '', removeLabel: '', moveLabel: t('automation.canvas.moveAction'),
      hasReferenceCapture: false, referenceCaptureLabel: '', pendingMessage: t('automation.canvas.pendingAction'),
      cancelPendingLabel: t('automation.canvas.cancelPending'), onCancelPending: () => setPendingInsertion(null),
    },
  }] : [])], [definition.nodes, pendingInsertion, removeAction, run, selectedNodeId, t]);
  const flowEdges = useMemo<Edge[]>(() => [
    ...definition.edges.filter((edge) => edge.source !== pendingInsertion?.sourceId).map((edge) => ({
      ...edge,
      type: 'smoothstep',
      selectable: false,
      deletable: false,
      animated: Boolean(run?.steps.some((step) => step.nodeId === edge.source && step.status === AUTOMATION_STEP_STATUS.completed)),
      style: { stroke: 'rgb(82 82 91)', strokeWidth: 1.6 },
    })),
    ...(pendingInsertion ? [{
      id: `preview-${pendingInsertion.sourceId}-${pendingInsertion.id}`,
      source: pendingInsertion.sourceId,
      target: pendingInsertion.id,
      type: 'smoothstep',
      selectable: false,
      deletable: false,
      animated: true,
      style: { stroke: 'rgb(52 211 153)', strokeWidth: 1.8, strokeDasharray: '5 5' },
    }] : []),
  ], [definition.edges, pendingInsertion, run]);
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  const actionMap = useMemo(() => new Map(definition.nodes.filter(isAction).map((node) => [node.id, node])), [definition.nodes]);

  const addAction = useCallback((type: AutomationNodeType) => {
    const newNode: AutomationNode = { id: nextId(), type, data: initialActionData(type), position: pendingInsertion?.position ?? { x: 70, y: 0 } };
    const nextDefinition = pendingInsertion
      ? insertActionAfter(definition, pendingInsertion.sourceId, newNode)
      : appendAction(definition, newNode);
    setPendingInsertion(null);
    onChange(nextDefinition.nodes, nextDefinition.edges);
    onSelectNode(newNode.id);
  }, [definition, onChange, onSelectNode, pendingInsertion]);

  const handleNodesChange = useCallback((changes: NodeChange<Node<AutomationCanvasNodeData>>[]) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target || connection.target === pendingInsertion?.id) return;
    const nextDefinition = connectLinearNodes(definition, connection.source, connection.target);
    onChange(nextDefinition.nodes, nextDefinition.edges);
  }, [definition, onChange, pendingInsertion?.id]);

  const handleConnectEnd = useCallback<OnConnectEnd>((event, connectionState) => {
    if (!flowInstance || !('fromNode' in connectionState) || !connectionState.fromNode || connectionState.isValid === true) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.react-flow__pane')) return;
    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!pointer || connectionState.fromNode.id === endNode.id) return;
    const position = flowInstance.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
    setPendingInsertion({ id: `pending-${nextId()}`, sourceId: connectionState.fromNode.id, position: { x: position.x - 104, y: position.y - 36 } });
    onSelectNode(null);
  }, [endNode.id, flowInstance, onSelectNode]);

  const handleDragStop = useCallback((_event: MouseEvent | TouchEvent, dragged: Node<AutomationCanvasNodeData>) => {
    const finalNodes = nodes.map((node) => node.id === dragged.id ? dragged : node);
    const updated = commitCanvasPositions(definition, finalNodes);
    onChange(updated.nodes, updated.edges);
  }, [definition, nodes, onChange]);

  const handleArrange = useCallback(() => {
    const arranged = arrangeAutomation(definition);
    onChange(arranged.nodes, arranged.edges);
  }, [definition, onChange]);

  return (
    <section className="flex min-h-[430px] min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/20 xl:flex-1">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-zinc-100">{t('automation.editor.sequence')}</h2>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">{t('automation.editor.sequenceHint')}</p>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">{definition.nodes.filter(isAction).length} {t('automation.editor.actions')}</span>
          <button type="button" onClick={handleArrange} className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">{t('automation.canvas.autoArrange')}</button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <ActionLibrary onAdd={addAction} pending={Boolean(pendingInsertion)} t={t} />
        <div className="dot-grid h-[390px] min-h-[320px] min-w-0 flex-1 xl:h-auto">
          <ReactFlow<Node<AutomationCanvasNodeData>>
            nodes={nodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onConnect={handleConnect}
            onInit={setFlowInstance}
            onConnectEnd={handleConnectEnd}
            isValidConnection={(connection) => Boolean(connection.source && connection.target && connection.source !== endNode.id && connection.target !== startNode.id && connection.target !== pendingInsertion?.id && connection.source !== connection.target)}
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
            panOnDrag
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
