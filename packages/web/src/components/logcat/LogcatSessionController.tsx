import { useEffect, useRef } from 'react';
import type { LogTarget } from '@frigg/shared';
import { useAppStore } from '../../store';
import { isLogTargetAvailable, LogcatSessionCoordinator } from './session';

function sameTarget(left: LogTarget | null, right: LogTarget | null): boolean {
  return left?.platform === right?.platform && left?.id === right?.id;
}

export default function LogcatSessionController() {
  const logTarget = useAppStore((state) => state.logTarget);
  const logPackage = useAppStore((state) => state.logPackage);
  const activeDevice = useAppStore((state) => state.activeDevice);
  const devices = useAppStore((state) => state.devices);
  const retryVersion = useAppStore((state) => state.logRetryVersion);

  const coordinatorRef = useRef<LogcatSessionCoordinator | null>(null);
  if (coordinatorRef.current === null) {
    coordinatorRef.current = new LogcatSessionCoordinator({
      start: (input) => useAppStore.getState().startLogSession(input),
      stop: () => useAppStore.getState().stopLogSession(),
      onStatus: (status) => useAppStore.setState({ logStatus: status }),
    });
  }
  const coordinator = coordinatorRef.current;

  useEffect(() => {
    let desiredTarget = logTarget;
    let desiredPackage = logPackage;
    if (
      isLogTargetAvailable(activeDevice, devices) &&
      !sameTarget(activeDevice, logTarget)
    ) {
      desiredTarget = activeDevice;
      desiredPackage = '';
      useAppStore.getState().setLogTarget(activeDevice);
    }
    void coordinator.setDesiredSession(desiredTarget, desiredPackage);
  }, [activeDevice, coordinator, devices, logPackage, logTarget]);

  useEffect(() => {
    if (retryVersion > 0) void coordinator.retry();
  }, [coordinator, retryVersion]);

  return null;
}
