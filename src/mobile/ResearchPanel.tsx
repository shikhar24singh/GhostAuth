import { useState } from 'react';
import Modal from '../components/Modal';
import { researchReasonLabels, researchStopLabels, type ResearchReason, type ResearchStop, type SensorDiagnostics } from '../native/research-status';
import { useNativeResearch } from '../native/useNativeResearch';

type Research = ReturnType<typeof useNativeResearch>;
function SensorDetails({ name, sensor }: { name: string; sensor: SensorDiagnostics }) {
  return <div className="list-row"><span className="row-copy"><span className="row-title">{name} delivery</span>
    <span className="row-detail">{sensor.windows === 0 ? 'No readings in retained fingerprint checks' : <>{sensor.windows} sampled windows · {sensor.usableWindows} usable<br />Median window {(sensor.medianDurationMillis! / 1000).toFixed(2)} s{sensor.medianRateHz !== null ? <> · median rate {sensor.medianRateHz.toFixed(1)} Hz<br />Largest gap {sensor.maxGapMillis} ms</> : <><br />Too few readings to measure rate or gaps</>}</>}</span>
  </span></div>;
}
export default function ResearchPanel({ research, onPrivacy, onDiagnostic }: { research: Research; onPrivacy: () => void; onDiagnostic: () => void }) {
  const [dialog, setDialog] = useState<'enable' | 'clear' | null>(null);
  const status = research.status;
  async function confirm() {
    const ok = dialog === 'enable' ? await research.configure({ enabled: true }) : await research.clear();
    if (ok) setDialog(null);
  }
  return <>
    <div className="note"><p className="eyebrow">Collection pilot</p><p className="small-copy">Optional motion research during GhostAuth verification. Fingerprint and PIN remain required. No behavioral model runs in this build.</p></div>
    {research.error && <p role="alert" className="form-error">{research.error}</p>}
    {research.loading && <p role="status" className="small-copy">Refreshing research data…</p>}
    {status && <>
      <div className="list-row"><span className="row-copy"><span className="row-title">Collection status</span><span className="row-detail">{status.pausedForError ? 'Stopped · storage needs attention' : !status.enabled ? 'Off' : !status.movementAllowed ? 'Motion paused · Movement signals disabled' : status.collecting ? 'Sampling motion' : 'Enabled · waiting for verification'}</span></span></div>
      <div className="list-row"><span className="row-copy"><span className="row-title">Retained sessions</span><span className="row-detail">{status.total} total · {status.eligible} usable · {status.rejected} insufficient or unverified</span></span></div>
      <div className="list-row"><span className="row-copy"><span className="row-title">Motion sensors</span><span className="row-detail">Accelerometer {status.accelerometer ? 'available' : 'missing'} · Gyroscope {status.gyroscope ? 'available' : 'missing'}</span></span></div>
      <div className="section-label"><span>Retained fingerprint coverage</span></div>
      <div className="list-row"><span className="row-copy"><span className="row-title">Usable fingerprint checks</span><span className="row-detail">{status.diagnostics.fingerprintSessions === 0 ? 'No retained fingerprint checks yet' : `${status.diagnostics.usableFingerprintSessions} of ${status.diagnostics.fingerprintSessions} (${(100 * status.diagnostics.usableFingerprintSessions / status.diagnostics.fingerprintSessions).toFixed(1)}%)`}<br />{status.diagnostics.pinSessions} PIN checks excluded from this percentage</span></span></div>
      {status.eligible > 0 && <div className="list-row"><span className="row-copy"><span className="row-title">Usable sensor combinations</span><span className="row-detail">Both sensors {status.diagnostics.bothSensorsUsable} · accelerometer only {status.diagnostics.acceleration.usableWindows - status.diagnostics.bothSensorsUsable} · gyroscope only {status.diagnostics.rotation.usableWindows - status.diagnostics.bothSensorsUsable}</span></span></div>}
      <SensorDetails name="Accelerometer" sensor={status.diagnostics.acceleration} />
      <SensorDetails name="Gyroscope" sensor={status.diagnostics.rotation} />
      {status.diagnostics.fingerprintSessions > 0 && <><div className="section-label"><span>Why fingerprint capture stopped</span></div>
        {Object.entries(status.diagnostics.stops).map(([stop, count]) => <div className="list-row" key={stop}><span className="row-copy"><span className="row-title">{researchStopLabels[stop as ResearchStop]}</span><span className="row-detail">{count} checks</span></span></div>)}
      </>}
      {status.total > 0 && <div className="section-label"><span>Session quality outcomes</span></div>}
      {Object.entries(status.reasons).map(([reason, count]) => <div className="list-row" key={reason}><span className="row-copy"><span className="row-title">{researchReasonLabels[reason as ResearchReason]}</span><span className="row-detail">{count} sessions</span></span></div>)}
    </>}
    <p className="small-copy muted">Only foreground motion summaries and verification diagnostics are saved, encrypted on this device. Raw motion is discarded. No PIN input, typing, fingerprint images or activity inside other apps is collected.</p>
    <p className="small-copy muted">Up to 500 sessions and 10 MiB, retained for 7 days and removed at the next research read or write. Fast fingerprint checks may provide insufficient data; app launch is never held back to collect more.</p>
    <p className="small-copy muted">Coverage describes retained fingerprint checks recorded while enrolled, including checks with Movement signals disabled. Sensor medians describe windows with readings, including insufficient or unverified windows. Stop reasons show the first observed interruption; losing focus does not identify which system window appeared. These measurements are not authentication accuracy or launch-delay measurements.</p>
    <div className="spacer" />
    <button className="action-button secondary" onClick={onDiagnostic}><span>Open motion diagnostic</span></button>
    {status && <button className="action-button" disabled={research.busy || research.loading || (!status.enabled && !status.movementAllowed)} onClick={() => status.enabled ? void research.configure({ enabled: false }) : setDialog('enable')}><span>{status.enabled ? 'Pause research collection' : 'Enable research collection'}</span></button>}
    {status && !status.movementAllowed && <p className="small-copy muted">Enable Movement signals in Privacy & data before starting motion research. While enrolled, verification diagnostics still record; Pause research collection stops those too.</p>}
    <button className="action-button secondary" disabled={research.busy} onClick={onPrivacy}><span>Review privacy choices</span></button>
    <button className="action-button secondary" disabled={research.busy || research.loading} onClick={() => void research.refresh()}><span>Refresh research data</span></button>
    <button className="action-button secondary" disabled={research.busy} onClick={() => setDialog('clear')}><span>Clear research data</span></button>
    {dialog && <Modal title={dialog === 'enable' ? 'Enable motion research?' : 'Clear research data?'} onClose={() => { if (!research.busy) setDialog(null); }}>
      <p>{dialog === 'enable' ? 'Allow accelerometer and gyroscope summaries while GhostAuth is visible and focused during fingerprint verification? Collection ends after 10 seconds or when focus is lost. PIN flows save outcome diagnostics only. Data stays encrypted here for up to 7 days, with no upload. This does not provide behavioral protection.' : 'Delete all research summaries and pending samples? Your PIN, fingerprint, protected apps and security history are kept. Your research consent stays the same.'}</p>
      {research.error && <p role="alert" className="form-error">{research.error}</p>}
      <div className="dialog-actions"><button className="action-button" disabled={research.busy} onClick={() => void confirm()}><span>{research.busy ? 'Saving…' : dialog === 'enable' ? 'Agree and enable' : 'Delete research data'}</span></button><button className="action-button secondary" disabled={research.busy} onClick={() => setDialog(null)}><span>Cancel</span></button></div>
    </Modal>}
  </>;
}
