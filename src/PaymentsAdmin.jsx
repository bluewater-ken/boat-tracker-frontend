import { useState, useEffect } from 'react';
import { apiFetch } from './api';
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
// (His example summed to 105%, so Standard Custom's balance is stored as 45%.)
const TEMPLATES = {
  'Standard Custom': [
    { label: 'Deposit — contract signing', percent: 5, trigger_type: 'manual' },
    { label: '2 months before Glass Shop', percent: 25, trigger_type: 'before_stage', trigger_stage: 'Glass Shop', offset_days: 60 },
    { label: 'Back Line start', percent: 25, trigger_type: 'stage_start', trigger_stage: 'Back Line' },
    { label: 'Balance on completion', percent: 45, trigger_type: 'completion' },
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

function PaymentsAdmin() {
  const [data, setData] = useState(null);     // { plans, milestones, delivered } | 'off'
  const [boats, setBoats] = useState([]);
  const [tl, setTl] = useState(null);
  const [sel, setSel] = useState(null);       // selected boat_id
  const [loading, setLoading] = useState(true);

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
    <div className="pay"><p className="pay-off">Payments backend isn't set up yet — run <b>BACKEND_PAYMENTS_BRIEF.md</b> on the server first. (Routes are Ken-gated; a 403 here means you're not logged in as ken.)</p></div>
  );

  const plans = {}; for (const p of (data.plans || [])) plans[p.boat_id] = p;
  const delivered = {}; for (const d of (data.delivered || [])) delivered[d.boat_id] = d.delivered_at;
  const tlBy = {}; for (const g of (tl?.groups || [])) if (g.kind === 'boat') tlBy[g.key] = g;
  const msFor = (id) => (data.milestones || []).filter(m => m.boat_id === id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

  // Every milestone across every boat, resolved — drives alerts + export.
  const allRows = [];
  for (const b of boats) {
    const plan = plans[b.boat_id];
    for (const m of msFor(b.boat_id)) {
      const exp = expectedDate(m, plan, tlBy[b.boat_id], delivered[b.boat_id]);
      const amount = plan?.contract_price != null && m.percent != null ? Math.round(plan.contract_price * m.percent) / 100 : null;
      allRows.push({ boat: b, m, exp, amount, status: statusOf(m, exp) });
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
        r.boat.boat_id, r.boat.customer_name, r.boat.boat_model, r.m.label,
        r.m.percent != null ? `${r.m.percent}%` : '', r.amount != null ? r.amount.toFixed(2) : '',
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

  const sortedBoats = boats.slice().sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999));
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
              <b>OVERDUE</b> {r.boat.boat_id} · {r.m.label} · {money(r.amount)} — expected {fmtD(r.exp)}
            </button>
          ))}
          {dueSoon.map((r, i) => (
            <button key={'d' + i} className="pay-alert pay-alert-due" onClick={() => setSel(r.boat.boat_id)}>
              <b>DUE</b> {r.boat.boat_id} · {r.m.label} · {money(r.amount)} — {fmtD(r.exp)}
            </button>
          ))}
        </div>
      )}

      <div className="pay-split">
        <div className="pay-list">
          {sortedBoats.map(b => {
            const rows = allRows.filter(r => r.boat.boat_id === b.boat_id);
            const over = rows.some(r => r.status === 'overdue');
            const due = rows.some(r => r.status === 'due');
            const paid = rows.length > 0 && rows.every(r => r.status === 'paid');
            return (
              <button key={b.boat_id} className={`pay-boat ${sel === b.boat_id ? 'on' : ''}`} onClick={() => setSel(b.boat_id)}>
                <span className="pay-boat-id">{b.boat_id} · {b.customer_name}</span>
                <span className="pay-boat-sub">
                  {plans[b.boat_id]?.contract_price != null ? money(plans[b.boat_id].contract_price) : 'no price'} · {rows.length ? `${rows.length} payments` : 'no schedule'}
                </span>
                {over && <span className="pay-badge pay-badge-over">OVERDUE</span>}
                {!over && due && <span className="pay-badge pay-badge-due">DUE</span>}
                {paid && <span className="pay-badge pay-badge-paid">PAID ✓</span>}
              </button>
            );
          })}
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
                    {selMs.map(m => {
                      const exp = expectedDate(m, selPlan, tlBy[sel], delivered[sel]);
                      const amount = selPlan.contract_price != null && m.percent != null ? Math.round(selPlan.contract_price * m.percent) / 100 : null;
                      const st = statusOf(m, exp);
                      return (
                        <tr key={m.id} className={`pay-row-${st}`}>
                          <td><input className="pay-in pay-in-label" defaultValue={m.label} key={m.id + m.label} onBlur={e => e.target.value !== m.label && saveMs(m.id, { label: e.target.value })} /></td>
                          <td><input className="pay-in pay-in-pct" type="number" min="0" max="100" defaultValue={m.percent ?? ''} key={m.id + 'pct' + m.percent}
                            onBlur={e => saveMs(m.id, { percent: e.target.value === '' ? null : +e.target.value })} /></td>
                          <td className="pay-amt">{money(amount)}</td>
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
                {selMs.length > 0 && (
                  <span className={`pay-sum ${Math.abs(pctSum - 100) > 0.01 ? 'off' : ''}`}>
                    Total {pctSum}%{Math.abs(pctSum - 100) > 0.01 ? ' — should be 100%' : ' ✓'}
                    {selPlan.contract_price != null && <> · {money(selMs.reduce((s, m) => s + (selPlan.contract_price * (+m.percent || 0)) / 100, 0))}</>}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaymentsAdmin;
