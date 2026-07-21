import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { isDelivered } from './boatFilter';
import './PaymentsAdmin.css';

// Admin → Payments (Ken-only) — per-boat payment schedules tied to build milestones.
// Expected dates FLOAT with the live Timeline until a payment is marked paid.
// Contract prices live only behind the ken-gated /api/payments routes — never on
// /api/boats. Export = CSV, one row per payment, sorted by expected date.

const STAGES = ['Glass Shop', 'Back Line', 'Front Line', 'QC'];
const TRIGGERS = [
  { key: 'manual', label: 'Fixed date' },
  { key: 'before_stage', label: 'Days before stage' },
  { key: 'stage_start', label: 'Stage start' },
  { key: 'completion', label: 'Completion (QC done)' },
  { key: 'after_completion', label: 'Business days after completion' },
];
// Ken's standard schedules — starting points; every boat's rows edit freely after.
// Standard Custom: the pre-glass invoice is "25% less the deposit" → 20% of contract.
const TEMPLATES = {
  'Standard Custom': [
    { label: 'Deposit — contract signing', percent: 5, trigger_type: 'manual' },
    { label: '2 months before Glass Shop (25% less deposit)', percent: 20, trigger_type: 'before_stage', trigger_stage: 'Glass Shop', offset_days: 60 },
    { label: 'Back Line start', percent: 25, trigger_type: 'stage_start', trigger_stage: 'Back Line' },
    { label: 'Balance on completion', percent: 50, trigger_type: 'completion' },
  ],
  'Standard Dealer': [
    { label: 'In full — 7 business days after completion', percent: 100, trigger_type: 'after_completion', offset_days: 7 },
  ],
  'Paid in Full': [
    { label: 'Paid in full — contract signing', percent: 100, trigger_type: 'manual' },
  ],
  '50 / 50': [
    { label: '50% — contract signing', percent: 50, trigger_type: 'manual' },
    { label: '50% — on completion', percent: 50, trigger_type: 'completion' },
  ],
};

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (v) => (v == null || v === '' ? '—' : usd.format(+v));
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtD = (d) => { if (!d) return '—'; const [y, m, day] = String(d).slice(0, 10).split('-'); return `${+m}/${+day}/${String(y).slice(2)}`; };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const addBusinessDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00'); let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) left--; }
  return d.toISOString().slice(0, 10);
};

// Expected date for a milestone, from the live timeline (floats until paid).
function expectedDate(m, plan, tlGroup, deliveredAt) {
  const seg = (stage) => (tlGroup?.segments || []).find(s => s.name === stage);
  const qcEnd = seg('QC') ? String(seg('QC').end).slice(0, 10) : (deliveredAt ? String(deliveredAt).slice(0, 10) : null);
  switch (m.trigger_type) {
    case 'manual': return m.manual_date ? String(m.manual_date).slice(0, 10) : (plan?.contract_date ? String(plan.contract_date).slice(0, 10) : null);
    case 'before_stage': { const s = seg(m.trigger_stage); return s ? addDays(String(s.start).slice(0, 10), -(+m.offset_days || 0)) : null; }
    case 'stage_start': { const s = seg(m.trigger_stage); return s ? String(s.start).slice(0, 10) : null; }
    case 'completion': return qcEnd;
    case 'after_completion': return qcEnd ? addBusinessDays(qcEnd, +m.offset_days || 0) : null;
    default: return null;
  }
}
const triggerText = (m) => {
  switch (m.trigger_type) {
    case 'manual': return 'Fixed date';
    case 'before_stage': return `${m.offset_days || 0}d before ${m.trigger_stage}`;
    case 'stage_start': return `${m.trigger_stage} start`;
    case 'completion': return 'Completion (QC done)';
    case 'after_completion': return `${m.offset_days || 0} business days after completion`;
    default: return m.trigger_type;
  }
};
const statusOf = (m, exp) => {
  if (m.paid_at) return 'paid';
  if (!exp) return 'unscheduled';
  if (exp < todayStr()) return 'overdue';
  if (exp <= addDays(todayStr(), 14)) return 'due';
  return 'upcoming';
};
const STATUS_LABEL = { paid: 'PAID', overdue: 'OVERDUE', due: 'DUE SOON', upcoming: 'Upcoming', unscheduled: 'No date yet' };

// Effective dollar amount per milestone: an actual PAID amount beats everything,
// a fixed $ override beats the %, and the LAST unpaid/un-fixed milestone
// auto-balances so the schedule always sums to the contract price — "I get paid
// an even $5,000 where 5% is $5,014; the balance should update."
function effectiveRows(ms, price) {
  const base = ms.map(m => ({
    m,
    fixed: m.amount_override != null,
    amount: m.paid_at && m.paid_amount != null ? +m.paid_amount
      : m.amount_override != null ? +m.amount_override
      : price != null && m.percent != null ? Math.round(price * m.percent) / 100
      : null,
    isBalance: false,
  }));
  if (price != null && base.length > 1) {
    const last = base[base.length - 1];
    if (!last.m.paid_at && last.m.amount_override == null) {
      const others = base.slice(0, -1).reduce((s, r) => s + (r.amount || 0), 0);
      last.amount = Math.round((price - others) * 100) / 100;
      last.isBalance = true;
    }
  }
  return base;
}
const pctOf = (amount, price) => (price && amount != null ? Math.round((amount / price) * 10000) / 100 : null);

// ---- cash-flow chart: bucket resolved milestones by week (or month) ----
const CHART_CATS = [
  { key: 'received', label: 'Received', color: '#9CCB62' },
  { key: 'overdue', label: 'Overdue', color: '#E24B4A' },
  { key: 'due', label: 'Due soon', color: '#FAC775' },
  { key: 'upcoming', label: 'Expected', color: '#173A5E' },
];
const catOf = (r) => (r.status === 'paid' ? 'received' : r.status === 'overdue' ? 'overdue' : r.status === 'due' ? 'due' : 'upcoming');
// Money lands in the week it was RECEIVED (paid rows) or is EXPECTED (everything else).
const rowDate = (r) => (r.status === 'paid' && r.m.paid_at ? String(r.m.paid_at).slice(0, 10) : r.exp);
// Where it stacks on the chart: overdue money is still coming, so roll it forward
// to today (owed now) rather than leaving it in the past week it was due.
const bucketDate = (r) => (r.status === 'overdue' ? todayStr() : rowDate(r));
const mondayOf = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const nextWeek = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); };

const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
// Window: 3 months back, 8 forward from today (Ken's pick).
function buildBuckets(rows, mode) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const t = new Date(todayStr() + 'T00:00:00');
  const sIso = iso(addMonths(t, -3)), eIso = iso(addMonths(t, 8));
  const keyer = mode === 'weeks' ? mondayOf : (d) => d.slice(0, 7);
  const todayKey = keyer(todayStr());
  const keys = [];
  if (mode === 'weeks') { let c = mondayOf(sIso); const end = mondayOf(eIso); while (c <= end) { keys.push(c); c = nextWeek(c); } }
  else { let [y, m] = sIso.slice(0, 7).split('-').map(Number); const [ey, em] = eIso.slice(0, 7).split('-').map(Number); while (y < ey || (y === ey && m <= em)) { keys.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } }
  const by = {}; for (const k of keys) by[k] = { received: 0, overdue: 0, due: 0, upcoming: 0, rows: [] };
  let outFwd = 0; // expected money beyond the window's right edge (so the note can flag it)
  for (const r of rows) {
    if (r.amount == null) continue; const d = bucketDate(r); if (!d) continue;
    const k = keyer(d);
    if (!by[k]) { if (k > keys[keys.length - 1] && r.status !== 'paid') outFwd += r.amount; continue; }
    by[k][catOf(r)] += r.amount; by[k].rows.push(r);
  }
  const barMax = Math.max(1, ...keys.map(k => CHART_CATS.reduce((s, c) => s + by[k][c.key], 0)));
  const step = Math.pow(10, Math.floor(Math.log10(barMax)));
  return { keys, by, niceMax: Math.ceil(barMax / step) * step, todayKey, outFwd };
}

function PayChart({ rows, mode, pick, onPick }) {
  const { keys, by, niceMax, todayKey, outFwd } = buildBuckets(rows, mode);
  if (!keys.length) return <div className="pay-quiet" style={{ padding: '10px 2px' }}>No dated payments to chart yet.</div>;
  const W = 760, H = 210, L = 52, R = 58, T = 12, B = 34;
  const plotW = W - L - R, plotH = H - T - B;
  const slot = plotW / keys.length;
  const bw = Math.max(3, Math.min(30, slot * 0.68));
  const x = (i) => L + slot * (i + 0.5);
  const y = (v) => T + plotH - (plotH * v) / niceMax;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(niceMax * f));
  const kMoney = (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
  const total = (k) => CHART_CATS.reduce((s, c) => s + by[k][c.key], 0);
  const overdueTotal = keys.reduce((s, k) => s + (k >= todayKey ? by[k].overdue : 0), 0);

  // (1) Cumulative FROM DATE, resetting at today: collected-to-date (past) then the
  // forward pipeline — with an on-time line (excludes overdue) underneath.
  let lrun = 0, rAll = 0, rClean = 0;
  const cum = keys.map(k => {
    if (k < todayKey) { lrun += by[k].received; return { past: true, v: lrun }; }
    rAll += total(k); rClean += by[k].due + by[k].upcoming;
    return { past: false, v: rAll, clean: rClean };
  });

  // (2) Quarterly cumulative — sawtooth that resets $0 at each quarter start, with
  // its own on-time line (all cash minus overdue) for the quarter holding overdue.
  const qOf = (k) => { const [yy, mm] = k.split('-'); return `${yy}-${Math.floor((+mm - 1) / 3)}`; };
  const qSegs = []; let qCur = null, qAll = 0, qClean = 0, qSeg = null;
  keys.forEach((k, i) => {
    const q = qOf(k);
    if (q !== qCur) { if (qSeg) qSegs.push(qSeg); qCur = q; qAll = 0; qClean = 0; qSeg = { firstI: i, all: [], clean: [], endAll: 0, endClean: 0, endI: i, over: false }; }
    qAll += total(k); qClean += total(k) - by[k].overdue;
    if (by[k].overdue > 0) qSeg.over = true;
    qSeg.all.push([i, qAll]); qSeg.clean.push([i, qClean]); qSeg.endAll = qAll; qSeg.endClean = qClean; qSeg.endI = i;
  });
  if (qSeg) qSegs.push(qSeg);

  // Shared scale so both cumulatives are comparable (quarterly sits under from-date).
  const cumMax = Math.max(1, lrun, rAll, ...qSegs.map(s => s.endAll));
  const yc = (v) => T + plotH - (plotH * v) / cumMax;
  const pts = (arr) => arr.map(([i, v]) => `${x(i)},${yc(v)}`).join(' ');
  const pastPts = keys.map((k, i) => cum[i].past ? `${x(i)},${yc(cum[i].v)}` : null).filter(Boolean).join(' ');
  const fwdPts = keys.map((k, i) => !cum[i].past ? `${x(i)},${yc(cum[i].v)}` : null).filter(Boolean).join(' ');
  const fwdCleanPts = keys.map((k, i) => !cum[i].past ? `${x(i)},${yc(cum[i].clean)}` : null).filter(Boolean).join(' ');
  const step = Math.ceil(keys.length / 12);
  const label = (k) => mode === 'weeks' ? (() => { const [, m, d] = k.split('-'); return `${+m}/${+d}`; })() : (() => { const [yy, mm] = k.split('-'); return new Date(+yy, +mm - 1, 1).toLocaleDateString('en-US', { month: 'short' }); })();
  const todayI = keys.indexOf(todayKey);
  const lastI = keys.length - 1;

  return (
    <>
      <svg className="pay-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Payments by period">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} y1={y(t)} x2={W - R} y2={y(t)} stroke="#EEF1F4" />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#8A969E">{kMoney(t)}</text>
          </g>
        ))}
        {todayI >= 0 && <line x1={x(todayI) - slot / 2} y1={T} x2={x(todayI) - slot / 2} y2={T + plotH} stroke="#2E92D6" strokeDasharray="3 3" />}
        {keys.map((k, i) => {
          let yTop = y(0); const on = pick === k;
          return (
            <g key={k}>
              {CHART_CATS.map(c => {
                const v = by[k][c.key]; if (!v) return null;
                const h = (plotH * v) / niceMax; yTop -= h;
                return <rect key={c.key} x={x(i) - bw / 2} y={yTop} width={bw} height={h} fill={c.color}
                  stroke={on ? '#173A5E' : 'none'} strokeWidth={on ? 1.5 : 0} style={{ cursor: 'pointer' }}
                  onClick={() => onPick(pick === k ? null : k)}><title>{`${label(k)} — ${c.label}: ${money(v)}`}</title></rect>;
              })}
              {i % step === 0 && <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="8.5" fill="#8A969E">{label(k)}</text>}
            </g>
          );
        })}
        {/* faint quarter boundaries */}
        {qSegs.slice(1).map((s, i) => <line key={'qb' + i} x1={x(s.firstI) - slot / 2} y1={T} x2={x(s.firstI) - slot / 2} y2={T + plotH} stroke="#EDEBF9" />)}
        {/* QUARTERLY (coral) sawtooth — solid = all cash, dashed = on-time (its quarter with overdue) */}
        {qSegs.map((s, i) => (
          <g key={'q' + i}>
            {s.over && <polyline points={pts(s.clean)} fill="none" stroke="#F0997B" strokeWidth="1.4" strokeDasharray="4 3" strokeLinejoin="round" />}
            <polyline points={pts(s.all)} fill="none" stroke="#D85A30" strokeWidth="1.8" strokeLinejoin="round" />
            {s.endAll > 0 && <text x={x(s.endI)} y={yc(s.endAll) - 4} textAnchor="middle" fontSize="8" fontWeight="700" fill="#D85A30">{kMoney(s.endAll)}</text>}
          </g>
        ))}
        {/* FROM-DATE (teal collected → purple pipeline); dashed purple = on-time */}
        {pastPts && <polyline points={pastPts} fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinejoin="round" />}
        {overdueTotal > 0 && fwdCleanPts && <polyline points={fwdCleanPts} fill="none" stroke="#7F77DD" strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round" />}
        {fwdPts && <polyline points={fwdPts} fill="none" stroke="#534AB7" strokeWidth="2" strokeLinejoin="round" />}
        {lrun > 0 && todayI > 0 && <text x={x(todayI) - slot / 2 - 3} y={yc(lrun) - 4} textAnchor="end" fontSize="9" fontWeight="700" fill="#0F6E56">{kMoney(lrun)}</text>}
        {rAll > 0 && <text x={x(lastI) + 4} y={yc(rAll) + 3} fontSize="9" fontWeight="700" fill="#534AB7">{kMoney(rAll)}</text>}
        {overdueTotal > 0 && <text x={x(lastI) + 4} y={yc(rClean) + 3} fontSize="8.5" fontWeight="700" fill="#7F77DD">{kMoney(rClean)}</text>}
        <line x1={L} y1={y(0)} x2={W - R} y2={y(0)} stroke="#D6DBE0" />
      </svg>
      {overdueTotal > 0 && <div className="pay-chart-note pay-note-over">{money(overdueTotal)} is <b>overdue</b> — the gap between each solid line and its dashed on-time line.</div>}
      {outFwd > 0 && <div className="pay-chart-note">+ {money(outFwd)} expected beyond this window (past the 8-month view).</div>}
    </>
  );
}

function PaymentsAdmin() {
  const [data, setData] = useState(null);     // { plans, milestones, delivered } | 'off'
  const [boats, setBoats] = useState([]);
  const [tl, setTl] = useState(null);
  const [sel, setSel] = useState(null);       // selected boat_id
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState('weeks'); // weeks | months
  const [showCompleted, setShowCompleted] = useState(false); // reveal rolled-off boats
  const [cumMode, setCumMode] = useState('today');     // today | quarter (cumulative reset)
  const [chartPick, setChartPick] = useState(null);    // bucket key clicked

  useEffect(() => { init(); }, []);
  const init = async () => {
    try {
      setLoading(true);
      const [p, b, t] = await Promise.all([
        apiFetch('/api/payments').catch(() => null),
        apiFetch('/api/boats').then(r => r.json()).catch(() => []),
        apiFetch('/api/timeline').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      setBoats(b); setTl(t);
      setData(p && p.ok ? await p.json() : 'off');
    } finally { setLoading(false); }
  };

  if (loading) return <div className="loading">Loading payments...</div>;
  if (data === 'off') return (
    <div className="pay"><p className="pay-off">Payments data didn't load. The routes are gated to the owner allowlist (Ken + Kelly) on the server — a 403 means your account isn't on it yet (run <b>BACKEND_PAYMENTS_ALLOWLIST_BRIEF.md</b>), and a fresh install needs <b>BACKEND_PAYMENTS_BRIEF.md</b>.</p></div>
  );

  const plans = {}; for (const p of (data.plans || [])) plans[p.boat_id] = p;
  const delivered = {}; for (const d of (data.delivered || [])) delivered[d.boat_id] = d.delivered_at;
  const tlBy = {}; for (const g of (tl?.groups || [])) if (g.kind === 'boat') tlBy[g.key] = g;
  const msFor = (id) => (data.milestones || []).filter(m => m.boat_id === id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

  // The $-override column ships with BACKEND_PAYMENTS_AMOUNT_BRIEF.md; until the
  // GET carries it, the amount inputs stay read-only rather than silently not saving.
  const supportsOverride = (data.milestones || []).length === 0 ||
    (data.milestones || []).some(m => 'amount_override' in m);

  // Every milestone across every boat, resolved — drives alerts + export.
  const allRows = [];
  for (const b of boats) {
    const plan = plans[b.boat_id];
    for (const r of effectiveRows(msFor(b.boat_id), plan?.contract_price ?? null)) {
      const exp = expectedDate(r.m, plan, tlBy[b.boat_id], delivered[b.boat_id]);
      allRows.push({ boat: b, m: r.m, exp, amount: r.amount, fixed: r.fixed, isBalance: r.isBalance, status: statusOf(r.m, exp) });
    }
  }
  const overdue = allRows.filter(r => r.status === 'overdue').sort((a, b) => (a.exp || '').localeCompare(b.exp || ''));
  const dueSoon = allRows.filter(r => r.status === 'due').sort((a, b) => (a.exp || '').localeCompare(b.exp || ''));

  const save = async (path, body, method = 'PUT') => {
    const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { alert('Save failed.'); return null; }
    return r;
  };
  const savePlan = async (boatId, patch) => {
    const cur = plans[boatId] || {};
    await save(`/api/payments/plan/${encodeURIComponent(boatId)}`, { contract_price: cur.contract_price ?? null, contract_date: cur.contract_date ?? null, notes: cur.notes ?? null, ...patch });
    init();
  };
  const saveMs = async (id, patch) => { await save(`/api/payments/milestone/${id}`, patch); init(); };
  const addMs = async (boatId, m, order) => { await save('/api/payments/milestone', { boat_id: boatId, sort_order: order, ...m }, 'POST'); init(); };
  const delMs = async (id) => { if (!window.confirm('Remove this payment milestone?')) return; const r = await apiFetch(`/api/payments/milestone/${id}`, { method: 'DELETE' }); if (!r.ok) alert('Delete failed.'); init(); };
  const applyTemplate = async (boatId, name) => {
    const existing = msFor(boatId);
    if (existing.length && !window.confirm(`Replace the ${existing.length} existing milestone(s) with the "${name}" template?`)) return;
    for (const m of existing) await apiFetch(`/api/payments/milestone/${m.id}`, { method: 'DELETE' });
    let i = 0;
    for (const m of TEMPLATES[name]) await save('/api/payments/milestone', { boat_id: boatId, sort_order: i++, ...m }, 'POST');
    init();
  };

  // ---- CFO export: CSV, one row per payment, sorted by expected date ----
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = allRows.slice().sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
    const lines = [
      ['Boat', 'Customer', 'Model', 'Milestone', 'Percent', 'Amount', 'Trigger', 'Expected date', 'Status', 'Paid date', 'Paid amount', 'Contract price'].map(esc).join(','),
      ...rows.map(r => [
        r.boat.boat_id, r.boat.customer_name, r.boat.boat_model,
        r.m.label + (r.fixed ? ' (fixed $)' : r.isBalance ? ' (balance)' : ''),
        r.fixed || r.isBalance
          ? (pctOf(r.amount, plans[r.boat.boat_id]?.contract_price) != null ? `${pctOf(r.amount, plans[r.boat.boat_id]?.contract_price)}%` : '')
          : (r.m.percent != null ? `${r.m.percent}%` : ''),
        r.amount != null ? r.amount.toFixed(2) : '',
        triggerText(r.m), r.exp || 'TBD', STATUS_LABEL[r.status],
        r.m.paid_at ? String(r.m.paid_at).slice(0, 10) : '', r.m.paid_amount ?? '',
        plans[r.boat.boat_id]?.contract_price ?? '',
      ].map(esc).join(',')),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bluewater-payments-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // List behavior: unpaid/active boats on top (by build order); fully-paid boats
  // sink to the bottom, newest first; and a paid boat ROLLS OFF once its latest
  // payment is older than the chart's 3-month lookback (unless "Show completed").
  const windowStart = (() => { const d = new Date(todayStr() + 'T00:00:00'); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); })();
  const boatMeta = {};
  for (const b of boats) {
    const rows = allRows.filter(r => r.boat.boat_id === b.boat_id);
    const dates = rows.map(r => rowDate(r)).filter(Boolean).sort();
    boatMeta[b.boat_id] = { last: dates.length ? dates[dates.length - 1] : null, hasUnpaid: rows.some(r => r.status !== 'paid'), hasSchedule: rows.length > 0 };
  }
  // Keep a boat unless it's finished (paid/no-owe) AND its activity has aged out.
  const keepBoat = (b) => {
    const m = boatMeta[b.boat_id];
    if (m.hasUnpaid) return true;            // still owes money
    if (!isDelivered(b)) return true;        // active build — always relevant
    return !!(m.last && m.last >= windowStart); // delivered + settled: keep only if recent
  };
  const orderedBoats = boats.slice().sort((a, b) => {
    const ma = boatMeta[a.boat_id], mb = boatMeta[b.boat_id];
    const pa = ma.hasUnpaid ? 0 : 1, pb = mb.hasUnpaid ? 0 : 1;
    if (pa !== pb) return pa - pb;                                  // unpaid first, paid last
    if (pa === 1) return (mb.last || '').localeCompare(ma.last || ''); // paid group: newest first
    return (a.sequence_number || 999) - (b.sequence_number || 999);    // unpaid: build order
  });
  const rolledOff = orderedBoats.length - orderedBoats.filter(keepBoat).length;
  const sortedBoats = showCompleted ? orderedBoats : orderedBoats.filter(keepBoat);
  const selBoat = sel ? boats.find(b => b.boat_id === sel) : null;
  const selPlan = sel ? (plans[sel] || {}) : null;
  const selMs = sel ? msFor(sel) : [];
  const pctSum = selMs.reduce((s, m) => s + (+m.percent || 0), 0);

  return (
    <div className="pay">
      <div className="pay-topbar">
        <p className="pay-intro">Payment schedules per boat — expected dates follow the live Timeline until marked paid. Visible to you only.</p>
        <button className="pay-export" onClick={exportCsv}>⬇ Export CSV for CFO</button>
      </div>

      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className="pay-alerts">
          {overdue.map((r, i) => (
            <button key={'o' + i} className="pay-alert pay-alert-over" onClick={() => setSel(r.boat.boat_id)}>
              <b>OVERDUE</b> {r.boat.boat_id} · {r.boat.customer_name} · {r.m.label} · {money(r.amount)} — expected {fmtD(r.exp)}
            </button>
          ))}
          {dueSoon.map((r, i) => (
            <button key={'d' + i} className="pay-alert pay-alert-due" onClick={() => setSel(r.boat.boat_id)}>
              <b>DUE</b> {r.boat.boat_id} · {r.boat.customer_name} · {r.m.label} · {money(r.amount)} — {fmtD(r.exp)}
            </button>
          ))}
        </div>
      )}

      {allRows.some(r => r.amount != null && rowDate(r)) && (
        <div className="pay-chart">
          <div className="pay-chart-head">
            <span className="pay-chart-title">Cash flow — {chartMode === 'weeks' ? 'weekly' : 'monthly'}</span>
            <span className="pay-chart-legend">
              {CHART_CATS.map(c => <span key={c.key}><i style={{ background: c.color }} />{c.label}</span>)}
              <span><i className="pay-cumline pay-cum-collected" />Collected to date</span>
              <span><i className="pay-cumline pay-cum-forward" />Cumulative (from today)</span>
              <span><i className="pay-cumline pay-cum-quarter" />Per quarter</span>
              <span><i className="pay-cumline pay-cum-dashed" />dashed = on-time (excl. overdue)</span>
            </span>
            <span className="pay-chart-zoom">
              <button className={chartMode === 'weeks' ? 'on' : ''} onClick={() => { setChartMode('weeks'); setChartPick(null); }}>Weeks</button>
              <button className={chartMode === 'months' ? 'on' : ''} onClick={() => { setChartMode('months'); setChartPick(null); }}>Months</button>
            </span>
          </div>
          <PayChart rows={allRows} mode={chartMode} pick={chartPick} onPick={setChartPick} />
          {chartPick && (() => {
            const inBucket = allRows.filter(r => r.amount != null && bucketDate(r) &&
              (chartMode === 'weeks' ? mondayOf(bucketDate(r)) === chartPick : bucketDate(r).slice(0, 7) === chartPick))
              .sort((a, b) => (rowDate(a) || '').localeCompare(rowDate(b) || ''));
            const sum = inBucket.reduce((s, r) => s + r.amount, 0);
            return (
              <div className="pay-chart-detail">
                <div className="pay-chart-detail-head">{inBucket.length} payment{inBucket.length === 1 ? '' : 's'} · {money(sum)}<button onClick={() => setChartPick(null)}>✕</button></div>
                {inBucket.map((r, i) => (
                  <button key={i} className={`pay-chart-drow pay-drow-${r.status}`} onClick={() => setSel(r.boat.boat_id)}>
                    <span>{fmtD(rowDate(r))}</span>
                    <span>{r.boat.boat_id} · {r.boat.customer_name}</span>
                    <span className="pay-drow-label">{r.m.label}</span>
                    <span className="pay-drow-amt">{money(r.amount)}</span>
                    <span className="pay-drow-st">{STATUS_LABEL[r.status]}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      <div className="pay-split">
        <div className="pay-list">
          {sortedBoats.map(b => {
            const rows = allRows.filter(r => r.boat.boat_id === b.boat_id);
            const over = rows.some(r => r.status === 'overdue');
            const due = rows.some(r => r.status === 'due');
            const paid = rows.length > 0 && rows.every(r => r.status === 'paid');
            const priced = plans[b.boat_id]?.contract_price != null;
            // Next money in the door: earliest unpaid milestone (dated ones first).
            const unpaid = rows.filter(r => r.status !== 'paid');
            const next = unpaid.filter(r => r.exp).sort((x, y) => x.exp.localeCompare(y.exp))[0] || unpaid[0] || null;
            return (
              <button key={b.boat_id} className={`pay-boat ${sel === b.boat_id ? 'on' : ''}`} onClick={() => setSel(b.boat_id)}>
                <span className="pay-boat-id">
                  {b.boat_id} · {b.customer_name}
                  {priced && <span className="pay-priced" title="Contract price + schedule set">$ SET</span>}
                </span>
                <span className="pay-boat-sub">
                  {priced ? money(plans[b.boat_id].contract_price) : 'no price'} · {rows.length ? `${rows.length} payments` : 'no schedule'}
                </span>
                {next && (
                  <span className={`pay-boat-next pay-next-${next.status}`}>
                    Next: {money(next.amount)}{next.exp ? ` · ${fmtD(next.exp)}` : ' · date TBD'}
                    {next.status === 'overdue' ? ' — OVERDUE' : next.status === 'due' ? ' — due soon' : ''}
                  </span>
                )}
                {over && <span className="pay-badge pay-badge-over">OVERDUE</span>}
                {!over && due && <span className="pay-badge pay-badge-due">DUE</span>}
                {paid && <span className="pay-badge pay-badge-paid">PAID ✓</span>}
              </button>
            );
          })}
          {(rolledOff > 0 || showCompleted) && (
            <button className="pay-showcompleted" onClick={() => setShowCompleted(v => !v)}>
              {showCompleted ? '▲ Hide completed' : `▾ Show ${rolledOff} completed (rolled off)`}
            </button>
          )}
        </div>

        <div className="pay-editor">
          {!selBoat ? <p className="pay-quiet">Pick a boat to set its price and payment schedule.</p> : (
            <>
              <h3>{selBoat.boat_id} · {selBoat.customer_name} <span className="pay-model">{selBoat.boat_model}</span></h3>
              <div className="pay-planrow">
                <label>Contract price
                  <input type="number" min="0" step="1000" defaultValue={selPlan.contract_price ?? ''} key={sel + 'p' + (selPlan.contract_price ?? '')}
                    onBlur={e => { const v = e.target.value === '' ? null : +e.target.value; if (v !== selPlan.contract_price) savePlan(sel, { contract_price: v }); }} />
                </label>
                <label>Contract signed
                  <input type="date" defaultValue={selPlan.contract_date ? String(selPlan.contract_date).slice(0, 10) : ''} key={sel + 'd' + (selPlan.contract_date ?? '')}
                    onBlur={e => savePlan(sel, { contract_date: e.target.value || null })} />
                </label>
              </div>

              <div className="pay-templates">
                <span>Apply template:</span>
                {Object.keys(TEMPLATES).map(t => <button key={t} onClick={() => applyTemplate(sel, t)}>{t}</button>)}
              </div>

              {selMs.length > 0 && (
                <table className="pay-table">
                  <thead><tr><th>Milestone</th><th>%</th><th>Amount</th><th>When</th><th>Expected</th><th>Paid</th><th /></tr></thead>
                  <tbody>
                    {effectiveRows(selMs, selPlan.contract_price ?? null).map(({ m, amount, fixed, isBalance }) => {
                      const exp = expectedDate(m, selPlan, tlBy[sel], delivered[sel]);
                      const st = statusOf(m, exp);
                      // % shown = the stored percent, or the derived % when a $ figure rules.
                      const pctShown = fixed || isBalance ? (pctOf(amount, selPlan.contract_price) ?? '') : (m.percent ?? '');
                      return (
                        <tr key={m.id} className={`pay-row-${st}`}>
                          <td><input className="pay-in pay-in-label" defaultValue={m.label} key={m.id + m.label} onBlur={e => e.target.value !== m.label && saveMs(m.id, { label: e.target.value })} /></td>
                          <td><input className="pay-in pay-in-pct" type="number" min="0" max="100" step="0.01" defaultValue={pctShown} key={m.id + 'pct' + pctShown}
                            title={fixed ? 'Derived from the fixed $ amount — editing switches this back to a %' : isBalance ? 'Derived — this row auto-balances' : ''}
                            onBlur={e => { const v = e.target.value === '' ? null : +e.target.value; if (v !== m.percent || fixed) saveMs(m.id, { percent: v, amount_override: null }); }} /></td>
                          <td className="pay-amtcell">
                            <input className="pay-in pay-in-amt" type="number" min="0" step="1" defaultValue={amount ?? ''} key={m.id + 'amt' + amount + fixed}
                              disabled={!supportsOverride}
                              title={!supportsOverride ? 'Run BACKEND_PAYMENTS_AMOUNT_BRIEF.md to enable fixed $ amounts' : 'Type an exact dollar figure (e.g. an even 5000) — the balance row absorbs the difference'}
                              onBlur={e => {
                                const v = e.target.value === '' ? null : +e.target.value;
                                if (v === amount) return;               // unchanged (incl. balance display)
                                saveMs(m.id, { amount_override: v });   // null clears back to %
                              }} />
                            {fixed && <span className="pay-tag pay-tag-fixed">$ fixed</span>}
                            {isBalance && <span className="pay-tag pay-tag-bal">auto balance</span>}
                          </td>
                          <td className="pay-trig">
                            <select value={m.trigger_type} onChange={e => saveMs(m.id, { trigger_type: e.target.value })}>
                              {TRIGGERS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                            {(m.trigger_type === 'before_stage' || m.trigger_type === 'stage_start') && (
                              <select value={m.trigger_stage || ''} onChange={e => saveMs(m.id, { trigger_stage: e.target.value })}>
                                <option value="">stage…</option>
                                {STAGES.map(s => <option key={s}>{s}</option>)}
                              </select>
                            )}
                            {(m.trigger_type === 'before_stage' || m.trigger_type === 'after_completion') && (
                              <input className="pay-in pay-in-off" type="number" min="0" defaultValue={m.offset_days ?? 0} key={m.id + 'off' + m.offset_days}
                                onBlur={e => saveMs(m.id, { offset_days: +e.target.value || 0 })} title={m.trigger_type === 'before_stage' ? 'days before' : 'business days after'} />
                            )}
                            {m.trigger_type === 'manual' && (
                              <input type="date" defaultValue={m.manual_date ? String(m.manual_date).slice(0, 10) : ''} key={m.id + 'md' + m.manual_date}
                                onBlur={e => saveMs(m.id, { manual_date: e.target.value || null })} />
                            )}
                          </td>
                          <td className={`pay-exp pay-exp-${st}`}>{fmtD(exp)}<span className="pay-st">{STATUS_LABEL[st]}</span></td>
                          <td className="pay-paid">
                            <input type="checkbox" checked={!!m.paid_at} onChange={e => saveMs(m.id, { paid_at: e.target.checked ? todayStr() : null })} />
                            {m.paid_at && (
                              <input type="date" defaultValue={String(m.paid_at).slice(0, 10)} key={m.id + 'pd' + m.paid_at}
                                onBlur={e => e.target.value && saveMs(m.id, { paid_at: e.target.value })} />
                            )}
                            {m.paid_at && (
                              <input className="pay-in pay-in-paidamt" type="number" min="0" step="1" placeholder="$ received"
                                defaultValue={m.paid_amount ?? ''} key={m.id + 'pa' + m.paid_amount}
                                title="Actual amount received (blank = as scheduled) — the balance row absorbs any difference"
                                onBlur={e => saveMs(m.id, { paid_amount: e.target.value === '' ? null : +e.target.value })} />
                            )}
                          </td>
                          <td><button className="pay-del" onClick={() => delMs(m.id)}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div className="pay-msfoot">
                <button className="pay-add" onClick={() => addMs(sel, { label: 'Payment', percent: null, trigger_type: 'manual' }, selMs.length)}>+ Add payment</button>
                {selMs.length > 0 && (() => {
                  // With a price set, judge the schedule in dollars (overrides + auto
                  // balance included); % only matters when there's no price yet.
                  if (selPlan.contract_price != null) {
                    const tot = effectiveRows(selMs, selPlan.contract_price).reduce((s, r) => s + (r.amount || 0), 0);
                    const off = Math.abs(tot - selPlan.contract_price) > 0.01;
                    return <span className={`pay-sum ${off ? 'off' : ''}`}>Schedule {money(tot)} of {money(selPlan.contract_price)}{off ? " — doesn't match the contract" : ' ✓'}</span>;
                  }
                  return <span className={`pay-sum ${Math.abs(pctSum - 100) > 0.01 ? 'off' : ''}`}>Total {pctSum}%{Math.abs(pctSum - 100) > 0.01 ? ' — should be 100%' : ' ✓'}</span>;
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaymentsAdmin;
