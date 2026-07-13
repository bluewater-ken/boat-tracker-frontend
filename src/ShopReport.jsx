import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { renderAnswer } from './markdown';
import Logo from './Logo';
import './ShopReport.css';

// Shop Status Report — a printable, shop-wide summary across Production Schedule,
// Lamination, Finishing, Assembly, and Key Parts, plus an AI commentary from the
// same engine as Ask the B.O.S.S. Read-only; opens over the app, prints on letter.

const STAGES = ['Backlog', 'Pre-Production', 'Glass Shop', 'Back Line', 'Front Line', 'QC', 'Delivered'];
// Lamination: Transducer Type excluded (info-only, never checks off — see AssemblyTracker).
const LAM_TASKS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid', 'Other'];
const LAM_FINAL = (t) => (t === 'Glass Kit' ? 'Complete' : 'Pulled');
const FIN_TASKS = ['Hull', 'Liner', 'Ring', 'Hard Top', 'Console', 'Console Face', 'Hatches', 'Leaning Post', 'Buckets', 'Other'];

const fmtDate = (d) => { if (!d) return ''; const [, m, day] = d.slice(0, 10).split('-'); return `${+m}/${+day}`; };
const todayStr = () => new Date().toISOString().slice(0, 10);
const pct = (done, total) => (total ? Math.round((100 * done) / total) : null);
// Cell tint by %, matching the app's status language.
const tintClass = (p) => (p == null ? 'rc-none' : p >= 100 ? 'rc-done' : p > 0 ? 'rc-work' : 'rc-todo');

const isPartLate = (r) =>
  r.status !== 'Received' && (!!r.flag_late ||
    (!!r.expected_delivery && r.expected_delivery.slice(0, 10) < todayStr()));

// Roll a tracker's rows for one boat → { done, total, remaining[] }, N/A excluded.
function rollup(rowsByTask, tasks, finalOf) {
  let done = 0, total = 0; const remaining = [];
  for (const t of tasks) {
    const row = rowsByTask?.[t] || {};
    if (row.na) continue;
    total++;
    if ((row.status || '') === finalOf(t)) done++; else remaining.push(t);
  }
  return { done, total, remaining };
}

const BOAT_FLAGS = [
  ['flag_issue', 'Issue / Delay'], ['flag_rework', 'Required Rework'],
  ['flag_unsatisfactory', 'Unsatisfactory'], ['flag_missing_parts', 'Missing Parts'],
  ['flag_late_parts', 'Late Parts'],
];

function ShopReport({ onClose }) {
  const [data, setData] = useState(null);
  const [commentary, setCommentary] = useState(null); // null=loading, ''=unavailable
  const [error, setError] = useState(false);

  // While the report is open, print should show ONLY the report (hide the app behind it).
  useEffect(() => {
    document.body.classList.add('report-open');
    return () => document.body.classList.remove('report-open');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [boats, lam, fin, asm, parts, std] = await Promise.all([
          apiFetch('/api/boats').then(r => r.json()),
          apiFetch('/api/lamination').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/api/finishing').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/api/assembly').then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/api/parts').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/api/parts/standard').then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        setData(buildReport(boats, lam, fin, asm, parts, std));
      } catch (e) { setError(true); }
    })();
    // AI commentary — same question as Ask the B.O.S.S's "full shop status" chip.
    (async () => {
      try {
        const r = await apiFetch('/api/ask', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: 'Give me a full shop status — where every active boat stands, what needs attention, and anything notable. Keep it to a tight executive summary.' }),
        });
        const j = await r.json();
        setCommentary(r.ok && j.answer ? j.answer : '');
      } catch (e) { setCommentary(''); }
    })();
  }, []);

  if (error) return (
    <div className="report-overlay"><div className="report-toolbar no-print"><button className="report-close" onClick={onClose}>✕ Close</button></div>
      <div className="report-doc"><p>Couldn't load the report data. Check the backend connection.</p></div></div>
  );
  if (!data) return (
    <div className="report-overlay"><div className="report-toolbar no-print"><button className="report-close" onClick={onClose}>✕ Close</button></div>
      <div className="report-doc"><div className="loading">Building shop report…</div></div></div>
  );

  const { rows, punch, dateLabel } = data;

  return (
    <div className="report-overlay">
      <div className="report-toolbar no-print">
        <button className="report-print" onClick={() => window.print()}>🖨 Print</button>
        <button className="report-close" onClick={onClose}>✕ Close</button>
      </div>
      <div className="report-doc">
        <header className="report-head">
          <div className="report-head-left"><Logo size={20} /><div><div className="report-title">Shop Status Report</div><div className="report-sub">Bluewater Operations and Shop System</div></div></div>
          <div className="report-date">{dateLabel}<br /><span>{rows.length} boats in production</span></div>
        </header>

        {/* AI commentary — same engine as Ask the B.O.S.S */}
        <section className="report-commentary">
          <div className="report-section-title">Summary</div>
          {commentary === null ? <div className="report-quiet">Generating summary…</div>
            : commentary === '' ? <div className="report-quiet">AI summary unavailable — see the tables below.</div>
            : <div className="report-md">{renderAnswer(commentary)}</div>}
        </section>

        {/* At-a-glance summary table */}
        <section>
          <div className="report-section-title">Every boat, at a glance</div>
          <table className="report-table">
            <thead><tr>
              <th className="rc-boat">#  Boat · Customer</th><th>Stage</th><th>Lam</th><th>Finish</th><th>Assy</th><th>Key Parts</th><th className="rc-att">Attention</th>
            </tr></thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.boat_id}>
                  <td className="rc-boat"><b>{b.seq}</b> · {b.boat_id} {b.customer_name} <span className="rc-meta">{b.boat_model}·{b.hull_color}</span></td>
                  <td className="rc-ctr">{b.stage}</td>
                  <td className={`rc-ctr ${tintClass(b.lam)}`}>{b.lam == null ? '—' : `${b.lam}%`}</td>
                  <td className={`rc-ctr ${tintClass(b.fin)}`}>{b.fin == null ? '—' : `${b.fin}%`}</td>
                  <td className={`rc-ctr ${tintClass(b.asy)}`}>{b.asy == null ? '—' : `${b.asy}%`}</td>
                  <td className={`rc-ctr ${tintClass(pct(b.partsReceived, b.partsTotal))}`}>{b.partsReceived}/{b.partsTotal}</td>
                  <td className="rc-att">{b.attention.length ? b.attention.join(' · ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Punch list */}
        <section className="report-punch">
          <div className="report-section-title">Needs attention</div>
          <PunchRow label="🔴 Order ASAP" color="#A32D2D" items={punch.asap} empty="No parts flagged Order ASAP." />
          <PunchRow label="🕓 Late / overdue parts" color="#854F0B" items={punch.late} empty="No overdue parts." />
          <PunchRow label="⚠ Boat flags" color="#A32D2D" items={punch.flags} empty="No boat flags set." />
        </section>

        {/* Per-boat detail — Backlog boats omitted (no shop work started yet). */}
        <section className="report-detail-wrap">
          <div className="report-section-title">Boat detail <span className="report-detail-hint">(in production — Backlog boats not shown)</span></div>
          {rows.filter(b => b.stage !== 'Backlog').map(b => (
            <div key={b.boat_id} className="report-boat">
              <div className="report-boat-head">{b.seq}. {b.boat_id} · {b.customer_name} <span className="rc-meta">{b.boat_model} · {b.hull_color} · {b.stage}</span></div>
              <div className="report-boat-grid">
                <DetailCol title={`Lamination ${b.lam == null ? '' : b.lam + '%'}`} done={b.lam === 100} items={b.lamRemaining} allLabel="All laminated." noneLabel="No lamination tracked." />
                <DetailCol title={`Finishing ${b.fin == null ? '' : b.fin + '%'}`} done={b.fin === 100} items={b.finRemaining} allLabel="All finished." noneLabel="Not in finishing yet." />
                <DetailCol title={`Assembly ${b.asy == null ? '' : b.asy + '%'}`} done={b.asy === 100} items={b.asyRemaining} allLabel="All assembled." noneLabel="No checklists yet." />
                <DetailCol title={`Key parts ${b.partsReceived}/${b.partsTotal}`} done={b.partsOutstanding.length === 0} items={b.partsOutstanding} allLabel="All parts received." noneLabel="No parts." />
              </div>
            </div>
          ))}
        </section>

        <div className="report-foot">Generated {dateLabel} · Bluewater B.O.S.S · figures from live tracker data · delivered boats excluded</div>
      </div>
    </div>
  );
}

function PunchRow({ label, color, items, empty }) {
  // Group by boat so each boat is one readable line, not a run-on list.
  const groups = []; const idx = {};
  for (const it of items) {
    if (idx[it.boat] == null) { idx[it.boat] = groups.length; groups.push({ boat: it.boat, texts: [] }); }
    groups[idx[it.boat]].texts.push(it.text);
  }
  return (
    <div className="report-punch-row">
      <div className="report-punch-label" style={{ color }}>{label}{items.length ? ` (${items.length})` : ''}</div>
      {groups.length
        ? <ul className="report-punch-list">{groups.map((g, i) => <li key={i}><b>{g.boat}</b> — {g.texts.join(', ')}</li>)}</ul>
        : <div className="report-punch-items"><span className="report-quiet">{empty}</span></div>}
    </div>
  );
}

function DetailCol({ title, done, items, allLabel, noneLabel }) {
  return (
    <div className="report-detail-col">
      <div className="report-detail-title">{title}</div>
      {items === null ? <div className="report-quiet">{noneLabel}</div>
        : items.length === 0 ? <div className="report-detail-done">✓ {allLabel}</div>
        : <ul className="report-detail-list">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </div>
  );
}

// ---- Data assembly ----
function buildReport(boats, lam, fin, asm, parts, std) {
  const byBoatTask = (list) => { const m = {}; for (const r of list) { (m[r.boat_id] ||= {})[r.task_name] = r; } return m; };
  const lamMap = byBoatTask(lam), finMap = byBoatTask(fin);
  const partsByBoat = {}; for (const p of parts) (partsByBoat[p.boat_id] ||= []).push(p);
  // Assembly: work centers (excl. Build Improvements) + rows keyed boat→wc.
  const wcs = (asm?.work_centers || []).filter(w => !/build\s*improvement/i.test(w.name || ''));
  const asmByBoat = {}; for (const r of (asm?.rows || [])) (asmByBoat[r.boat_id] ||= {})[r.work_center_id] = r;

  const active = boats.filter(b => b.global_status !== 'Delivered')
    .sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999));

  const punch = { asap: [], late: [], flags: [] };

  const rows = active.map((b, idx) => {
    const lamR = rollup(lamMap[b.boat_id], LAM_TASKS, LAM_FINAL);
    const finR = rollup(finMap[b.boat_id], FIN_TASKS, () => 'Complete');
    // Assembly rollup across this boat's work centers.
    let aDone = 0, aTotal = 0; const asyRemaining = [];
    for (const w of wcs) {
      const row = asmByBoat[b.boat_id]?.[w.id];
      if (!row || !row.total_items) continue;
      aDone += row.completed_items; aTotal += row.total_items;
      const left = (row.total_items - row.completed_items);
      if (left > 0) {
        // Show WHAT's missing (the item names), capped so the report stays tight;
        // fall back to a count if the backend didn't send item names.
        const names = Array.isArray(row.remaining) ? row.remaining : [];
        asyRemaining.push(names.length
          ? `${w.name}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? `, +${names.length - 5} more` : ''}`
          : `${w.name}: ${left} left`);
      }
    }
    // Key parts.
    const prows = partsByBoat[b.boat_id] || [];
    const customCount = prows.filter(p => p.is_custom).length;
    const partsTotal = std.length + customCount;
    const received = prows.filter(p => p.status === 'Received').length;
    const partsOutstanding = [];
    for (const name of std) {
      const r = prows.find(p => p.part_name === name && !p.is_custom) || {};
      if (r.status !== 'Received') partsOutstanding.push(partLabel(name, r));
    }
    for (const p of prows.filter(p => p.is_custom && p.status !== 'Received')) partsOutstanding.push(partLabel(p.part_name, p));

    // Punch-list contributions — {boat, text} so the report can group by boat.
    const boatLabel = `${b.boat_id} ${b.customer_name}`;
    for (const p of prows) {
      if (p.status !== 'Received' && p.order_asap) punch.asap.push({ boat: boatLabel, text: p.part_name });
      if (isPartLate(p)) punch.late.push({ boat: boatLabel, text: `${p.part_name}${p.expected_delivery ? ` (exp ${fmtDate(p.expected_delivery)})` : ''}` });
    }
    const flagsOn = BOAT_FLAGS.filter(([k]) => b[k]).map(([, label]) => label);
    if (flagsOn.length) punch.flags.push({ boat: boatLabel, text: flagsOn.join(', ') });

    // Per-boat attention shorthand for the summary table.
    const attention = [];
    const asapN = prows.filter(p => p.status !== 'Received' && p.order_asap).length;
    const lateN = prows.filter(isPartLate).length;
    if (asapN) attention.push(`🔴 ${asapN} ASAP`);
    if (lateN) attention.push(`🕓 ${lateN} late`);
    if (flagsOn.length) attention.push(`⚠ ${flagsOn.length} flag${flagsOn.length > 1 ? 's' : ''}`);

    const stageIdx = STAGES.indexOf(b.global_status);
    const inLam = stageIdx >= STAGES.indexOf('Glass Shop');
    const inFin = stageIdx >= STAGES.indexOf('Back Line');
    return {
      boat_id: b.boat_id, customer_name: b.customer_name, boat_model: b.boat_model, hull_color: b.hull_color,
      seq: b.sequence_number || idx + 1, stage: b.global_status,
      lam: lamR.total ? pct(lamR.done, lamR.total) : null,
      fin: finR.total ? pct(finR.done, finR.total) : null,
      asy: aTotal ? pct(aDone, aTotal) : null,
      lamRemaining: lamR.total ? lamR.remaining : (inLam ? [] : null),
      finRemaining: finR.total ? finR.remaining : (inFin ? [] : null),
      asyRemaining: aTotal ? asyRemaining : null,
      partsTotal, partsReceived: received, partsOutstanding,
      attention,
    };
  });

  const dateLabel = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return { rows, punch, dateLabel };
}

function partLabel(name, r) {
  const st = r.status || 'Not Ordered';
  if (st === 'Ordered') return `${name} (exp ${fmtDate(r.expected_delivery) || '—'})`;
  if (r.order_asap) return `${name} (ORDER ASAP)`;
  return `${name} (not ordered)`;
}

export default ShopReport;
