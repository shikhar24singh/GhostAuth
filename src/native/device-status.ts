import type { AppInfo, Permission } from '../mobile/state.ts';
import { validPackageName } from '../mobile/preferences.ts';

export type ProtectionStatus = { configured: boolean; enabled: boolean; connected: boolean; packages: string[];
  pending?: { packageName: string; id: string }; error?: string };
export type DeviceStatus = { apps: AppInfo[]; permissions: Record<Permission, boolean>; protection: ProtectionStatus };

export function checkedDeviceStatus(value: unknown): DeviceStatus {
  if (!value || typeof value !== 'object' || !('apps' in value) || !Array.isArray(value.apps)
    || !('permissions' in value) || !value.permissions || typeof value.permissions !== 'object') {
    throw new Error('Invalid Android device status');
  }
  const permissions = value.permissions as Record<string, unknown>;
  if (typeof permissions.usage !== 'boolean' || typeof permissions.notifications !== 'boolean'
    || typeof permissions.service !== 'boolean') throw new Error('Invalid Android permission status');
  const raw = 'protection' in value ? value.protection : { configured: false, enabled: false, connected: false, packages: [] };
  if (!raw || typeof raw !== 'object' || !('configured' in raw) || typeof raw.configured !== 'boolean'
    || !('enabled' in raw) || typeof raw.enabled !== 'boolean' || !('connected' in raw) || typeof raw.connected !== 'boolean'
    || !('packages' in raw) || !Array.isArray(raw.packages) || raw.packages.some(id => typeof id !== 'string' || !validPackageName(id) || id === 'com.ghostauth.app')
    || permissions.service !== (raw.enabled && raw.connected)) throw new Error('Invalid protection status');
  const protection: ProtectionStatus = { configured: raw.configured, enabled: raw.enabled, connected: raw.connected, packages: [...new Set(raw.packages)] };
  if ('error' in raw && typeof raw.error === 'string') protection.error = raw.error;
  if ('pending' in raw && raw.pending != null) {
    const pending = raw.pending;
    if (!pending || typeof pending !== 'object' || !('packageName' in pending) || typeof pending.packageName !== 'string'
      || !protection.enabled || !protection.connected || !protection.packages.includes(pending.packageName)
      || !('id' in pending) || typeof pending.id !== 'string' || !pending.id || pending.id.length > 100) throw new Error('Invalid protection request');
    protection.pending = { packageName: pending.packageName, id: pending.id };
  }
  const apps: AppInfo[] = [];
  const seen = new Set<string>();
  for (const entry of value.apps) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !validPackageName(entry.id)
      || typeof entry.name !== 'string' || !entry.name.trim()) throw new Error('Invalid installed app');
    if (seen.has(entry.id) || entry.id === 'com.ghostauth.app') continue;
    seen.add(entry.id);
    const icon = typeof entry.icon === 'string' && entry.icon.length <= 65_536
      && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(entry.icon) ? entry.icon : undefined;
    apps.push({ id: entry.id, name: entry.name.trim(), description: entry.id, ...(icon ? { icon } : {}) });
  }
  apps.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  if (protection.pending && !apps.some(app => app.id === protection.pending!.packageName)) throw new Error('Unavailable protected app');
  return { apps, permissions: { usage: permissions.usage, notifications: permissions.notifications, service: permissions.service }, protection };
}
