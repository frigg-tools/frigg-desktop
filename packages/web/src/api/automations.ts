import {
  AUTOMATION_RUN_STATUS,
  type AndroidDevice,
  type Automation,
  type AutomationDefinition,
  type AutomationNode,
  type AutomationNodeType,
  type AutomationRun,
  type AutomationRunStatus,
  type AutomationKey,
  type AutomationValidationResult,
} from '@frigg/shared';
import { jsonInit, request, requestBlob } from './client';

export interface AutomationCatalog {
  devices: AndroidDevice[];
  nodeTypes: AutomationNodeType[];
  keys: AutomationKey[];
}

export interface AutomationScreenshot {
  blob: Blob;
  width: number;
  height: number;
  rotation: 0 | 1 | 2 | 3;
}

export function getAutomationCatalog(): Promise<AutomationCatalog> {
  return request('/api/automations/catalog');
}

export function listAutomations(): Promise<Automation[]> {
  return request('/api/automations');
}

export function getAutomation(id: string): Promise<Automation> {
  return request(`/api/automations/${encodeURIComponent(id)}`);
}

export function createAutomation(definition: AutomationDefinition): Promise<Automation> {
  return request('/api/automations', jsonInit('POST', definition));
}

export function updateAutomation(
  id: string,
  definition: AutomationDefinition,
  expectedRevision: number,
): Promise<Automation> {
  return request(`/api/automations/${encodeURIComponent(id)}`, jsonInit('PUT', { ...definition, expectedRevision }));
}

export function duplicateAutomation(id: string): Promise<Automation> {
  return request(`/api/automations/${encodeURIComponent(id)}/duplicate`, jsonInit('POST', {}));
}

export function deleteAutomation(id: string): Promise<{ ok: boolean }> {
  return request(`/api/automations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function validateAutomation(definition: AutomationDefinition): Promise<AutomationValidationResult> {
  return request('/api/automations/validate', jsonInit('POST', definition));
}

export function listAutomationRuns(automationId?: string): Promise<AutomationRun[]> {
  const query = automationId === undefined ? '' : `?automationId=${encodeURIComponent(automationId)}`;
  return request(`/api/automation-runs${query}`);
}

export function getAutomationRun(runId: string): Promise<AutomationRun> {
  return request(`/api/automation-runs/${encodeURIComponent(runId)}`);
}

export function startAutomationRun(input: {
  automationId: string;
  expectedRevision: number;
  serial: string;
  requestId: string;
}): Promise<AutomationRun> {
  const { automationId, ...body } = input;
  return request(`/api/automations/${encodeURIComponent(automationId)}/runs`, jsonInit('POST', body));
}

export function cancelAutomationRun(runId: string): Promise<AutomationRun> {
  return request(`/api/automation-runs/${encodeURIComponent(runId)}/cancel`, jsonInit('POST', {}));
}

export function testAutomationAction(serial: string, node: AutomationNode, requestId: string): Promise<{ ok: boolean }> {
  return request(`/api/automation-devices/${encodeURIComponent(serial)}/test-action`, jsonInit('POST', { requestId, node }));
}

export async function captureAutomationScreenshot(serial: string): Promise<AutomationScreenshot> {
  const { blob, headers } = await requestBlob(`/api/automation-devices/${encodeURIComponent(serial)}/screenshot`);
  const width = Number(headers.get('X-Frigg-Screen-Width'));
  const height = Number(headers.get('X-Frigg-Screen-Height'));
  const rotation = Number(headers.get('X-Frigg-Screen-Rotation'));
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || ![0, 1, 2, 3].includes(rotation)) {
    throw new Error('Frigg returned an invalid Android screen size or rotation.');
  }
  return { blob, width, height, rotation: rotation as 0 | 1 | 2 | 3 };
}

export function getAutomationArtifact(runId: string, artifactId: string): Promise<{ blob: Blob; headers: Headers }> {
  return requestBlob(`/api/automation-runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/image`);
}

export function isAutomationRunActive(status: AutomationRunStatus): boolean {
  return status === AUTOMATION_RUN_STATUS.starting ||
    status === AUTOMATION_RUN_STATUS.running ||
    status === AUTOMATION_RUN_STATUS.cancelling;
}
