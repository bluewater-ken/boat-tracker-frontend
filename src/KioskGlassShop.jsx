// Glass-shop lamination grid — a page on the main kiosk. Every boat in the glass
// shop, status by mold (the Lamination tab, wall-ified). Presentational: KioskView
// builds the rows (live or demo) and hands them in.

export const GS_PARTS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid'];
const GS_LEGEND = [['pulled', 'Pulled'], ['onmold', 'Complete / on mold'], ['wip', 'In progress'], ['open', 'Mold open'], ['busy', 'Mold unavailable'], ['na', 'Not applicable']];

// Lamination status -> a cell { label, cls }, matching the desktop Lamination tab.
// Desktop defaults a blank/unknown status to "Mold Unavailable", so we do too.
export function cellOf(status, na) {
  if (na) return { label: 'Not Applicable', cls: 'na' };
  switch (status) {
    case 'Pulled': return { label: 'Pulled', cls: 'pulled' };
    case 'Complete/On Mold': return { label: 'Complete/On Mold', cls: 'onmold' };
    case 'Complete': return { label: 'Complete', cls: 'pulled' };
    case 'In Progress': return { label: 'In Progress', cls: 'wip' };
    case 'Mold Open': return { label: 'Mold Open', cls: 'open' };
    default: return { label: 'Mold Unavailable', cls: 'busy' };
  }
}

const STAGE_ORDER = ['Pre-Production', 'Glass Shop', 'Back Line', 'Front Line', 'QC'];
const STAGE_SHORT = { 'Pre-Production': 'Pre-Prod', 'Glass Shop': 'Glass', 'Back Line': 'Back Line', 'Front Line': 'Front Line', 'QC': 'QC', 'Backlog': 'Backlog' };
const lamDone = (r) => !!r && ['Pulled', 'Complete', 'Complete/On Mold'].includes(r.status);

// Build glass-shop rows: every in-production boat from Pre-Production onward, kept
// on the board until all of its lamination molds are complete.
export function computeGlassRows(boats, lam) {
  const lamBy = {}; for (const r of (lam || [])) { (lamBy[r.boat_id] || (lamBy[r.boat_id] = {}))[r.task_name] = r; }
  const inGlass = (b) => {
    const s = b.global_status;
    if (s === 'Backlog' || s === 'Delivered') return false;
    if (s === 'Pre-Production' || s === 'Glass Shop') return true;   // in/entering glass — always show
    // Past glass: keep only while some applicable mold isn't finished.
    const applicable = GS_PARTS.map(p => lamBy[b.boat_id] && lamBy[b.boat_id][p]).filter(r => r && !r.na);
    return applicable.length > 0 && !applicable.every(lamDone);
  };
  const rowOf = (b) => ({
    boat_id: b.boat_id, customer: b.customer_name, stage: STAGE_SHORT[b.global_status] || b.global_status, hull: b.hull_color,
    cells: GS_PARTS.map(p => { const r = lamBy[b.boat_id] && lamBy[b.boat_id][p]; return cellOf(r && r.status, r && r.na); }),
  });
  const bySeq = (a, b) => (a.sequence_number || 999) - (b.sequence_number || 999);
  const bs = boats || [];
  const active = bs.filter(inGlass).sort((a, b) => (STAGE_ORDER.indexOf(a.global_status) - STAGE_ORDER.indexOf(b.global_status)) || bySeq(a, b));
  // Fill the rest of the board with the queued boats (Backlog), in build order.
  const queued = bs.filter(b => b.global_status === 'Backlog').sort(bySeq);
  return active.concat(queued).slice(0, 12).map(rowOf);
}

// The next boats queued to enter (Backlog, by build order) — shown as a "Next up" strip.
export function computeUpcoming(boats, n = 5) {
  return (boats || [])
    .filter(b => b.global_status === 'Backlog')
    .sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999))
    .slice(0, n)
    .map(b => ({ boat_id: b.boat_id, customer: b.customer_name, hull: b.hull_color }));
}

const DEMO_CODE = { P: 'Pulled', OM: 'Complete/On Mold', C: 'Complete', W: 'In Progress', O: 'Mold Open', MU: 'Mold Unavailable' };
export const DEMO_GLASS_ROWS = [
  ['25T072', 'Ferro', 'Pre-Prod', 'navy', ['OM', 'W', 'MU', '_', '_', '_', '_', '_', '_', '_', '_', '_']],
  ['30S009', '7 Sports', 'Pre-Prod', 'seagreen', ['C', 'OM', 'W', 'MU', '_', '_', '_', '_', '_', '_', '_', '_']],
  ['26F031', 'Scituate #1', 'Glass', 'firebrick', ['P', 'P', 'P', 'OM', 'OM', 'OM', 'OM', 'OM', 'O', 'W', 'MU', '_']],
  ['26F033', 'Halloran', 'Glass', 'goldenrod', ['P', 'OM', 'OM', 'W', 'W', 'O', 'MU', 'W', '_', '_', '_', '_']],
  ['28225', 'Trey', 'Back Line', 'slategray', ['P', 'P', 'OM', 'P', 'OM', 'OM', 'W', 'OM', 'O', 'W', 'MU', '_']],
  ['25T074', 'Whitaker', 'Backlog', 'teal', Array(12).fill('_')],
  ['26F035', 'Nguyen', 'Backlog', 'darkred', Array(12).fill('_')],
  ['30S011', 'Costa', 'Backlog', '#4B6CB7', Array(12).fill('_')],
  ['25T077', 'Bianchi', 'Backlog', 'sienna', Array(12).fill('_')],
  ['28C014', 'Ortiz', 'Backlog', 'darkslateblue', Array(12).fill('_')],
].map(([id, cust, stage, hull, st]) => ({ boat_id: id, customer: cust, stage, hull, cells: st.map(c => cellOf(c === '_' ? null : DEMO_CODE[c], false)) }));
export const DEMO_UPCOMING = [
  { boat_id: '25T074', customer: 'Whitaker', hull: 'teal' },
  { boat_id: '26F035', customer: 'Nguyen', hull: 'darkred' },
  { boat_id: '30S011', customer: 'Costa', hull: '#4B6CB7' },
  { boat_id: '25T077', customer: 'Bianchi', hull: 'sienna' },
  { boat_id: '28C014', customer: 'Ortiz', hull: 'darkslateblue' },
];

export function GlassGrid({ rows }) {
  return (
    <section className="kio-panel kio-glass">
      <div className="gs-toolbar">
        {GS_LEGEND.map(([cls, label]) => <span key={cls} className="gs-leg"><i className={`gs-sw ${cls}`} />{label}</span>)}
      </div>
      <div className="gs-grid">
        <div className="gs-row gs-head">
          <div className="gs-boat gs-th">BOAT</div>
          {GS_PARTS.map(p => <div key={p} className="gs-cell gs-th">{p}</div>)}
        </div>
        {rows.map(r => (
          <div key={r.boat_id} className="gs-row">
            <div className="gs-boat">
              <div className="gs-boat-top">
                <span className="gs-id">{r.boat_id}</span>
                {r.hull && <span className="gs-chip" style={{ background: r.hull }} title={r.hull} />}
              </div>
              <span className="gs-cust">{r.customer}{r.hull ? ` · ${r.hull}` : ''}</span>
              {r.stage && <span className="gs-stage">{r.stage}</span>}
            </div>
            {r.cells.map((c, i) => <div key={i} className={`gs-cell ${c.cls}`}>{c.label}</div>)}
          </div>
        ))}
        {rows.length === 0 && <div className="gs-empty">No boats in the glass shop right now.</div>}
      </div>
    </section>
  );
}
