import type { ComponentType, SVGProps } from 'react';
import type { ToolId } from './i18n';
import {
  IconApi,
  IconBreakpoint,
  IconDatabase,
  IconDevices,
  IconLogcat,
  IconMcp,
  IconMock,
  IconTraffic,
} from './icons';
import TrafficPreview from './components/previews/TrafficPreview';
import ApiPreview from './components/previews/ApiPreview';
import BreakpointPreview from './components/previews/BreakpointPreview';
import MocksPreview from './components/previews/MocksPreview';
import LogcatPreview from './components/previews/LogcatPreview';
import DatabasePreview from './components/previews/DatabasePreview';
import DevicesPreview from './components/previews/DevicesPreview';
import McpPreview from './components/previews/McpPreview';

export interface Tool {
  id: ToolId;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  Preview: ComponentType;
}

export const tools: Tool[] = [
  { id: 'traffic', Icon: IconTraffic, Preview: TrafficPreview },
  { id: 'api', Icon: IconApi, Preview: ApiPreview },
  { id: 'breakpoints', Icon: IconBreakpoint, Preview: BreakpointPreview },
  { id: 'mocks', Icon: IconMock, Preview: MocksPreview },
  { id: 'logcat', Icon: IconLogcat, Preview: LogcatPreview },
  { id: 'database', Icon: IconDatabase, Preview: DatabasePreview },
  { id: 'devices', Icon: IconDevices, Preview: DevicesPreview },
  { id: 'mcp', Icon: IconMcp, Preview: McpPreview },
];
