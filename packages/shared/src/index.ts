export interface BodyPayload {
  encoding: 'utf8' | 'base64';
  data: string;
  size: number;
  truncated: boolean;
}

export interface ApiKeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export type ApiBodyMode = 'none' | 'json' | 'raw' | 'form';

export interface ApiBody {
  mode: ApiBodyMode;
  raw: string;
  form: ApiKeyValue[];
}

export interface ApiRequest {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  method: string;
  url: string;
  query: ApiKeyValue[];
  headers: ApiKeyValue[];
  body: ApiBody;
  preScript: string;
  testScript: string;
  createdAt: number;
  updatedAt: number;
}

export type ApiRequestInput = Omit<ApiRequest, 'id' | 'createdAt' | 'updatedAt'>;

export interface ApiFolder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdAt: number;
}

export interface ApiEnvironment {
  id: string;
  workspaceId: string;
  name: string;
  variables: ApiKeyValue[];
}

export interface ApiClientCert {
  id: string;
  host: string;
  certPath: string;
  keyPath: string;
  caPath?: string;
  passphrase?: string;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  variables: ApiKeyValue[];
  activeEnvironmentId: string | null;
  clientCerts: ApiClientCert[];
  createdAt: number;
}

export interface ApiClientSnapshot {
  workspaces: ApiWorkspace[];
  folders: ApiFolder[];
  requests: ApiRequest[];
  environments: ApiEnvironment[];
}

export interface ApiTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ApiRunResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
  bodyTruncated: boolean;
  durationMs: number;
  sizeBytes: number;
  scriptLogs: string[];
  tests: ApiTestResult[];
  error: string | null;
  effectiveUrl: string;
}

export const API_RESPONSE_LIMIT = 2_000_000;

export interface McpServerInfo {
  command: string;
  args: string[];
  env: Record<string, string>;
  available: boolean;
  toolCount: number;
}

export interface CapturedRequest {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  protocol: 'http' | 'https';
  host: string;
  path: string;
  query: string;
  headers: Record<string, string | string[]>;
  body: BodyPayload;
  clientAddress?: string;
}

export interface CapturedResponse {
  id: string;
  timestamp: number;
  statusCode: number;
  statusMessage?: string;
  headers: Record<string, string | string[]>;
  body: BodyPayload;
  mockRuleId?: string;
  durationMs: number;
}

export type ExchangeState = 'pending' | 'completed' | 'aborted';

export interface TrafficExchange {
  id: string;
  request: CapturedRequest;
  response?: CapturedResponse;
  state: ExchangeState;
  abortedReason?: string;
}

export interface MockFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export type BodyMatchMode = 'none' | 'contains' | 'exact';

export interface MockMatcher {
  method?: string;
  hostPattern?: string;
  pathPattern: string;
  queryContains?: string;
  bodyMatch?: { mode: BodyMatchMode; value?: string };
}

export interface MockResponseSpec {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  delayMs?: number;
}

export interface MockRule {
  id: string;
  folderId: string | null;
  name: string;
  enabled: boolean;
  priority: number;
  matcher: MockMatcher;
  response: MockResponseSpec;
  createdAt: number;
  updatedAt: number;
  hitCount: number;
}

export type MockRuleInput = Omit<MockRule, 'id' | 'createdAt' | 'updatedAt' | 'hitCount'>;

export type AndroidCertMode = 'system' | 'user-manual' | 'none';

export interface AndroidDevice {
  serial: string;
  model: string;
  state: 'device' | 'offline' | 'unauthorized' | 'unknown';
  isEmulator: boolean;
  proxyConfigured: boolean;
}

export interface AndroidSetupResult {
  proxySet: boolean;
  certMode: AndroidCertMode;
  messages: string[];
}

export interface IosSimulator {
  udid: string;
  name: string;
  runtime: string;
  state: string;
}

export interface IosPhysicalDevice {
  udid: string;
  name: string;
  model: string;
  osVersion: string;
  paired: boolean;
}

export interface ToolingStatus {
  adb: { available: boolean; version?: string };
  xcrun: { available: boolean };
  macosProxy: { enabled: boolean; service: string | null };
}

export interface DevicesSnapshot {
  android: AndroidDevice[];
  iosSimulators: IosSimulator[];
  iosDevices: IosPhysicalDevice[];
  tooling: ToolingStatus;
}

export interface ProxyStatus {
  running: boolean;
  proxyPort: number;
  apiPort: number;
  lanIp: string | null;
  certFingerprint: string;
  totalExchanges: number;
}

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F';
export type LogPlatform = 'android' | 'ios';

export interface DeviceApp {
  id: string;
  label: string;
  system: boolean;
}

export interface DbFile {
  name: string;
  ref: string;
  sizeBytes: number;
}

export interface DbQueryResult {
  columns: string[];
  rows: Array<Array<string | number | null>>;
  rowCount: number;
  truncated: boolean;
}

export const DB_ROW_LIMIT = 1000;

export interface LogEntry {
  id: number;
  timestamp: number;
  level: LogLevel;
  tag: string;
  pid?: number;
  message: string;
  raw: string;
}

export interface LogTarget {
  platform: LogPlatform;
  id: string;
  label: string;
}

export interface LogSessionStatus {
  streaming: boolean;
  target: LogTarget | null;
  packageFilter: string | null;
  error: string | null;
}

export interface ProxyClientCert {
  id: string;
  host: string;
  pfxPath: string;
  passphrase?: string;
}

export interface ProxyCertsSnapshot {
  certs: ProxyClientCert[];
}

export type BreakpointDirection = 'request' | 'response' | 'both';

export interface BreakpointMatcher {
  method?: string;
  urlPattern: string;
}

export interface BreakpointRule {
  id: string;
  enabled: boolean;
  direction: BreakpointDirection;
  matcher: BreakpointMatcher;
  createdAt: number;
}

export type BreakpointRuleInput = Omit<BreakpointRule, 'id' | 'createdAt'>;

export interface PausedRequestData {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
}

export interface PausedResponseData {
  statusCode: number;
  statusMessage?: string;
  headers: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
}

export interface PausedExchange {
  id: string;
  ruleId: string;
  direction: 'request' | 'response';
  createdAt: number;
  request: PausedRequestData;
  response?: PausedResponseData;
}

export interface BreakpointRequestEdit {
  method: string;
  url: string;
  headers: ApiKeyValue[];
  body: string;
}

export interface BreakpointResponseEdit {
  statusCode: number;
  headers: ApiKeyValue[];
  body: string;
}

export type BreakpointResume =
  | { action: 'send-request'; edit: BreakpointRequestEdit }
  | { action: 'respond'; response: BreakpointResponseEdit }
  | { action: 'send-response'; edit: BreakpointResponseEdit }
  | { action: 'abort' };

export interface BreakpointsSnapshot {
  enabled: boolean;
  rules: BreakpointRule[];
  paused: PausedExchange[];
}

export type ServerEvent =
  | { type: 'request'; exchange: TrafficExchange }
  | { type: 'response'; exchange: TrafficExchange }
  | { type: 'abort'; exchange: TrafficExchange }
  | { type: 'traffic-cleared' }
  | { type: 'mocks-updated' }
  | { type: 'devices-updated' }
  | { type: 'log-entry'; entry: LogEntry }
  | { type: 'log-cleared' }
  | { type: 'log-status'; status: LogSessionStatus }
  | { type: 'breakpoint-paused'; paused: PausedExchange }
  | { type: 'breakpoint-resumed'; id: string }
  | { type: 'breakpoints-updated'; snapshot: BreakpointsSnapshot };

export interface MocksSnapshot {
  folders: MockFolder[];
  rules: MockRule[];
}

export const DEFAULT_PROXY_PORT = 8888;
export const DEFAULT_API_PORT = 4848;
export const TRAFFIC_BUFFER_LIMIT = 1000;
export const BODY_CAPTURE_LIMIT = 262144;
