export const diagnosticReasons = ['completed', 'stopped_by_user', 'focus_lost', 'backgrounded', 'screen_off', 'settings_changed',
  'verification_started', 'authentication_changed', 'screen_left', 'sensor_unavailable', 'no_sensors', 'storage_unavailable', 'unavailable'] as const;
export type DiagnosticReason = typeof diagnosticReasons[number];
export const diagnosticReasonLabels: Record<DiagnosticReason, string> = {
  completed: 'Five-second test finished', stopped_by_user: 'You stopped the test', focus_lost: 'GhostAuth lost focus',
  backgrounded: 'GhostAuth left the foreground', screen_off: 'Screen turned off', settings_changed: 'Research settings changed',
  verification_started: 'Verification started', authentication_changed: 'Authentication state changed', screen_left: 'Diagnostic screen closed',
  sensor_unavailable: 'Sensor registration unavailable', no_sensors: 'No motion sensors', storage_unavailable: 'Research settings unavailable',
  unavailable: 'Diagnostic unavailable',
};
export type DiagnosticSensor = { samples: number; durationMillis: number; rateHz: number | null; maxGapMillis: number | null;
  quality: 'eligible' | 'too_short' | 'sensor_gap' | 'invalid_samples'; units: 'm/s²' | 'rad/s' };
export type DiagnosticStatus = {
  canStart: boolean; blockedReason: 'running' | 'research_disabled' | 'movement_disabled' | 'not_foreground' | 'storage_unavailable' | 'verification_active' | null;
  accelerometer: boolean; gyroscope: boolean; windowMillis: 5000; state: 'idle' | 'running' | 'complete' | 'stopped';
  run: { id: number; remainingMillis: number; reason: DiagnosticReason | null; acceleration: DiagnosticSensor; rotation: DiagnosticSensor } | null;
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function metric(value: unknown, limit: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= limit; }
function sensor(value: unknown, units: DiagnosticSensor['units']): DiagnosticSensor {
  if (!record(value) || !Number.isSafeInteger(value.samples) || !metric(value.samples, 1000) || !metric(value.durationMillis, 5000)
    || !['eligible', 'too_short', 'sensor_gap', 'invalid_samples'].includes(value.quality as string) || value.units !== units
    || ((value.samples as number) < 2 ? value.durationMillis !== 0 || value.rateHz !== null || value.maxGapMillis !== null
      : !metric(value.rateHz, 1e9) || !metric(value.maxGapMillis, 5000))
    || (value.quality === 'eligible' && ((value.samples as number) < 2 || (value.durationMillis as number) < 2000 || (value.maxGapMillis as number) > 250 || (value.rateHz as number) <= 0)))
    throw Error('Invalid diagnostic sensor data');
  return { samples: value.samples as number, durationMillis: value.durationMillis as number, rateHz: value.rateHz as number | null,
    maxGapMillis: value.maxGapMillis as number | null, quality: value.quality as DiagnosticSensor['quality'], units };
}
export function checkedDiagnosticStatus(value: unknown): DiagnosticStatus {
  if (!record(value) || typeof value.canStart !== 'boolean' || typeof value.accelerometer !== 'boolean' || typeof value.gyroscope !== 'boolean'
    || value.windowMillis !== 5000 || !['idle', 'running', 'complete', 'stopped'].includes(value.state as string)
    || ![null, 'running', 'research_disabled', 'movement_disabled', 'not_foreground', 'storage_unavailable', 'verification_active'].includes(value.blockedReason as null | string)
    || value.canStart !== (value.blockedReason === null) || ((value.state === 'running') !== (value.blockedReason === 'running')))
    throw Error('Invalid diagnostic status');
  let run: DiagnosticStatus['run'] = null;
  if (value.state === 'idle') {
    if (value.run !== null) throw Error('Idle diagnostic contains a run');
  } else {
    const raw = value.run;
    if (!record(raw) || !Number.isSafeInteger(raw.id) || (raw.id as number) < 1 || !metric(raw.remainingMillis, 5000)
      || (value.state === 'running' ? raw.reason !== null : !diagnosticReasons.includes(raw.reason as DiagnosticReason) || raw.remainingMillis !== 0)
      || (value.state === 'complete' && raw.reason !== 'completed') || (value.state === 'stopped' && raw.reason === 'completed'))
      throw Error('Invalid diagnostic run');
    run = { id: raw.id as number, remainingMillis: raw.remainingMillis as number, reason: raw.reason as DiagnosticReason | null,
      acceleration: sensor(raw.acceleration, 'm/s²'), rotation: sensor(raw.rotation, 'rad/s') };
    if ((!value.accelerometer && run.acceleration.samples > 0) || (!value.gyroscope && run.rotation.samples > 0)) throw Error('Unavailable sensor has readings');
  }
  return { canStart: value.canStart, blockedReason: value.blockedReason as DiagnosticStatus['blockedReason'], accelerometer: value.accelerometer,
    gyroscope: value.gyroscope, windowMillis: 5000, state: value.state as DiagnosticStatus['state'], run };
}
