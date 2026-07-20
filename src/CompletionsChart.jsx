import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import './CompletionsChart.css';

// Daily jobs-completed, stacked by department. Prefers a proper backend metrics
// endpoint (deep history); falls back to classifying recent activity-feed events
// so the chart shows something before that endpoint ships.

// Department colors match the Shop Feed's issue categories, so a department is the
// same color everywhere in the app.
// QC is split out from Assembly: QC items get checked off in bursts and badly
// exaggerate how much assembly work actually happened.
const ALL_DEPTS = [
  { key: 'glass', label: 'Glass Shop', color: '#2E7D8A' },
  { key: 'finishing', label: 'Finishing', color: '#A32D2D' },
  { key: 'assembly', label: 'Assembly', color: '#5C9A2E' },
  { key: 'qc', label: 'QC', color: '#534AB7' },
];
const RANGES = [14, 30, 60, 90];
const ZERO = () => ({ glass: 0, finishing: 0, assembly: 0, qc: 0 });

// Feed-event → department (only shop-build completion events count; parts excluded).
const doneLam = (t) => /→\s*(Complete\/On Mold|Pulled|Complete)\s*$/.test(t || '');
const doneFin = (t) => /→\s*Complete\s*$/.test(t || '');
const normName = (s) => String(s).replace(/\*\*|__/g, '').trim().toLowerCase();
// Feed events don't carry a work center, so a QC checkoff is identified by matching
// its title against that boat's quality-control checklist. Verified against live
// data: 44 QC / 73 non-QC with zero ambiguous and zero unmatched.
function classify(ev, qcNames) {
  if (ev.type === 'CHECKLIST_ITEM_COMPLETED' || ev.type === 'CHECKLIST_COMPLETED') {
    const set = qcNames && qcNames[ev.boat_id];
    return set && set.has(normName(ev.title)) ? 'qc' : 'assembly';
  }
  if (ev.type === 'APP_TASK_UPDATED') {
    const wc = (ev.work_center_name || '').toLowerCase();
    if (wc.includes('lamination') && doneLam(ev.title)) return 'glass';
    if (wc.includes('finishing') && doneFin(ev.title)) return 'finishing';
  }
  return null;
}

function lastNDates(n) {
  const out = []; const d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(x.toISOString().slice(0, 10)); }
  return out;
}
function deriveFromFeed(events, days, qcNames) {
  const map = {};
  for (const ev of events || []) {
    const dept = classify(ev, qcNames); if (!dept) continue;
    const date = (ev.created_at || '').slice(0, 10); if (!date) continue;
    (map[date] ||= ZERO())[dept]++;
  }
  return lastNDates(days).map(date => ({ date, ...(map[date] || ZERO()) }));
}
const mmdd = (iso) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };

// `embedded` (e.g. in the Shop Report) hides the title + range toggle and uses a
// fixed range — the host provides the heading.
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

function CompletionsChart({ embedded = false, days: fixedDays = 30 }) {
  const [days, setDays] = useState(fixedDays);
  const [data, setData] = useState(null);
  const [source, setSource] = useState(''); // 'metrics' | 'feed' | 'none'
  const [rawEvents, setRawEvents] = useState([]); // feed events, for the drill-down
  const [qcNames, setQcNames] = useState({});     // boat_id -> Set of QC item names
  const [hasQC, setHasQC] = useState(false);      // does this data source separate QC?
  const [pick, setPick] = useState(null); // { date, dept } clicked bar segment

  useEffect(() => {
    let alive = true;
    (async () => {
      setData(null); setPick(null);
      // Feed powers the click-to-see-jobs drill-down and the fallback counts;
      // the assembly board tells us which item names belong to Quality Control.
      const [fev, asm] = await Promise.all([
        apiFetch('/api/assembly/feed?limit=1000').then(r => (r.ok ? r.json() : [])).catch(() => []),
        apiFetch('/api/assembly').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const qmap = {};
      for (const row of (asm?.rows || [])) {
        if (row.work_center_id !== 'quality-control') continue;
        const set = qmap[row.boat_id] || (qmap[row.boat_id] = new Set());
        for (const i of (row.items || [])) set.add(normName(i.name));
      }
      if (!alive) return;
      setRawEvents(fev); setQcNames(qmap);

      // Prefer the metrics endpoint for deep history. It only splits QC out once the
      // backend sends a `qc` bucket — until then we hide the QC series rather than
      // draw a misleading always-zero bar while assembly still contains QC.
      const r = await apiFetch(`/api/metrics/completions?days=${days}`).catch(() => null);
      if (r && r.ok) {
        const rows = await r.json();
        const byDate = {}; for (const x of rows) byDate[x.date] = x;
        if (alive) {
          setSource('metrics');
          setHasQC(rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], 'qc'));
          setData(lastNDates(days).map(date => ({ date, ...ZERO(), ...(byDate[date] || {}) })));
        }
        return;
      }
      if (fev.length) { if (alive) { setSource('feed'); setHasQC(true); setData(deriveFromFeed(fev, days, qmap)); } return; }
      if (alive) { setSource('none'); setHasQC(false); setData([]); }
    })();
    return () => { alive = false; };
  }, [days]);

  // Only show QC as its own series where the data actually separates it.
  const DEPTS = ALL_DEPTS.filter(d => d.key !== 'qc' || hasQC);

  // Jobs done on a given day for a given department (from the feed events).
  const jobsFor = (date, dept) => rawEvents.filter(ev => (ev.created_at || '').slice(0, 10) === date && classify(ev, qcNames) === dept);

  const totals = DEPTS.reduce((a, d) => ({ ...a, [d.key]: (data || []).reduce((s, x) => s + (x[d.key] || 0), 0) }), {});
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);

  return (
    <div className="cc">
      <div className="cc-head">
        <div>
          {!embedded && <div className="cc-title">Jobs completed per day</div>}
          <div className="cc-sub">Each item checked off across the shop, stacked by department{source === 'feed' ? ' · recent activity (connect the metrics endpoint for full history)' : ''}.</div>
        </div>
        {!embedded && (
          <div className="cc-ranges">
            {RANGES.map(n => <button key={n} className={`cc-range ${days === n ? 'on' : ''}`} onClick={() => setDays(n)}>{n}d</button>)}
          </div>
        )}
      </div>

      <div className="cc-legend">
        {DEPTS.map(d => (
          <span key={d.key} className="cc-legend-item"><i style={{ background: d.color }} />{d.label} <b>{totals[d.key]}</b></span>
        ))}
        <span className="cc-legend-item"><span className="cc-legend-line" />7-day avg</span>
        <span className="cc-legend-total">Total <b>{grand}</b></span>
      </div>

      {data === null ? <div className="cc-quiet">Loading…</div>
        : source === 'none' ? <div className="cc-quiet">No completion data available.</div>
        : grand === 0 ? <div className="cc-quiet">No completions recorded in this range yet.</div>
        : <Chart data={data} depts={DEPTS} pick={pick} onPick={(date, dept) => setPick(p => (p && p.date === date && p.dept === dept) ? null : { date, dept })} />}

      {pick && (() => {
        const jobs = jobsFor(pick.date, pick.dept);
        const dep = DEPTS.find(d => d.key === pick.dept);
        return (
          <div className="cc-detail">
            <div className="cc-detail-head">
              <span><span className="cc-detail-dot" style={{ background: dep?.color }} />{dep?.label} · {mmdd(pick.date)} — {jobs.length} done</span>
              <button className="cc-detail-x" onClick={() => setPick(null)} aria-label="Close">✕</button>
            </div>
            {jobs.length === 0 ? <div className="cc-quiet" style={{ padding: 12 }}>No detail for this day{source === 'metrics' ? ' in the recent feed (older days may be trimmed).' : '.'}</div>
              : <ul className="cc-detail-list">
                  {jobs.map(ev => (
                    <li key={ev.id}>
                      <span className="cc-job-time">{fmtTime(ev.created_at)}</span>
                      <span className="cc-job-title">{ev.title}</span>
                      {ev.boat_id && <span className="cc-job-boat">{ev.boat_id}{ev.customer_name ? ` · ${ev.customer_name}` : ''}</span>}
                    </li>
                  ))}
                </ul>}
          </div>
        );
      })()}
    </div>
  );
}

function Chart({ data, depts: DEPTS, pick, onPick }) {
  const W = 720, H = 280, L = 34, R = 8, T = 16, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const totalOf = (x) => DEPTS.reduce((s, d) => s + (x[d.key] || 0), 0);
  const totals = data.map(totalOf);
  const max = Math.max(1, ...totals);
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const y = (v) => T + plotH - (plotH * v) / niceMax;
  const slot = plotW / data.length;
  const bw = Math.max(2, Math.min(30, slot * 0.72));
  const cxOf = (i) => L + slot * (i + 0.5);
  const step = Math.ceil(data.length / 8);       // ~8 date labels
  const showNums = bw >= 11;                       // per-bar totals only when there's room
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(niceMax * f));
  // 7-day trailing average of the daily totals.
  const avg = totals.map((_, i) => { const a = totals.slice(Math.max(0, i - 6), i + 1); return a.reduce((s, v) => s + v, 0) / a.length; });
  const linePts = avg.map((v, i) => `${cxOf(i)},${y(v)}`).join(' ');

  return (
    <svg className="cc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily completions stacked by department with 7-day average">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke="#EEF1F4" />
          <text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#8A969E">{t}</text>
        </g>
      ))}
      {data.map((x, i) => {
        const cx = cxOf(i);
        let yTop = y(0);
        return (
          <g key={x.date}>
            {DEPTS.map(d => {
              const v = x[d.key] || 0; if (!v) return null;
              const h = (plotH * v) / niceMax; yTop -= h;
              const segY = yTop;
              const on = pick && pick.date === x.date && pick.dept === d.key;
              const fits = h >= 11 && bw >= 12; // room for the count inside the segment
              return (
                <g key={d.key}>
                  <rect className="cc-bar" x={cx - bw / 2} y={segY} width={bw} height={h} fill={d.color}
                    stroke={on ? '#173A5E' : 'none'} strokeWidth={on ? 1.5 : 0}
                    onClick={() => onPick && onPick(x.date, d.key)}><title>{`${mmdd(x.date)} — ${d.label}: ${v} (click for jobs)`}</title></rect>
                  {fits && <text x={cx} y={segY + h / 2 + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" pointerEvents="none">{v}</text>}
                </g>
              );
            })}
            {showNums && totals[i] > 0 && <text x={cx} y={yTop - 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#5F6B73">{totals[i]}</text>}
            {i % step === 0 && <text x={cx} y={H - 10} textAnchor="middle" fontSize="8.5" fill="#8A969E">{mmdd(x.date)}</text>}
          </g>
        );
      })}
      {data.length > 1 && <polyline points={linePts} fill="none" stroke="#173A5E" strokeWidth="2" strokeLinejoin="round" />}
      <line x1={L} y1={y(0)} x2={W - R} y2={y(0)} stroke="#D6DBE0" />
    </svg>
  );
}

export default CompletionsChart;
