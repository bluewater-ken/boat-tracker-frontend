import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { renderAnswer } from './markdown';
import Logo from './Logo';
import './BoatReport.css';

// Boat Status Report — a one-page-per-boat printable dashboard, built to live on
// the assembly-shop wall. Everything the app knows about a boat: stage, the four
// area rollups, parts, flags, recent activity, and a deep Assembly section that
// lists every open CompanyCam item per work center (the crew's real to-do list).
// Print-only: no clickable anything. Prints on letter portrait; long assembly
// lists flow to a second page rather than being truncated.

const STAGES = ['Backlog', 'Pre-Production', 'Glass Shop', 'Back Line', 'Front Line', 'QC', 'Delivered'];
const LAM_TASKS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid', 'Other'];
const LAM_DONE = (t) => (t === 'Glass Kit' ? ['Complete'] : ['Complete/On Mold', 'Pulled']);
const FIN_TASKS = ['Hull', 'Liner', 'Ring', 'Hard Top', 'Console', 'Console Face', 'Hatches', 'Leaning Post', 'Buckets', 'Other'];

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { if (!d) return ''; const [, m, day] = d.slice(0, 10).split('-'); return `${+m}/${+day}`; };
const pct = (done, total) => (total ? Math.round((100 * done) / total) : null);
const tintClass = (p) => (p == null ? 'br-t-none' : p >= 100 ? 'br-t-done' : p > 0 ? 'br-t-work' : 'br-t-todo');

const isPartLate = (r) =>
  r.status !== 'Received' && (!!r.flag_late ||
    (!!r.expected_delivery && r.expected_delivery.slice(0, 10) < todayStr()));

const BOAT_FLAGS = [
  ['flag_issue', 'Issue / Delay'], ['flag_rework', 'Required Rework'],
  ['flag_unsatisfactory', 'Unsatisfactory'], ['flag_missing_parts', 'Missing Parts'],
  ['flag_late_parts', 'Late Parts'],
];

// CompanyCam checklists carry template cruft that isn't real shop work — a
// "new format" notice, feedback prompts, sign-off rows, and 🛑section headers🛑.
// Strip markdown and drop the non-actionable lines so the crew sees only tasks.
const NOISE = [
  /template is a new format/i, /provide feedback/i, /^additional notes/i,
  /^approved by/i, /read carefully/i, /input pictures here/i,
];
function cleanItem(raw) {
  let s = String(raw).replace(/\*\*|__/g, '').trim();
  if (!s) return null;
  if (s.includes('🛑')) return null;            // QC section dividers
  if (NOISE.some(re => re.test(s))) return null;
  return s;
}

function rollup(rowsByTask, tasks, doneOf) {
  let done = 0, total = 0; const list = [];
  for (const t of tasks) {
    const row = rowsByTask?.[t] || {};
    if (row.na) continue;
    total++;
    const finals = doneOf(t);
    const isDone = (Array.isArray(finals) ? finals : [finals]).includes(row.status || '');
    if (isDone) done++;
    list.push({ name: t, done: isDone });
  }
  return { done, total, list };
}

function partLabel(name, r) {
  const st = r.status || 'Not Ordered';
  if (r.order_asap && st !== 'Received') return `${name} — ORDER ASAP`;
  if (st === 'Ordered') return `${name} — exp ${fmtDate(r.expected_delivery) || '—'}`;
  return `${name} — not ordered`;
}

// ---- per-boat model ----
function buildBoat(b, tl, lamMap, finMap, wcs, asmByBoat, partsByBoat, std, feedByBoat) {
  const lamR = rollup(lamMap[b.boat_id], LAM_TASKS, LAM_DONE);
  const finR = rollup(finMap[b.boat_id], FIN_TASKS, () => 'Complete');

  // Deep assembly: one block per work center with its full open-item list.
  let aDone = 0, aTotal = 0;
  const stations = [];
  for (const w of wcs) {
    const row = asmByBoat[b.boat_id]?.[w.id];
    if (!row || !row.total_items) continue;
    aDone += row.completed_items; aTotal += row.total_items;
    const open = (Array.isArray(row.remaining) ? row.remaining : [])
      .map(cleanItem).filter(Boolean);
    const doneN = row.completed_items, totN = row.total_items;
    stations.push({
      name: w.name, done: doneN, total: totN, open,
      state: doneN >= totN ? 'complete' : doneN === 0 ? 'notstarted' : 'progress',
    });
  }

  // Parts — N/A drops out of count and the outstanding list.
  const prows = partsByBoat[b.boat_id] || [];
  const naStd = new Set(prows.filter(p => !p.is_custom && p.na).map(p => p.part_name));
  const stdApplicable = std.filter(name => !naStd.has(name));
  const customApplicable = prows.filter(p => p.is_custom && !p.na);
  const partsTotal = stdApplicable.length + customApplicable.length;
  const received = prows.filter(p => !p.na && p.status === 'Received').length;
  const partsOutstanding = [];
  for (const name of stdApplicable) {
    const r = prows.find(p => p.part_name === name && !p.is_custom) || {};
    if (r.status !== 'Received') partsOutstanding.push(partLabel(name, r));
  }
  for (const p of customApplicable.filter(p => p.status !== 'Received')) partsOutstanding.push(partLabel(p.part_name, p));

  // Needs attention.
  const attention = [];
  for (const p of prows) if (p.status !== 'Received' && p.order_asap) attention.push({ tone: 'red', text: `Order ASAP — ${p.part_name}` });
  for (const p of prows) if (isPartLate(p)) attention.push({ tone: 'amber', text: `Late part — ${p.part_name}${p.expected_delivery ? ` (exp ${fmtDate(p.expected_delivery)})` : ''}` });
  const flagsOn = BOAT_FLAGS.filter(([k]) => b[k]).map(([, l]) => l);
  for (const f of flagsOn) attention.push({ tone: 'red', text: `Flag — ${f}` });
  for (const s of stations) if (s.state === 'notstarted') attention.push({ tone: 'amber', text: `Assembly not started — ${s.name}` });

  // Recent activity — real checklist checkoffs + photos, noise removed, latest first.
  const activity = (feedByBoat[b.boat_id] || [])
    .filter(e => e.type !== 'CHECKLIST_ITEM_COMPLETED' || cleanItem(e.title))
    .slice(0, 8)
    .map(e => ({
      date: fmtDate(e.created_at), type: e.type,
      text: e.type === 'PHOTO_ADDED' ? 'Photo added'
        : e.type === 'CHECKLIST_ITEM_COMPLETED' ? (cleanItem(e.title) || e.title)
        : (e.title || e.type),
    }));
  const lastAsmActivity = (feedByBoat[b.boat_id] || [])
    .find(e => e.type === 'CHECKLIST_ITEM_COMPLETED');

  // Engines — collapse identical slots to "N× Brand Model".
  const engines = [1, 2, 3].map(i => {
    const brand = b[`engine_brand_${i}`], choice = b[`engine_choice_${i}`];
    return brand || choice ? `${brand || ''} ${choice || ''}`.trim() : null;
  }).filter(Boolean);
  let engineStr = '—';
  if (engines.length) {
    const allSame = engines.every(e => e === engines[0]);
    engineStr = allSame ? `${engines.length}× ${engines[0]}` : engines.join(' · ');
  }

  const stageIdx = STAGES.indexOf(b.global_status);
  const inLam = stageIdx >= STAGES.indexOf('Glass Shop');
  const inFin = stageIdx >= STAGES.indexOf('Back Line');

  return {
    boat_id: b.boat_id, customer: b.customer_name, model: b.boat_model,
    hull: b.hull_color, engines: engineStr, is_spare: b.is_spare,
    seq: b.sequence_number, stage: b.global_status, stageIdx,
    target: tl?.target_date, projected: tl?.projected_end, behind: tl?.behind_days,
    lam: lamR.total ? pct(lamR.done, lamR.total) : null,
    fin: finR.total ? pct(finR.done, finR.total) : null,
    asy: aTotal ? pct(aDone, aTotal) : null,
    lamTasks: lamR.total ? lamR.list : (inLam ? [] : null),
    finTasks: finR.total ? finR.list : (inFin ? [] : null),
    stations, lastAsmActivity: lastAsmActivity ? fmtDate(lastAsmActivity.created_at) : null,
    partsTotal, partsReceived: received, partsOutstanding,
    attention, activity,
  };
}

function BoatReport({ boatIds, onClose }) {
  const [boats, setBoats] = useState(null); // array of built models
  const [error, setError] = useState(false);

  useEffect(() => {
    document.body.classList.add('boat-report-open');
    return () => document.body.classList.remove('boat-report-open');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [all, lam, fin, asm, parts, std, timeline, feed] = await Promise.all([
          apiFetch('/api/boats').then(r => r.json()),
          apiFetch('/api/lamination').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/api/finishing').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/api/assembly').then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/api/parts').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/api/parts/standard').then(r => r.ok ? r.json() : []).catch(() => []),
          apiFetch('/api/timeline').then(r => r.ok ? r.json() : null).catch(() => null),
          apiFetch('/api/assembly/feed?limit=1000').then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        const byBoatTask = (list) => { const m = {}; for (const r of list) (m[r.boat_id] ||= {})[r.task_name] = r; return m; };
        const lamMap = byBoatTask(lam), finMap = byBoatTask(fin);
        const partsByBoat = {}; for (const p of parts) (partsByBoat[p.boat_id] ||= []).push(p);
        const wcs = (asm?.work_centers || []).filter(w => !/build\s*improvement/i.test(w.name || ''));
        const asmByBoat = {}; for (const r of (asm?.rows || [])) (asmByBoat[r.boat_id] ||= {})[r.work_center_id] = r;
        const tlByBoat = {}; for (const g of (timeline?.groups || [])) if (g.kind === 'boat') tlByBoat[g.key] = g;
        const feedByBoat = {}; for (const e of (Array.isArray(feed) ? feed : [])) (feedByBoat[e.boat_id] ||= []).push(e);

        const byId = {}; for (const b of all) byId[b.boat_id] = b;
        const built = boatIds.map(id => byId[id]).filter(Boolean)
          .map(b => buildBoat(b, tlByBoat[b.boat_id], lamMap, finMap, wcs, asmByBoat, partsByBoat, std, feedByBoat));
        setBoats(built);
      } catch (e) { setError(true); }
    })();
  }, [boatIds]);

  const dateLabel = new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

  if (error) return (
    <div className="br-overlay"><div className="br-toolbar no-print"><button className="br-close" onClick={onClose}>✕ Close</button></div>
      <div className="br-doc"><p style={{ padding: 24 }}>Couldn't load report data. Check the backend connection.</p></div></div>
  );
  if (!boats) return (
    <div className="br-overlay"><div className="br-toolbar no-print"><button className="br-close" onClick={onClose}>✕ Close</button></div>
      <div className="br-doc"><div className="br-loading">Building boat report…</div></div></div>
  );

  return (
    <div className="br-overlay">
      <div className="br-toolbar no-print">
        <span className="br-toolbar-label">{boats.length === 1 ? boats[0].boat_id : `${boats.length} boats`}</span>
        <button className="br-print" onClick={() => window.print()}>🖨 Print</button>
        <button className="br-close" onClick={onClose}>✕ Close</button>
      </div>
      <div className="br-doc">
        {boats.length === 0
          ? <div className="br-loading">No matching boats.</div>
          : boats.map(bd => <BoatPage key={bd.boat_id} b={bd} dateLabel={dateLabel} withAI={boats.length === 1} />)}
      </div>
    </div>
  );
}

function BoatPage({ b, dateLabel, withAI }) {
  const [ai, setAi] = useState(null); // null=loading, ''=unavailable, else text

  useEffect(() => {
    if (!withAI) return;
    let live = true;
    (async () => {
      try {
        const r = await apiFetch('/api/ask', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: `Give me a tight status summary for boat ${b.boat_id} (${b.customer}). One short paragraph: where it is in the build, what is blocking it, and what needs attention next. Ignore anything marked Not Applicable. Do not restate the whole checklist.`,
          }),
        });
        const j = await r.json();
        if (live) setAi(r.ok && j.answer ? j.answer : '');
      } catch (e) { if (live) setAi(''); }
    })();
    return () => { live = false; };
  }, [b.boat_id, b.customer, withAI]);

  const behind = b.behind;
  const schedTone = behind == null ? '' : behind > 0 ? 'br-sched-late' : 'br-sched-ok';
  const schedText = behind == null ? '—'
    : behind > 0 ? `${behind}d behind` : behind < 0 ? `${-behind}d ahead` : 'on time';

  return (
    <div className="br-page">
      <header className="br-head">
        <div className="br-head-left">
          <Logo size={22} />
          <div>
            <div className="br-title">
              {b.seq ? `${b.seq}. ` : ''}{b.boat_id} · {b.customer}
              {b.is_spare && <span className="spare-tag">SPARE / REFIT / SERVICE</span>}
            </div>
            <div className="br-sub">{b.model} · {b.hull} · {b.engines}</div>
          </div>
        </div>
        <div className="br-head-right">
          <div className="br-week">Week of {dateLabel}</div>
          <div className="br-datesline">
            {b.target && <span>Target {fmtDate(b.target)}</span>}
            {b.projected && <span>· Proj {fmtDate(b.projected)}</span>}
          </div>
        </div>
      </header>

      {/* stage strip */}
      <div className="br-stages">
        {STAGES.map((s, i) => (
          <div key={s} className={`br-stage ${i === b.stageIdx ? 'now' : i < b.stageIdx ? 'past' : 'future'}`}>{s}</div>
        ))}
      </div>

      {/* metric tiles */}
      <div className="br-tiles">
        <Tile label="Lamination" value={b.lam == null ? '—' : `${b.lam}%`} p={b.lam} />
        <Tile label="Finishing" value={b.fin == null ? '—' : `${b.fin}%`} p={b.fin} />
        <Tile label="Assembly" value={b.asy == null ? '—' : `${b.asy}%`} p={b.asy} />
        <Tile label="Parts" value={`${b.partsReceived}/${b.partsTotal}`} p={pct(b.partsReceived, b.partsTotal)} />
        <div className={`br-tile ${schedTone}`}>
          <div className="br-tile-label">Schedule</div>
          <div className="br-tile-value">{schedText}</div>
        </div>
      </div>

      {/* two-column mid section */}
      <div className="br-mid">
        <div className="br-col">
          <Panel title="Needs attention">
            {b.attention.length
              ? <ul className="br-attn">{b.attention.map((a, i) => <li key={i} className={`br-attn-${a.tone}`}>{a.text}</li>)}</ul>
              : <div className="br-ok">✓ Nothing flagged.</div>}
          </Panel>

          {withAI && (
            <Panel title="Summary">
              {ai === null ? <div className="br-quiet">Generating…</div>
                : ai === '' ? <div className="br-quiet">AI summary unavailable.</div>
                : <div className="br-md">{renderAnswer(ai)}</div>}
            </Panel>
          )}

          <Panel title="Recent activity">
            {b.activity.length
              ? <ul className="br-activity">{b.activity.map((e, i) =>
                  <li key={i}><span className="br-act-date">{e.date}</span> {e.text}</li>)}</ul>
              : <div className="br-quiet">No recent activity.</div>}
          </Panel>
        </div>

        <div className="br-col">
          <Panel title={`Lamination${b.lam == null ? '' : ` · ${b.lam}%`}`}>
            <Checklist items={b.lamTasks} allLabel="All laminated." noneLabel="Not in the glass shop yet." />
          </Panel>
          <Panel title={`Finishing${b.fin == null ? '' : ` · ${b.fin}%`}`}>
            <Checklist items={b.finTasks} allLabel="All finished." noneLabel="Not in finishing yet." />
          </Panel>
          <Panel title={`Parts · ${b.partsReceived}/${b.partsTotal}`}>
            {b.partsOutstanding.length
              ? <ul className="br-parts">{b.partsOutstanding.map((p, i) => <li key={i}>{p}</li>)}</ul>
              : <div className="br-ok">✓ All parts received.</div>}
          </Panel>
        </div>
      </div>

      {/* deep assembly — the star of the page */}
      <section className="br-assembly">
        <div className="br-assembly-head">
          <span className="br-assembly-title">Assembly{b.asy == null ? '' : ` — ${b.asy}% complete`}</span>
          {b.lastAsmActivity && <span className="br-assembly-last">Last activity {b.lastAsmActivity}</span>}
        </div>
        {b.stations.length === 0
          ? <div className="br-quiet">No assembly checklists yet.</div>
          : <div className="br-stations">
              {b.stations.map(s => <Station key={s.name} s={s} />)}
            </div>}
      </section>

      <div className="br-foot">Generated {dateLabel} · Bluewater B.O.S.S · live tracker data</div>
    </div>
  );
}

function Tile({ label, value, p }) {
  return (
    <div className={`br-tile ${tintClass(p)}`}>
      <div className="br-tile-label">{label}</div>
      <div className="br-tile-value">{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="br-panel">
      <div className="br-panel-title">{title}</div>
      {children}
    </div>
  );
}

function Checklist({ items, allLabel, noneLabel }) {
  if (items === null) return <div className="br-quiet">{noneLabel}</div>;
  if (items.length === 0) return <div className="br-ok">✓ {allLabel}</div>;
  const allDone = items.every(it => it.done);
  if (allDone) return <div className="br-ok">✓ {allLabel}</div>;
  return (
    <ul className="br-checklist">
      {items.map((it, i) => <li key={i} className={it.done ? 'done' : ''}>{it.name}</li>)}
    </ul>
  );
}

// Cap the open-item list per station so a 50-item QC checklist doesn't swamp the
// page; the rest roll up into a distinct "+N more" chip.
const STATION_CAP = 12;

function Station({ s }) {
  const p = s.total ? Math.round((100 * s.done) / s.total) : 0;
  const chip = s.state === 'complete' ? { c: 'br-st-done', t: 'complete' }
    : s.state === 'notstarted' ? { c: 'br-st-none', t: 'not started' }
    : { c: 'br-st-prog', t: 'in progress' };
  const shown = s.open.slice(0, STATION_CAP);
  const hidden = s.open.length - shown.length;
  return (
    <div className="br-station">
      <div className="br-station-head">
        <span className="br-station-name">{s.name}</span>
        <span className={`br-station-chip ${chip.c}`}>{chip.t}</span>
        <span className="br-station-count">{s.done}/{s.total}</span>
      </div>
      <div className="br-station-bar"><div className="br-station-fill" style={{ width: `${p}%` }} /></div>
      {s.state === 'complete'
        ? <div className="br-ok">✓ All items complete.</div>
        : <ul className="br-station-items">
            {shown.map((it, i) => <li key={i}>{it}</li>)}
            {hidden > 0 && <li className="br-more-li"><span className="br-more">+{hidden} more open</span></li>}
          </ul>}
    </div>
  );
}

export default BoatReport;
