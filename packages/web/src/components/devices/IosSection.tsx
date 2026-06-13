import type { IosSimulator, ToolingStatus } from '@frigg/shared';
import { useT } from '../../i18n';
import Section from './Section';
import EmptyHint from './EmptyHint';
import IosSimulatorCard from './IosSimulatorCard';
import MacProxyCard from './MacProxyCard';

interface IosSectionProps {
  simulators: IosSimulator[];
  tooling: ToolingStatus;
}

export default function IosSection({ simulators, tooling }: IosSectionProps) {
  const t = useT();
  return (
    <Section
      title={t('devices.ios.title')}
      subtitle={t('devices.ios.subtitle')}
      count={simulators.length}
    >
      {simulators.length === 0 ? (
        <EmptyHint
          message={
            tooling.xcrun.available
              ? t('devices.ios.emptyBooted')
              : t('devices.ios.emptyXcrunMissing')
          }
          command={t('devices.ios.emptyCommand')}
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
