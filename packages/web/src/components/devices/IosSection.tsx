import type { IosSimulator, ToolingStatus } from '@frigg/shared';
import Section from './Section';
import EmptyHint from './EmptyHint';
import IosSimulatorCard from './IosSimulatorCard';
import MacProxyCard from './MacProxyCard';

interface IosSectionProps {
  simulators: IosSimulator[];
  tooling: ToolingStatus;
}

export default function IosSection({ simulators, tooling }: IosSectionProps) {
  return (
    <Section title="iOS Simulator" subtitle="booted simulators" count={simulators.length}>
      {simulators.length === 0 ? (
        <EmptyHint
          message={
            tooling.xcrun.available
              ? 'No booted simulators. Start one with:'
              : 'xcrun not found — install Xcode or its command line tools, then start a simulator with:'
          }
          command="open -a Simulator"
        />
      ) : (
        <div className="space-y-2">
          {simulators.map((simulator) => (
            <IosSimulatorCard key={simulator.udid} simulator={simulator} />
          ))}
        </div>
      )}
      <MacProxyCard macosProxy={tooling.macosProxy} />
    </Section>
  );
}
