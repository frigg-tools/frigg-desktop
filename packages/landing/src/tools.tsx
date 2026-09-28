import type { ComponentType, SVGProps } from 'react';
import type { ToolId } from './i18n';
import {
  IconApi,
  IconBreakpoint,
  IconDatabase,
  IconDevices,
  IconFrida,
  IconLogcat,
  IconMcp,
  IconMock,
  IconSql,
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
import SqlPreview from './components/previews/SqlPreview';
import FridaPreview from './components/previews/FridaPreview';

export type ToolGroupId = 'network' | 'device' | 'advanced';

export interface Tool {
  id: ToolId;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  Preview: ComponentType;
}

export interface ToolGroup {
  id: ToolGroupId;
  tools: Tool[];
}

export const toolGroups: ToolGroup[] = [
  {
    id: 'network',
    tools: [
      { id: 'traffic', Icon: IconTraffic, Preview: TrafficPreview },
      { id: 'api', Icon: IconApi, Preview: ApiPreview },
      { id: 'breakpoints', Icon: IconBreakpoint, Preview: BreakpointPreview },
      { id: 'mocks', Icon: IconMock, Preview: MocksPreview },
    ],
  },
  {
    id: 'device',
    tools: [
      { id: 'devices', Icon: IconDevices, Preview: DevicesPreview },
      { id: 'logcat', Icon: IconLogcat, Preview: LogcatPreview },
      { id: 'database', Icon: IconDatabase, Preview: DatabasePreview },
    ],
  },
  {
    id: 'advanced',
    tools: [
      { id: 'sql', Icon: IconSql, Preview: SqlPreview },
      { id: 'frida', Icon: IconFrida, Preview: FridaPreview },
      { id: 'mcp', Icon: IconMcp, Preview: McpPreview },
    ],
  },
];

export const tools = toolGroups.flatMap((group) => group.tools);
