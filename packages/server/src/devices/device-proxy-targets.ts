import {
  ANDROID_DEVICE_STATE,
  IOS_SIMULATOR_PROXY_GROUP_ID,
  IOS_SIMULATOR_STATE,
  androidDeviceProxyId,
  iosPhysicalDeviceProxyId,
} from '@frigg/shared';
import type { AndroidDevice, IosPhysicalDevice, IosSimulator } from '@frigg/shared';
import { getLanIp } from '../lib/net.ts';
import { run } from '../lib/exec.ts';
import { listAndroidDevices } from './android.ts';
import { listBootedSimulators, listPhysicalIosDevices, xcrunStatus } from './ios.ts';
import type { DeviceProxyTarget } from './device-proxy-manager.ts';

let lastAndroidSerials: string[] = [];
let lastSimulatorIds: string[] = [];
let lastPhysicalIds: string[] = [];

export function androidDeviceProxyTarget(device: AndroidDevice, lanIp: string | null): DeviceProxyTarget {
  return {
    id: androidDeviceProxyId(device.serial),
    platform: 'android',
    name: device.avdName ?? device.model,
    host: device.isEmulator ? '10.0.2.2' : lanIp,
  };
}

export function iosSimulatorProxyGroupTarget(hasBootedSimulators = false): DeviceProxyTarget {
  return {
    id: IOS_SIMULATOR_PROXY_GROUP_ID,
    platform: 'ios-simulator',
    name: hasBootedSimulators ? 'Simuladores iOS + proxy compartilhado do Mac' : 'Proxy de sistema do macOS',
    host: '127.0.0.1',
  };
}

export function buildDeviceProxyTargets(
  android: AndroidDevice[],
  iosSimulators: IosSimulator[],
  iosDevices: IosPhysicalDevice[],
  lanIp: string | null,
): DeviceProxyTarget[] {
  return [
    iosSimulatorProxyGroupTarget(iosSimulators.some(
      (simulator) => simulator.state.toLowerCase() === IOS_SIMULATOR_STATE.booted.toLowerCase(),
    )),
    ...android
      .filter((device) => device.state === ANDROID_DEVICE_STATE.connected)
      .map((device) => androidDeviceProxyTarget(device, lanIp)),
    ...iosDevices
      .filter((device) => device.paired)
      .map((device) => ({
        id: iosPhysicalDeviceProxyId(device.udid),
        platform: 'ios-device' as const,
        name: `${device.model} · ${device.name}`,
        host: lanIp,
      })),
  ];
}

export async function listDeviceProxyTargets(lanIp: string | null = getLanIp()): Promise<DeviceProxyTarget[]> {
  const [android, iosSimulators, iosDevices] = await Promise.all([
    listAndroidDevices(),
    listBootedSimulators(),
    listPhysicalIosDevices(),
  ]);
  return buildDeviceProxyTargets(android, iosSimulators, iosDevices, lanIp);
}

export async function readDeviceProxyInventorySnapshot(): Promise<string | null> {
  const [adbResult, xcrun] = await Promise.all([
    run('adb', ['devices']),
    xcrunStatus(),
  ]);

  if (adbResult.ok) {
    lastAndroidSerials = adbResult.stdout
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter(([serial, state]) => serial !== undefined && serial !== '' && state === ANDROID_DEVICE_STATE.connected)
      .map(([serial]) => serial)
      .sort();
  }
  if (xcrun.available) {
    const [iosSimulators, iosDevices] = await Promise.all([listBootedSimulators(), listPhysicalIosDevices()]);
    lastSimulatorIds = iosSimulators
    .filter((simulator) => simulator.state.toLowerCase() === IOS_SIMULATOR_STATE.booted.toLowerCase())
      .map((simulator) => simulator.udid)
      .sort();
    lastPhysicalIds = iosDevices.filter((device) => device.paired).map((device) => device.udid).sort();
  }
  if (!adbResult.ok && !xcrun.available) return null;
  return JSON.stringify({
    androidSerials: lastAndroidSerials,
    simulatorIds: lastSimulatorIds,
    physicalIds: lastPhysicalIds,
    lanIp: getLanIp(),
  });
}
