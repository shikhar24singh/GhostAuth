export const researchReasons = ['eligible', 'not_verified', 'too_short', 'sensor_gap', 'invalid_samples', 'movement_disabled',
  'pin_flow', 'focus_lost', 'no_sensors', 'sensor_unavailable', 'window_limit', 'verification_finished'] as const;
export type ResearchReason = typeof researchReasons[number];
export const researchStops = ['too_short', 'movement_disabled', 'pin_flow', 'focus_lost', 'no_sensors', 'sensor_unavailable',
  'window_limit', 'verification_finished', 'backgrounded', 'screen_locked', 'canceled', 'request_replaced'] as const;
export type ResearchStop = typeof researchStops[number];
export type SensorDiagnostics = {
  windows: number; usableWindows: number; medianDurationMillis: number | null; medianRateHz: number | null; maxGapMillis: number | null;
};
export type ResearchDiagnostics = {
  fingerprintSessions: number; pinSessions: number; usableFingerprintSessions: number; bothSensorsUsable: number;
  stops: Partial<Record<ResearchStop, number>>; acceleration: SensorDiagnostics; rotation: SensorDiagnostics;
};
export type ResearchStatus = {
  enabled: boolean; movementAllowed: boolean; collecting: boolean; pausedForError: boolean;
  total: number; eligible: number; rejected: number; accelerometer: boolean; gyroscope: boolean;
  reasons: Partial<Record<ResearchReason, number>>; diagnostics: ResearchDiagnostics; error?: string;
};
export const researchStopLabels: Record<ResearchStop, string> = {
  too_short: 'No sampling window', movement_disabled: 'Movement signals disabled', pin_flow: 'PIN flow', focus_lost: 'GhostAuth lost focus',
  no_sensors: 'No motion sensors', sensor_unavailable: 'Sensor registration unavailable', window_limit: '10-second limit reached',
  verification_finished: 'Verification finished', backgrounded: 'GhostAuth left the foreground', screen_locked: 'Screen turned off',
  canceled: 'Verification canceled', request_replaced: 'Another verification started',
};
export const researchReasonLabels: Record<ResearchReason, string> = {
  eligible: 'Usable motion', not_verified: 'Verification did not complete successfully', too_short: 'Too little motion data',
  sensor_gap: 'Gaps in sensor delivery', invalid_samples: 'Invalid or unreliable readings', movement_disabled: 'Movement signals disabled',
  pin_flow: 'PIN flow excluded from motion capture', focus_lost: 'GhostAuth lost focus before sampling', no_sensors: 'No motion sensors',
  sensor_unavailable: 'Sensor registration unavailable', window_limit: 'Capture window ended', verification_finished: 'Verification finished before sampling',
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function count(value: unknown, max = 500): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max; }
function metric(value: unknown, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max; }
function sensorDiagnostics(value: unknown, sessions: number): SensorDiagnostics {
  if (!record(value) || !count(value.windows, sessions) || !count(value.usableWindows, value.windows)
    || (value.windows === 0 ? value.medianDurationMillis !== null || value.medianRateHz !== null || value.maxGapMillis !== null
      : !metric(value.medianDurationMillis, 10_000))
    || (value.medianRateHz === null ? value.maxGapMillis !== null || value.usableWindows > 0
      : !metric(value.medianRateHz, 1_000_000_000) || !metric(value.maxGapMillis, 10_000))) throw Error('Invalid sensor diagnostics');
  return { windows: value.windows, usableWindows: value.usableWindows, medianDurationMillis: value.medianDurationMillis as number | null,
    medianRateHz: value.medianRateHz as number | null, maxGapMillis: value.maxGapMillis as number | null };
}
function checkedDiagnostics(value: unknown, total: number, eligible: number): ResearchDiagnostics {
  if (!record(value) || !count(value.fingerprintSessions) || !count(value.pinSessions)
    || value.fingerprintSessions + value.pinSessions !== total || value.usableFingerprintSessions !== eligible
    || !count(value.usableFingerprintSessions, value.fingerprintSessions) || !count(value.bothSensorsUsable, eligible) || !record(value.stops))
    throw Error('Invalid research coverage');
  let stopped = 0;
  const stops: ResearchDiagnostics['stops'] = {};
  for (const [key, n] of Object.entries(value.stops)) {
    if (!researchStops.includes(key as ResearchStop) || !count(n) || n === 0) throw Error('Invalid capture stops');
    stopped += n; stops[key as ResearchStop] = n;
  }
  if (stopped !== value.fingerprintSessions) throw Error('Invalid capture stop totals');
  const acceleration = sensorDiagnostics(value.acceleration, value.fingerprintSessions), rotation = sensorDiagnostics(value.rotation, value.fingerprintSessions);
  if (value.bothSensorsUsable > Math.min(acceleration.usableWindows, rotation.usableWindows)
    || acceleration.usableWindows + rotation.usableWindows - value.bothSensorsUsable !== eligible) throw Error('Invalid sensor combinations');
  return { fingerprintSessions: value.fingerprintSessions, pinSessions: value.pinSessions, usableFingerprintSessions: value.usableFingerprintSessions,
    bothSensorsUsable: value.bothSensorsUsable, stops, acceleration, rotation };
}
export function checkedResearchStatus(value: unknown): ResearchStatus {
  if (!record(value) || ['enabled', 'movementAllowed', 'collecting', 'pausedForError', 'accelerometer', 'gyroscope'].some(key => typeof value[key] !== 'boolean')
    || ['total', 'eligible', 'rejected'].some(key => !Number.isSafeInteger(value[key]) || (value[key] as number) < 0 || (value[key] as number) > 500)
    || (value.eligible as number) + (value.rejected as number) !== value.total || !record(value.reasons)
    || (value.error !== undefined && (typeof value.error !== 'string' || !value.error || value.error.length > 256))) throw Error('Invalid research response');
  let total = 0;
  for (const [key, count] of Object.entries(value.reasons)) {
    if (!researchReasons.includes(key as ResearchReason) || !Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 500) throw Error('Invalid research counts');
    total += count as number;
  }
  if (total !== value.total || (value.reasons.eligible ?? 0) !== value.eligible
    || (value.collecting && (!value.enabled || !value.movementAllowed || value.pausedForError))) throw Error('Invalid research state');
  const diagnostics = checkedDiagnostics(value.diagnostics, value.total as number, value.eligible as number);
  return { enabled: value.enabled as boolean, movementAllowed: value.movementAllowed as boolean, collecting: value.collecting as boolean,
    pausedForError: value.pausedForError as boolean, total: value.total as number, eligible: value.eligible as number, rejected: value.rejected as number,
    accelerometer: value.accelerometer as boolean, gyroscope: value.gyroscope as boolean,
    reasons: { ...value.reasons } as ResearchStatus['reasons'], diagnostics, ...(value.error ? { error: value.error as string } : {}) };
}
