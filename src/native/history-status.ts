import { validPackageName } from '../mobile/preferences.ts';
import type { SecurityEvent } from '../mobile/state.ts';

export const historyOutcomes = ['verified', 'failed', 'canceled', 'locked-out', 'unavailable'] as const;
export type HistoryOutcome = typeof historyOutcomes[number];
export type HistoryStatus = { enabled: boolean; events: SecurityEvent[]; error?: string };
export const historyReasons: Record<HistoryOutcome, string> = {
  verified: 'Android identity verification completed.', failed: 'Identity check did not match.',
  canceled: 'Fingerprint verification was canceled.', 'locked-out': 'Verification was denied during lockout.',
  unavailable: 'Fingerprint verification was unavailable.',
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function checkedHistoryStatus(value: unknown): HistoryStatus {
  if (!record(value) || typeof value.enabled !== 'boolean' || !Array.isArray(value.entries) || value.entries.length > 100
    || (value.error !== undefined && (typeof value.error !== 'string' || !value.error || value.error.length > 256))) throw Error('Invalid history response');
  let previousId = Number.MAX_SAFE_INTEGER;
  const events = value.entries.map(entry => {
    if (!record(entry) || !Number.isSafeInteger(entry.id) || (entry.id as number) < 1 || (entry.id as number) >= previousId
      || !Number.isSafeInteger(entry.occurredAt) || (entry.occurredAt as number) < 1 || (entry.occurredAt as number) > 8_640_000_000_000_000
      || typeof entry.packageName !== 'string' || !validPackageName(entry.packageName)
      || typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 160
      || !['PIN', 'fingerprint'].includes(entry.method as string) || !historyOutcomes.includes(entry.outcome as HistoryOutcome)) throw Error('Invalid history entry');
    previousId = entry.id as number;
    const outcome = entry.outcome as HistoryOutcome;
    return { id: previousId, app: entry.packageName, appLabel: entry.label, occurredAt: entry.occurredAt as number,
      time: '', decision: outcome === 'verified' ? 'verified' : 'failed', method: entry.method as 'PIN' | 'fingerprint',
      outcome, reason: historyReasons[outcome] } satisfies SecurityEvent;
  });
  return { enabled: value.enabled, events, ...(value.error ? { error: value.error as string } : {}) };
}
export function eventTime(event: SecurityEvent): string {
  if (!event.occurredAt) return `Today, ${event.time}`;
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(event.occurredAt);
}
export function eventOutcome(event: SecurityEvent): string {
  if (event.outcome === 'canceled') return 'verification canceled';
  if (event.outcome === 'locked-out') return 'verification locked out';
  if (event.outcome === 'unavailable') return 'fingerprint unavailable';
  return event.decision === 'verified' ? `verified with ${event.method}` : event.decision === 'allowed' ? 'access allowed'
    : event.decision === 'failed' ? 'verification failed' : 'access restricted';
}
