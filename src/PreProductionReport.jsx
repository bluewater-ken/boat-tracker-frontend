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

function build(b, lamRows, finRows, wcs, asmRows) {
  const lamBy = {}; for (const r of lamRows) if (r.boat_id === b.boat_id) lamBy[r.task_name] = r;
  const finBy = {}; for (const r of finRows) if (r.boat_id === b.boat_id) finBy[r.task_name] = r;

  // Lamination — Transducer is a mold reference, never build work, so it's excluded.
  const lam = LAM_TASKS.map(t => {
    const r = lamBy[t];
    if (!r) return null;
    return { name: t, na: !!r.na, done: lamDone(t, r.status), status: r.status || 'Not Started' };
  }).filter(Boolean);

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

  const count = (arr) => ({ done: arr.filter(i => i.done && !i.na).length, total: arr.filter(i => !i.na).length });
  const lc = count(lam), fc = count(fin);
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
    lam, fin, cc,
    totals: { done: lc.done + fc.done + ccDone, total: lc.total + fc.total + ccTotal },
    lc, fc, ccDone, ccTotal,
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
        const [all, lam, fin, asm] = await Promise.all([
          apiFetch('/api/boats').then(r => r.json()),
          apiFetch('/api/lamination').then(r => (r.ok ? r.json() : [])).catch(() => []),
          apiFetch('/api/finishing').then(r => (r.ok ? r.json() : [])).catch(() => []),
          apiFetch('/api/assembly').then(r => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        const wcs = (asm?.work_centers || []).slice().sort((a, b2) => (a.sort_order || 0) - (b2.sort_order || 0));
        const byId = {}; for (const b of all) byId[b.boat_id] = b;
        const built = boatIds.map(id => byId[id]).filter(Boolean)
          .map(b => build(b, lam || [], fin || [], wcs, asm?.rows || []));
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
        <Tile label="Lamination" value={`${b.lc.done}/${b.lc.total}`} />
        <Tile label="Finishing" value={`${b.fc.done}/${b.fc.total}`} />
        <Tile label="Assembly" value={`${b.ccDone}/${b.ccTotal}`} />
      </div>

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
        <li key={i} className={it.na ? 'na' : it.done ? 'done' : ''}>
          <span className="ppr-box">{it.done ? '✓' : it.na ? '–' : ''}</span>
          {it.name}
          <span className="ppr-status">{it.na ? 'N/A' : it.status}</span>
        </li>
      ))}
    </ul>
  );
}

export default PreProductionReport;
