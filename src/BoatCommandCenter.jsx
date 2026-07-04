import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { applyDeliveredFilter, ShowDeliveredToggle } from './boatFilter';
import './BoatCommandCenter.css';

// Boat "command center" — one screen with everything about a boat, pulled from the
// endpoints the trackers already use. Read-only overview; also the core of the future
// mobile boat view. No new backend needed.

const STAGES = ['Backlog', 'Pre-Production', 'Glass Shop', 'Back Line', 'Front Line', 'QC', 'Delivered'];
const STAGE_C = {
  'Backlog': { bg: '#EEF0F2', fg: '#5F6B73' },
  'Pre-Production': { bg: '#E5EDF3', fg: '#33617F' },
  'Glass Shop': { bg: '#FCEBEB', fg: '#A32D2D' },
  'Back Line': { bg: '#FAEEDA', fg: '#854F0B' },
  'Front Line': { bg: '#FBF3D6', fg: '#7A6310' },
  'QC': { bg: '#E6F0F5', fg: '#1E5E7E' },
  'Delivered': { bg: '#EAF3DE', fg: '#3B6D11' },
};

// Task lists / final states, mirroring the trackers. Transducer Type is info-only (excluded).
const LAM_TASKS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid', 'Other'];
const LAM_FINAL = (t) => (t === 'Glass Kit' ? 'Complete' : 'Pulled');
const FIN_TASKS = ['Hull', 'Liner', 'Ring', 'Hard Top', 'Console', 'Console Face', 'Hatches', 'Leaning Post', 'Buckets', 'Other'];

const KP_FLAGS = [
  { key: 'flag_late', label: 'Late', color: '#A32D2D' },
  { key: 'flag_backordered', label: 'Backordered', color: '#BA7517' },
  { key: 'flag_partial', label: 'Partial', color: '#2E7D8A' },
  { key: 'flag_unsatisfactory', label: 'Unsatisfactory', color: '#185FA5' },
];
const RULE_ICON = { part_overdue: '🕓', parts_unordered: '🛒', backorder_stale: '⏳', stage_stuck: '🐌', flag_stale: '⚠️', lam_stalled: '🧊', ugly_part: '🙁', asap_idle: '🔥', wc_quiet: '💤', build_improvement: '🔧', question: '❓' };

const fmtTime = (iso) => new Date(iso).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ageLabel = (iso) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`; };

function rollup(rows, tasks, finalOf) {
  let done = 0, total = 0;
  for (const t of tasks) {
    const row = rows[t] || {};
    if (row.na) continue;
    total++;
    if ((row.status || '') === finalOf(t)) done++;
  }
  return { done, total };
}

function BoatCommandCenter() {
  const [boats, setBoats] = useState([]);
  const [parts, setParts] = useState([]);
  const [standard, setStandard] = useState([]);
  const [lam, setLam] = useState([]);
  const [fin, setFin] = useState([]);
  const [asm, setAsm] = useState(null);
  const [issues, setIssues] = useState([]);
  const [feed, setFeed] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [showDelivered, setShowDelivered] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const [b, p, std, l, f, a, iss, fd] = await Promise.all([
        apiFetch('/api/boats').then(r => r.json()),
        apiFetch('/api/parts').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/api/parts/standard').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/api/lamination').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/api/finishing').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/api/assembly').then(r => r.ok ? r.json() : null).catch(() => null),
        apiFetch('/api/issues').then(r => r.ok ? r.json() : []).catch(() => []),
        apiFetch('/api/assembly/feed?limit=200').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setBoats(b); setParts(p); setStandard(std); setLam(l); setFin(f); setAsm(a); setIssues(iss); setFeed(fd);
      if (b.length && !selectedId) setSelectedId(b[0].boat_id);
    } catch (e) { alert('Failed to load boat details.'); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading boats...</div>;

  const { visible, delivered } = applyDeliveredFilter(boats, showDelivered);
  const filtered = visible.filter(b =>
    b.boat_id?.toLowerCase().includes(search.toLowerCase()) ||
    b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    b.boat_model?.toLowerCase().includes(search.toLowerCase()));

  const boat = boats.find(b => b.boat_id === selectedId) || filtered[0] || boats[0];

  // ---- rollups for the selected boat ----
  const byTask = (list) => { const m = {}; for (const r of list) if (r.boat_id === boat?.boat_id) m[r.task_name] = r; return m; };
  const lamRoll = rollup(byTask(lam), LAM_TASKS, LAM_FINAL);
  const finRoll = rollup(byTask(fin), FIN_TASKS, () => 'Complete');

  const boatParts = parts.filter(p => p.boat_id === boat?.boat_id);
  const stdNames = (standard || []).map(s => (typeof s === 'string' ? s : s.part_name || s.name)).filter(Boolean);
  const kpTotal = stdNames.length || 16;
  const partRow = (name) => boatParts.find(p => p.part_name === name) || {};
  const kpReceived = stdNames.filter(n => partRow(n).status === 'Received').length;
  const flaggedParts = boatParts.filter(p => KP_FLAGS.some(f => p[f.key]));

  const asmRows = (asm?.rows || []).filter(r => r.boat_id === boat?.boat_id);
  const wcName = (id) => (asm?.work_centers || []).find(w => w.id === id)?.name || id;

  const boatIssues = issues.filter(i => i.boat_id === boat?.boat_id);
  const boatFeed = feed.filter(f => f.boat_id === boat?.boat_id).slice(0, 8);

  const stageIdx = boat ? STAGES.indexOf(boat.global_status) : -1;
  const sc = boat ? (STAGE_C[boat.global_status] || STAGE_C['Backlog']) : STAGE_C['Backlog'];

  const Bar = ({ done, total }) => (
    <div className="cc-bar"><span style={{ width: `${total ? Math.round(done / total * 100) : 0}%`, background: done >= total && total ? '#5C9A2E' : '#2E92D6' }} /></div>
  );

  return (
    <div className="cc">
      <div className="cc-list-panel">
        <input className="cc-search" placeholder="Search boat, customer, model..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="cc-deliv"><ShowDeliveredToggle count={delivered} on={showDelivered} onChange={setShowDelivered} /></div>
        <div className="cc-boats">
          {filtered.map(b => {
            const c = STAGE_C[b.global_status] || STAGE_C['Backlog'];
            return (
              <div key={b.boat_id} className={`cc-boat-row ${boat?.boat_id === b.boat_id ? 'selected' : ''}`} onClick={() => setSelectedId(b.boat_id)}>
                {b.sequence_number ? <span className="cc-seq">{b.sequence_number}</span> : null}
                <span className="cc-boat-main">
                  <span className="cc-boat-id">{b.boat_id} · {b.customer_name}</span>
                  <span className="cc-boat-sub">{b.boat_model} · {b.hull_color}</span>
                </span>
                <span className="cc-boat-stage" style={{ background: c.bg, color: c.fg }}>{b.global_status}</span>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="cc-empty">No boats match.</div>}
        </div>
      </div>

      {boat ? (
        <div className="cc-detail">
          {/* Header */}
          <div className="cc-header">
            <div className="cc-htop">
              {boat.sequence_number ? <span className="cc-hseq" title="Build order">{boat.sequence_number}</span> : null}
              <div className="cc-hid">
                <h2>{boat.boat_id} · {boat.customer_name}</h2>
                <div className="cc-hmeta">{boat.boat_model} · <span className="cc-hhull">{boat.hull_color}</span></div>
              </div>
              <span className="cc-hstage" style={{ background: sc.bg, color: sc.fg }}>{boat.global_status}</span>
            </div>
            {(boat.customer_phone || boat.customer_email) && (
              <div className="cc-contact">
                {boat.customer_phone && <span>📞 {boat.customer_phone}</span>}
                {boat.customer_email && <span>✉️ {boat.customer_email}</span>}
              </div>
            )}
          </div>

          {/* Stage strip */}
          <div className="cc-stages">
            {STAGES.map((s, i) => (
              <div key={s} className={`cc-stage ${i < stageIdx ? 'past' : ''} ${i === stageIdx ? 'now' : ''}`}>
                <span className="cc-stage-dot" />
                <span className="cc-stage-label">{s}</span>
              </div>
            ))}
          </div>

          {/* Summary cards */}
          <div className="cc-cards">
            <div className="cc-card">
              <div className="cc-card-title">Key Parts</div>
              <div className="cc-card-big">{kpReceived} <span>/ {kpTotal}</span></div>
              <div className="cc-card-note">received{flaggedParts.length ? ` · ${flaggedParts.length} flagged` : ''}</div>
              <Bar done={kpReceived} total={kpTotal} />
            </div>
            <div className="cc-card">
              <div className="cc-card-title">Lamination</div>
              <div className="cc-card-big">{lamRoll.done} <span>/ {lamRoll.total}</span></div>
              <div className="cc-card-note">tasks pulled</div>
              <Bar done={lamRoll.done} total={lamRoll.total} />
            </div>
            <div className="cc-card">
              <div className="cc-card-title">Finishing</div>
              <div className="cc-card-big">{finRoll.done} <span>/ {finRoll.total}</span></div>
              <div className="cc-card-note">tasks complete</div>
              <Bar done={finRoll.done} total={finRoll.total} />
            </div>
            <div className="cc-card">
              <div className="cc-card-title">Assembly</div>
              {asmRows.length ? (
                <>
                  <div className="cc-card-big">{asmRows.reduce((a, r) => a + (r.completed_items || 0), 0)} <span>/ {asmRows.reduce((a, r) => a + (r.total_items || 0), 0)}</span></div>
                  <div className="cc-card-note">CompanyCam items</div>
                </>
              ) : <div className="cc-card-note" style={{ marginTop: 8 }}>Not linked to CompanyCam</div>}
            </div>
          </div>

          {/* Needs attention: issues + flagged parts */}
          <div className="cc-section">
            <h3>Needs attention {boatIssues.length + flaggedParts.length > 0 ? `(${boatIssues.length + flaggedParts.length})` : ''}</h3>
            {boatIssues.length === 0 && flaggedParts.length === 0 && <div className="cc-quiet">🎉 Nothing flagged on this boat.</div>}
            {boatIssues.map(iss => (
              <div key={`i${iss.id}`} className="cc-att">
                <span className="cc-att-icon">{RULE_ICON[iss.rule_key] || '⚠️'}</span>
                <span className="cc-att-main"><span className="cc-att-title">{iss.title}</span><span className="cc-att-sub">{iss.source_tab || 'Issue'} · open {ageLabel(iss.created_at)}</span></span>
              </div>
            ))}
            {flaggedParts.map(p => (
              <div key={`p${p.part_name}`} className="cc-att">
                <span className="cc-att-icon">📦</span>
                <span className="cc-att-main">
                  <span className="cc-att-title">{p.part_name}{p.description ? ` — ${p.description}` : ''}</span>
                  <span className="cc-att-sub">Key Parts · {KP_FLAGS.filter(f => p[f.key]).map(f => f.label).join(', ')}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Recent activity */}
          <div className="cc-section">
            <h3>Recent activity</h3>
            {boatFeed.length === 0 && <div className="cc-quiet">No recent activity for this boat.</div>}
            {boatFeed.map(it => (
              <div key={it.id} className="cc-feed">
                <span className="cc-feed-time">{fmtTime(it.created_at)}</span>
                <span className="cc-feed-title">{it.title}{it.work_center_name ? ` · ${it.work_center_name}` : ''}{it.actor_name ? ` — ${it.actor_name}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      ) : <div className="cc-detail"><p>Select a boat.</p></div>}
    </div>
  );
}

export default BoatCommandCenter;
