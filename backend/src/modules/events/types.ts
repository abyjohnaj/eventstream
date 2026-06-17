export const DEVICE_ROLES = ['CAMERA', 'AUDIO', 'DIRECTOR', 'VIEWER'] as const;

export type DeviceRole = (typeof DEVICE_ROLES)[number];

export function isDeviceRole(value: unknown): value is DeviceRole {
  return typeof value === 'string' && DEVICE_ROLES.includes(value as DeviceRole);
}
