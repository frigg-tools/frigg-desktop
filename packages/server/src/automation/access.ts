import type { LocalUiAccessPorts, LocalUiRequestMetadata } from '../lib/local-ui-access.ts';
import { localUiAccessMiddleware, localUiRequestAllowed } from '../lib/local-ui-access.ts';

export type AutomationRequestMetadata = LocalUiRequestMetadata;
export type AutomationAccessPorts = LocalUiAccessPorts;

export function automationRequestAllowed(metadata: AutomationRequestMetadata): boolean {
  return localUiRequestAllowed(metadata);
}

export function automationAccessMiddleware(ports: AutomationAccessPorts) {
  return localUiAccessMiddleware(
    ports,
    'Automation routes are available only to the local Frigg UI and loopback tools.',
  );
}
