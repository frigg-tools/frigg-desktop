export const AUTOMATION_NODE_TYPE = {
  start: 'start',
  end: 'end',
  launchApp: 'launchApp',
  tap: 'tap',
  longPress: 'longPress',
  swipe: 'swipe',
  text: 'text',
  key: 'key',
  wait: 'wait',
  screenshot: 'screenshot',
} as const;

export type AutomationNodeType = (typeof AUTOMATION_NODE_TYPE)[keyof typeof AUTOMATION_NODE_TYPE];

export const AUTOMATION_KEY = {
  back: 'BACK',
  home: 'HOME',
  enter: 'ENTER',
  appSwitch: 'APP_SWITCH',
} as const;

export type AutomationKey = (typeof AUTOMATION_KEY)[keyof typeof AUTOMATION_KEY];

export const AUTOMATION_RUN_STATUS = {
  starting: 'starting',
  running: 'running',
  cancelling: 'cancelling',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
} as const;

export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUS)[keyof typeof AUTOMATION_RUN_STATUS];

export const AUTOMATION_STEP_STATUS = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
} as const;

export type AutomationStepStatus = (typeof AUTOMATION_STEP_STATUS)[keyof typeof AUTOMATION_STEP_STATUS];

export interface AutomationPoint {
  x: number;
  y: number;
  referenceWidth: number;
  referenceHeight: number;
  referenceRotation: 0 | 1 | 2 | 3;
}

export interface AutomationPosition {
  x: number;
  y: number;
}

export type AutomationActionData =
  | Record<string, never>
  | { packageName: string }
  | { point: AutomationPoint }
  | { point: AutomationPoint; durationMs: number }
  | { start: AutomationPoint; end: AutomationPoint; durationMs: number }
  | { text: string }
  | { key: AutomationKey }
  | { durationMs: number }
  | { label?: string };

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  data: AutomationActionData;
  position: AutomationPosition;
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
}

export interface AutomationDefinition {
  name: string;
  description: string;
  schemaVersion: 1;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

export interface Automation extends AutomationDefinition {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  field?: string;
}

export type AutomationValidationResult =
  | { valid: true; automation: AutomationDefinition; issues: [] }
  | { valid: false; issues: AutomationValidationIssue[] };

export interface AutomationStepResult {
  nodeId: string;
  nodeType: AutomationNodeType;
  status: AutomationStepStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  message?: string;
  errorCode?: string;
  artifactId?: string;
}

export interface AutomationArtifact {
  id: string;
  mimeType: 'image/png';
  size: number;
  width: number;
  height: number;
  rotation: 0 | 1 | 2 | 3;
  createdAt: number;
  nodeId?: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  automationRevision: number;
  automation: AutomationDefinition;
  deviceSerial: string;
  status: AutomationRunStatus;
  requestId: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  steps: AutomationStepResult[];
  artifacts: AutomationArtifact[];
  errorCode?: string;
  errorMessage?: string;
}
