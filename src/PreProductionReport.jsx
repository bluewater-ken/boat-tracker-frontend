import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from './api';
import Logo from './Logo';
import './PreProductionReport.css';

// Pre-Production Report — one boat, every step needed to build it: lamination,
// finishing, and every CompanyCam checklist EXCEPT Quality Control (QC is an
// end-of-line inspection, not build work). Print-only, one boat per page-run.

const LAM_TASKS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid', 'Other'];
const FIN_TASKS = ['Hull', 'Liner', 'Ring', 'Hard Top', 'Console', 'Console Face', 'Hatches', 'Leaning Post', 'Buckets', 'Other'];
// A lamination task counts as done once it's on the mold or pulled (pulling just
// frees the mold). Glass Kit is non-mold, so it's done at Complete.
const lamDone = (task, status) => (task === 'Glass Kit' ? ['Complete'] : ['Complete/On Mold', 'Pulled']).includes(status || '');

// CompanyCam checklists carry template cruft that isn't shop work — drop it so the
// traveler only lists real steps.
const NOISE = [/template is a new format/i, /provide feedback/i, /^additional notes/i, /^approved by/i, /read carefully/i, /input pictures here/i];
function cleanItem(raw) {
  const s = String(raw).replace(/\*\*|__/g, '').trim();
  if (!s || s.includes('🛑')) return null;
  return NOISE.some(re => re.test(s)) ? null : s;
}

const titleCase = (id) => String(id || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fmtDate = (d) => { if (!d) return ''; const [, m, day] = String(d).slice(0, 10).split('-'); return `${+m}/${+day}`; };
const todayStr = () => new Date().toISOString().slice(0, 10);
const isLate = (p) => p.status !== 'Received' && (!!p.flag_late ||
  (!!p.expected_delivery && String(p.expected_delivery).slice(0, 10) < todayStr()));

// One part → the line the shop reads: where it stands and the date that matters.
function partLine(name, p) {
  const st = p.status || 'Not Ordered';
  const when = st === 'Received' ? `rec ${fmtDate(p.actual_delivery || p.received_at) || '—'}`
    : st === 'Ordered' ? `exp ${fmtDate(p.expected_delivery) || '—'}`
    : 'not ordered';
  const tags = [];
  if (st !== 'Received' && p.order_asap) tags.push({ t: 'ORDER ASAP', c: 'asap' });
  if (isLate(p)) tags.push({ t: 'LATE', c: 'late' });
  if (p.flag_backordered) tags.push({ t: 'BACKORDER', c: 'late' });
  if (p.flag_partial && st !== 'Received') tags.push({ t: 'PARTIAL', c: 'partial' });
  return { name, done: st === 'Received', na: !!p.na, status: st, when, spec: p.description || '', tags };
}

function build(b, lamRows, finRows, wcs, asmRows, parts, std) {
  const lamBy = {}; for (const r of lamRows) if (r.boat_id === b.boat_id) lamBy[r.task_name] = r;
  const finBy = {}; for (const r of finRows) if (r.boat_id === b.boat_id) finBy[r.task_name] = r;

  const lam = LAM_TASKS.map(t => {
    const r = lamBy[t];
    if (!r) return null;
    return { name: t, na: !!r.na, done: lamDone(t, r.status), status: r.status || 'Not Started' };
  }).filter(Boolean);
  // "Transducer Type" records WHICH transducer mold this boat uses (and whether it's
  // available) — a spec you need when planning a build, which is why Ken wants it here.
  // It is never built or completed, so it shows as a reference row and is excluded
  // from the step counts (counting it would cap every boat below 100% forever).
  const td = lamBy['Transducer Type'];
  if (td) lam.push({
    name: 'Transducer Type', ref: true, done: false, na: !!td.na,
    status: td.status || '—', note: td.notes || '',
  });

  const fin = FIN_TASKS.map(t => {
    const r = finBy[t];
    if (!r) return null;
    return { name: t, na: !!r.na || r.status === 'Not Available', done: r.status === 'Complete', status: r.status || 'Not Started' };
  }).filter(Boolean);

  // Every CompanyCam work center except QC, in board order.
  const cc = wcs
    .filter(w => w.id !== 'quality-control')
    .map(w => {
      const row = asmRows.find(r => r.boat_id === b.boat_id && r.work_center_id === w.id);
      if (!row) return null;
      const items = (row.items || []).map(i => {
        const name = cleanItem(i.name);
        return name ? { name, done: !!i.done } : null;
      }).filter(Boolean);
      // Older/delivered boats have no items[] — fall back to the open list.
      const fallback = !items.length && (row.remaining || []).length
        ? (row.remaining || []).map(n => cleanItem(n)).filter(Boolean).map(name => ({ name, done: false }))
        : [];
      const list = items.length ? items : fallback;
      return list.length ? { label: w.name || titleCase(w.id), items: list } : null;
    }).filter(Boolean);

  // Reference rows (Transducer Type) and N/A never count as build steps.
  // Key Parts — standard list first (in the shop's order), then this boat's customs.
  const prows = parts.filter(p => p.boat_id === b.boat_id);
  const partList = [];
  for (const name of std) {
    const p = prows.find(x => x.part_name === name && !x.is_custom);
    if (p) partList.push(partLine(name, p));
  }
  for (const p of prows.filter(x => x.is_custom)) partList.push(partLine(p.part_name, p));

  const count = (arr) => ({
    done: arr.filter(i => i.done && !i.na && !i.ref).length,
    total: arr.filter(i => !i.na && !i.ref).length,
  });
  const lc = count(lam), fc = count(fin), pc = count(partList);
  const ccDone = cc.reduce((n, g) => n + g.items.filter(i => i.done).length, 0);
  const ccTotal = cc.reduce((n, g) => n + g.items.length, 0);

  const engines = [1, 2, 3].map(i => {
    const brand = b[`engine_brand_${i}`], choice = b[`engine_choice_${i}`];
    return brand || choice ? `${brand || ''} ${choice || ''}`.trim() : null;
  }).filter(Boolean);
  const engineStr = engines.length ? (engines.every(e => e === engines[0]) ? `${engines.length}× ${engines[0]}` : engines.join(' · ')) : '';

  return {
    boat_id: b.boat_id, customer: b.customer_name, model: b.boat_model, hull: b.hull_color,
    engines: engineStr, is_spare: b.is_spare, seq: b.sequence_number, stage: b.global_status,
    lam, fin, cc, parts: partList,
    totals: { done: lc.done + fc.done + pc.done + ccDone, total: lc.total + fc.total + pc.total + ccTotal },
    lc, fc, pc, ccDone, ccTotal,
  };
}

function PreProductionReport({ boatIds, onClose }) {
  const [boats, setBoats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.body.classList.add('ppr-open');
    return () => document.body.classList.remove('ppr-open');
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [all, lam, fin, asm, parts, std] = await Promise.all([
          apiFetch('/api/boats').then(r => r.json()),
          apiFetch('/api/lamination').then(r => (r.ok ? r.json() : [])).catch(() => []),
          apiFetch('/api/finishing').then(r => (r.ok ? r.json() : [])).catch(() => []),
          apiFetch('/api/assembly').then(r => (r.ok ? r.json() : null)).catch(() => null),
          apiFetch('/api/parts').then(r => (r.ok ? r.json() : [])).catch(() => []),
          apiFetch('/api/parts/standard').then(r => (r.ok ? r.json() : [])).catch(() => []),
        ]);
        const wcs = (asm?.work_centers || []).slice().sort((a, b2) => (a.sort_order || 0) - (b2.sort_order || 0));
        const byId = {}; for (const b of all) byId[b.boat_id] = b;
        const built = boatIds.map(id => byId[id]).filter(Boolean)
          .map(b => build(b, lam || [], fin || [], wcs, asm?.rows || [], parts || [], std || []));
        if (live) setBoats(built);
      } catch (e) { if (live) setError(true); }
    })();
    return () => { live = false; };
  }, [boatIds]);

  const dateLabel = new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

  let content;
  if (error) content = (
    <div className="ppr-overlay"><div className="ppr-toolbar no-print"><button className="ppr-close" onClick={onClose}>✕ Close</button></div>
      <div className="ppr-doc"><p style={{ padding: 24 }}>Couldn't load the report data.</p></div></div>
  );
  else if (!boats) content = (
    <div className="ppr-overlay"><div className="ppr-toolbar no-print"><button className="ppr-close" onClick={onClose}>✕ Close</button></div>
      <div className="ppr-doc"><div className="ppr-loading">Building pre-production report…</div></div></div>
  );
  else content = (
    <div className="ppr-overlay">
      <div className="ppr-toolbar no-print">
        <span className="ppr-toolbar-label">{boats.length === 1 ? boats[0].boat_id : `${boats.length} boats`}</span>
        <button className="ppr-print" onClick={() => window.print()}>🖨 Print</button>
        <button className="ppr-close" onClick={onClose}>✕ Close</button>
      </div>
      <div className="ppr-doc">
        {boats.length === 0 ? <div className="ppr-loading">No matching boats.</div>
          : boats.map(b => <Page key={b.boat_id} b={b} dateLabel={dateLabel} />)}
      </div>
    </div>
  );
  // Portal to <body> so the print rule that hides .app doesn't hide the report too.
  return createPortal(content, document.body);
}

function Page({ b, dateLabel }) {
  const left = b.totals.total - b.totals.done;
  return (
    <div className="ppr-page">
      <header className="ppr-head">
        <div>
          <div className="ppr-title">
            {b.seq ? `${b.seq}. ` : ''}{b.boat_id} · {b.customer}
            {b.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>}
          </div>
          <div className="ppr-sub">{[b.model, b.hull, b.engines].filter(Boolean).join(' · ')}</div>
          <div className="ppr-kicker">Pre-Production Report · every build step · current stage: {b.stage}</div>
        </div>
        <div className="ppr-head-right">
          <Logo size={30} light={false} />
          <div className="ppr-week">Week of {dateLabel}</div>
        </div>
      </header>

      <div className="ppr-tiles">
        <Tile label="Total steps" value={b.totals.total} />
        <Tile label="Done" value={b.totals.done} tone="done" />
        <Tile label="Remaining" value={left} tone={left ? 'todo' : 'done'} />
        <Tile label="Key Parts" value={`${b.pc.done}/${b.pc.total}`} />
        <Tile label="Lamination" value={`${b.lc.done}/${b.lc.total}`} />
        <Tile label="Finishing" value={`${b.fc.done}/${b.fc.total}`} />
        <Tile label="Assembly" value={`${b.ccDone}/${b.ccTotal}`} />
      </div>

      {/* Parts first — lead times gate everything else in pre-production. */}
      <Section title={`Key Parts · ${b.pc.done}/${b.pc.total} received`}>
        {b.parts.length ? (
          <ul className="ppr-list ppr-partlist">
            {b.parts.map((p, i) => (
              <li key={i} className={p.na ? 'na' : p.done ? 'done' : ''}>
                <span className="ppr-box">{p.done ? '✓' : p.na ? '–' : ''}</span>
                <span className="ppr-partmain">
                  {p.name}
                  {p.spec && <span className="ppr-spec"> — {p.spec}</span>}
                  {p.tags.map((t, j) => <span key={j} className={`ppr-tag ppr-tag-${t.c}`}>{t.t}</span>)}
                </span>
                <span className="ppr-status">{p.na ? 'N/A' : p.when}</span>
              </li>
            ))}
          </ul>
        ) : <div className="ppr-quiet">No parts tracked for this boat.</div>}
      </Section>

      <Section title={`Lamination · ${b.lc.done}/${b.lc.total}`}>
        {b.lam.length ? <StatusList items={b.lam} /> : <div className="ppr-quiet">No lamination tasks.</div>}
      </Section>

      <Section title={`Finishing · ${b.fc.done}/${b.fc.total}`}>
        {b.fin.length ? <StatusList items={b.fin} /> : <div className="ppr-quiet">No finishing tasks.</div>}
      </Section>

      {b.cc.length === 0
        ? <Section title="Assembly"><div className="ppr-quiet">No CompanyCam checklists yet.</div></Section>
        : b.cc.map(g => (
          <Section key={g.label} title={`${g.label} · ${g.items.filter(i => i.done).length}/${g.items.length}`}>
            <ul className="ppr-list">
              {g.items.map((it, i) => (
                <li key={i} className={it.done ? 'done' : ''}><span className="ppr-box">{it.done ? '✓' : ''}</span>{it.name}</li>
              ))}
            </ul>
          </Section>
        ))}

      <div className="ppr-foot">
        Generated {dateLabel} · Bluewater B.O.S.S · every build step except Quality Control (end-of-line inspection)
      </div>
    </div>
  );
}

function Tile({ label, value, tone }) {
  return <div className={`ppr-tile ${tone ? `ppr-t-${tone}` : ''}`}><div className="ppr-tile-label">{label}</div><div className="ppr-tile-value">{value}</div></div>;
}
function Section({ title, children }) {
  return <section className="ppr-section"><div className="ppr-section-title">{title}</div>{children}</section>;
}
// Lamination/finishing carry a real status word (Mold Open, In Progress…), so show it.
function StatusList({ items }) {
  return (
    <ul className="ppr-list ppr-statuslist">
      {items.map((it, i) => (
        <li key={i} className={it.ref ? 'ref' : it.na ? 'na' : it.done ? 'done' : ''}>
          <span className="ppr-box">{it.ref ? 'i' : it.done ? '✓' : it.na ? '–' : ''}</span>
          {it.name}
          <span className="ppr-status">
            {it.ref ? `${it.status}${it.note ? ` · ${it.note}` : ''}` : it.na ? 'N/A' : it.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default PreProductionReport;
