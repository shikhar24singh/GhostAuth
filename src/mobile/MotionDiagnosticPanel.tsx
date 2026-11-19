import { useState } from 'react';
import Modal from '../components/Modal';
import { diagnosticReasonLabels, type DiagnosticSensor } from '../native/diagnostic-status';
import { useMotionDiagnostic } from '../native/useMotionDiagnostic';

function SensorResult({ title, sensor }: { title: string; sensor: DiagnosticSensor }) {
  const quality = { eligible: 'Sufficient delivery', too_short: 'Too little data', sensor_gap: 'Gaps in delivery', invalid_samples: 'Invalid or unreliable readings' };
  return <div className="list-row"><span className="row-copy"><span className="row-title">{title}</span><span className="row-detail">
    {sensor.samples} samples · {(sensor.durationMillis / 1000).toFixed(3)} s<br />
    {sensor.rateHz === null ? 'Rate and gap unavailable' : <>{sensor.rateHz.toFixed(2)} Hz · largest gap {sensor.maxGapMillis} ms</>}<br />
    {quality[sensor.quality]}
  </span></span></div>;
}
export default function MotionDiagnosticPanel({ onBack }: { onBack: () => void }) {
  const diagnostic = useMotionDiagnostic();
  const [consent, setConsent] = useState(false);
  const status = diagnostic.status, running = status?.state === 'running';
  async function start() { if (await diagnostic.start()) setConsent(false); }
  return <>
    <div className="note"><p className="eyebrow">Sensor delivery test</p><p className="small-copy">This separate five-second test checks motion sensors while GhostAuth stays visible. It does not verify identity, train your profile or change app access.</p></div>
    {diagnostic.loading && <p className="small-copy" role="status">Preparing the diagnostic…</p>}
    {diagnostic.error && <p className="form-error" role="alert">{diagnostic.error}</p>}
    {diagnostic.notice && <p className="small-copy" role="status">{diagnostic.notice}</p>}
    {status && <>
      <div className="list-row"><span className="row-copy"><span className="row-title">Diagnostic status</span><span className="row-detail">
        {running ? `Collecting · ${Math.ceil(status.run!.remainingMillis / 1000)} seconds remaining` : status.state === 'idle' ? 'Ready for an explicit test' : diagnosticReasonLabels[status.run!.reason!]}
      </span></span></div>
      <div className="list-row"><span className="row-copy"><span className="row-title">Motion sensors</span><span className="row-detail">Accelerometer {status.accelerometer ? 'available' : 'missing'} · Gyroscope {status.gyroscope ? 'available' : 'missing'}</span></span></div>
      {status.blockedReason === 'research_disabled' && <p className="small-copy">Enable motion research on the previous screen before running this separate test.</p>}
      {status.blockedReason === 'movement_disabled' && <p className="small-copy">Enable Movement signals in Privacy & data and save before starting.</p>}
      {status.blockedReason === 'not_foreground' && <p className="small-copy">Keep GhostAuth visible and focused to start a new test.</p>}
      {status.blockedReason === 'storage_unavailable' && <p className="small-copy">Research settings are unavailable. Review motion research before starting.</p>}
      {status.blockedReason === 'verification_active' && <p className="small-copy">Finish or cancel the current verification before starting this separate test.</p>}
      {status.run && <><div className="section-label"><span>Diagnostic delivery only</span></div>
        <SensorResult title="Accelerometer test" sensor={status.run.acceleration} />
        <SensorResult title="Gyroscope test" sensor={status.run.rotation} />
      </>}
    </>}
    <p className="small-copy muted">Hold the phone comfortably and keep this screen open. Requested delivery is 20 Hz. The test stops when you leave, lose focus, lock the screen or change research settings. It does not resume by itself.</p>
    <p className="small-copy muted">Only the latest diagnostic result is held temporarily in memory. Raw readings and results are not saved to storage or added to verification coverage. Copy results puts the displayed summary on your clipboard.</p>
    <div className="spacer" />
    {running ? <button className="action-button" disabled={diagnostic.busy} onClick={() => void diagnostic.stop()}>Stop test</button>
      : <button className="action-button" disabled={diagnostic.busy || !status?.canStart} onClick={() => setConsent(true)}>Start five-second test</button>}
    <button className="action-button secondary" disabled={diagnostic.busy || !status?.run || running} onClick={() => void diagnostic.copy()}>Copy results</button>
    <button className="action-button secondary" disabled={diagnostic.busy || !status?.run} onClick={() => void diagnostic.clear()}>Clear diagnostic result</button>
    <button className="action-button secondary" disabled={diagnostic.busy} onClick={() => void diagnostic.refresh()}>Refresh diagnostic</button>
    <button className="action-button secondary" onClick={onBack}>Back to motion research</button>
    {consent && <Modal title="Run a motion diagnostic?" onClose={() => { if (!diagnostic.busy) setConsent(false); }}>
      <p>Allow a separate five-second accelerometer and gyroscope test while this screen is visible and focused? Delivery counts, durations, rates and gaps stay temporarily in memory. There is no fingerprint prompt, upload, profile training or change to app protection. Leaving or losing focus stops this run.</p>
      {diagnostic.error && <p className="form-error" role="alert">{diagnostic.error}</p>}
      <div className="dialog-actions"><button className="action-button" disabled={diagnostic.busy} onClick={() => void start()}>{diagnostic.busy ? 'Starting…' : 'Agree and start test'}</button>
        <button className="action-button secondary" disabled={diagnostic.busy} onClick={() => setConsent(false)}>Cancel</button></div>
    </Modal>}
  </>;
}
