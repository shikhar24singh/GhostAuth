export const researchReasons = ['eligible', 'not_verified', 'too_short', 'sensor_gap', 'invalid_samples', 'movement_disabled',
  'pin_flow', 'focus_lost', 'no_sensors', 'sensor_unavailable', 'window_limit', 'verification_finished'] as const;
export type ResearchReason = typeof researchReasons[number];
export type ResearchStatus = {
  enabled: boolean; movementAllowed: boolean; collecting: boolean; pausedForError: boolean;
  total: number; eligible: number; rejected: number; accelerometer: boolean; gyroscope: boolean;
  reasons: Partial<Record<ResearchReason, number>>; error?: string;
};
export const researchReasonLabels: Record<ResearchReason, string> = {
  eligible: 'Usable motion', not_verified: 'Verification did not complete successfully', too_short: 'Too little motion data',
  sensor_gap: 'Gaps in sensor delivery', invalid_samples: 'Invalid or unreliable readings', movement_disabled: 'Movement signals disabled',
  pin_flow: 'PIN flow excluded from motion capture', focus_lost: 'GhostAuth lost focus before sampling', no_sensors: 'No motion sensors',
  sensor_unavailable: 'Sensor registration unavailable', window_limit: 'Capture window ended', verification_finished: 'Verification finished before sampling',
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
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
  return value as ResearchStatus;
}
