import { useState } from 'react';
import Modal from '../components/Modal';
import { researchReasonLabels, type ResearchReason } from '../native/research-status';
import { useNativeResearch } from '../native/useNativeResearch';

type Research = ReturnType<typeof useNativeResearch>;
export default function ResearchPanel({ research, onPrivacy }: { research: Research; onPrivacy: () => void }) {
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
      {Object.entries(status.reasons).map(([reason, count]) => <div className="list-row" key={reason}><span className="row-copy"><span className="row-title">{researchReasonLabels[reason as ResearchReason]}</span><span className="row-detail">{count} sessions</span></span></div>)}
    </>}
    <p className="small-copy muted">Only foreground motion summaries and verification diagnostics are saved, encrypted on this device. Raw motion is discarded. No PIN input, typing, fingerprint images or activity inside other apps is collected.</p>
    <p className="small-copy muted">Up to 500 sessions and 10 MiB, retained for 7 days and removed at the next research read or write. Fast fingerprint checks may provide insufficient data; app launch is never held back to collect more.</p>
    <div className="spacer" />
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
