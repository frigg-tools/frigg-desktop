import type { IosPhysicalDevice, IosSimulator, ToolingStatus } from '@frigg/shared';
import { useT } from '../../i18n';
import Section from './Section';
import EmptyHint from './EmptyHint';
import IosSimulatorCard from './IosSimulatorCard';
import PhysicalIosCard from './PhysicalIosCard';
import MacProxyCard from './MacProxyCard';

interface IosSectionProps {
  simulators: IosSimulator[];
  physicalDevices: IosPhysicalDevice[];
  tooling: ToolingStatus;
}

export default function IosSection({ simulators, physicalDevices, tooling }: IosSectionProps) {
  const t = useT();
  return (
    <Section
      title={t('devices.ios.title')}
      subtitle={t('devices.ios.subtitle')}
      count={simulators.length + physicalDevices.length}
    >
      {physicalDevices.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            {t('devices.iosPhysical.heading')}
          </p>
          {physicalDevices.map((device) => (
            <PhysicalIosCard key={device.udid} device={device} />
          ))}
        </div>
      ) : null}
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
