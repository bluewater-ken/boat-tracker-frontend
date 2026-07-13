import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import './CompletionsChart.css';

// Daily jobs-completed, stacked by department. Prefers a proper backend metrics
// endpoint (deep history); falls back to classifying recent activity-feed events
// so the chart shows something before that endpoint ships.

// Department colors match the Shop Feed's issue categories, so a department is the
// same color everywhere in the app.
const DEPTS = [
  { key: 'glass', label: 'Glass Shop', color: '#2E7D8A' },
  { key: 'finishing', label: 'Finishing', color: '#A32D2D' },
  { key: 'assembly', label: 'Assembly', color: '#5C9A2E' },
  { key: 'parts', label: 'Key Parts', color: '#BA7517' },
];
const RANGES = [14, 30, 60, 90];
const ZERO = () => ({ glass: 0, finishing: 0, assembly: 0, parts: 0 });

// Feed-event → department (only completion-type events count).
const doneLam = (t) => /→\s*(Complete\/On Mold|Pulled|Complete)\s*$/.test(t || '');
const doneFin = (t) => /→\s*Complete\s*$/.test(t || '');
function classify(ev) {
  if (ev.type === 'CHECKLIST_ITEM_COMPLETED' || ev.type === 'CHECKLIST_COMPLETED') return 'assembly';
  if (ev.type === 'PART_RECEIVED') return 'parts';
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
function deriveFromFeed(events, days) {
  const map = {};
  for (const ev of events || []) {
    const dept = classify(ev); if (!dept) continue;
    const date = (ev.created_at || '').slice(0, 10); if (!date) continue;
    (map[date] ||= ZERO())[dept]++;
  }
  return lastNDates(days).map(date => ({ date, ...(map[date] || ZERO()) }));
}
const mmdd = (iso) => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };

// `embedded` (e.g. in the Shop Report) hides the title + range toggle and uses a
// fixed range — the host provides the heading.
function CompletionsChart({ embedded = false, days: fixedDays = 30 }) {
  const [days, setDays] = useState(fixedDays);
  const [data, setData] = useState(null);
  const [source, setSource] = useState(''); // 'metrics' | 'feed' | 'none'

  useEffect(() => {
    let alive = true;
    (async () => {
      setData(null);
      // 1) Proper endpoint (deep history, pre-aggregated).
      const r = await apiFetch(`/api/metrics/completions?days=${days}`).catch(() => null);
      if (r && r.ok) {
        const rows = await r.json();
        const byDate = {}; for (const x of rows) byDate[x.date] = x;
        if (alive) { setSource('metrics'); setData(lastNDates(days).map(date => ({ date, ...ZERO(), ...(byDate[date] || {}) }))); }
        return;
      }
      // 2) Fallback: classify recent feed events client-side.
      const fr = await apiFetch('/api/assembly/feed?limit=1000').catch(() => null);
      if (fr && fr.ok) { const ev = await fr.json(); if (alive) { setSource('feed'); setData(deriveFromFeed(ev, days)); } return; }
      if (alive) { setSource('none'); setData([]); }
    })();
    return () => { alive = false; };
  }, [days]);

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
        <span className="cc-legend-total">Total <b>{grand}</b></span>
      </div>

      {data === null ? <div className="cc-quiet">Loading…</div>
        : source === 'none' ? <div className="cc-quiet">No completion data available.</div>
        : grand === 0 ? <div className="cc-quiet">No completions recorded in this range yet.</div>
        : <Chart data={data} />}
    </div>
  );
}

function Chart({ data }) {
  const W = 720, H = 280, L = 34, R = 8, T = 10, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const totalOf = (x) => DEPTS.reduce((s, d) => s + (x[d.key] || 0), 0);
  const max = Math.max(1, ...data.map(totalOf));
  const niceMax = Math.ceil(max / 5) * 5 || 5;
  const y = (v) => T + plotH - (plotH * v) / niceMax;
  const slot = plotW / data.length;
  const bw = Math.max(2, Math.min(30, slot * 0.72));
  // ~8 evenly spaced date labels.
  const step = Math.ceil(data.length / 8);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(niceMax * f));
  return (
    <svg className="cc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily completions stacked by department">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke="#EEF1F4" />
          <text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#8A969E">{t}</text>
        </g>
      ))}
      {data.map((x, i) => {
        const cx = L + slot * (i + 0.5);
        let yTop = y(0);
        return (
          <g key={x.date}>
            {DEPTS.map(d => {
              const v = x[d.key] || 0; if (!v) return null;
              const h = (plotH * v) / niceMax; yTop -= h;
              return <rect key={d.key} x={cx - bw / 2} y={yTop} width={bw} height={h} fill={d.color}><title>{`${mmdd(x.date)} — ${d.label}: ${v}`}</title></rect>;
            })}
            {i % step === 0 && <text x={cx} y={H - 10} textAnchor="middle" fontSize="8.5" fill="#8A969E">{mmdd(x.date)}</text>}
          </g>
        );
      })}
      <line x1={L} y1={y(0)} x2={W - R} y2={y(0)} stroke="#D6DBE0" />
    </svg>
  );
}

export default CompletionsChart;
