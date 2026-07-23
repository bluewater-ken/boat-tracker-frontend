// Glass-shop lamination grid — a page on the main kiosk. Every boat in the glass
// shop, status by mold (the Lamination tab, wall-ified). Presentational: KioskView
// builds the rows (live or demo) and hands them in.

export const GS_PARTS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid'];
const GS_LEGEND = [['pulled', 'Pulled'], ['onmold', 'On mold'], ['wip', 'In progress'], ['open', 'Mold open'], ['wait', 'Waiting']];

// Lamination status -> a cell { label, cls }. cls drives the color (see CSS).
export function cellOf(status, na) {
  if (na) return { label: 'N/A', cls: 'wait' };
  switch (status) {
    case 'Pulled': return { label: 'Pulled', cls: 'pulled' };
    case 'Complete/On Mold': return { label: 'On mold', cls: 'onmold' };
    case 'Complete': return { label: 'Complete', cls: 'pulled' };
    case 'In Progress': return { label: 'In progress', cls: 'wip' };
    case 'Mold Open': return { label: 'Mold open', cls: 'open' };
    case 'Mold Unavailable': return { label: 'Waiting', cls: 'wait' };
    default: return { label: '—', cls: 'wait' };
  }
}

const STAGE_ORDER = ['Pre-Production', 'Glass Shop', 'Back Line', 'Front Line', 'QC'];
const STAGE_SHORT = { 'Pre-Production': 'Pre-Prod', 'Glass Shop': 'Glass', 'Back Line': 'Back Line', 'Front Line': 'Front Line', 'QC': 'QC' };
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
  return (boats || [])
    .filter(inGlass)
    .sort((a, b) => (STAGE_ORDER.indexOf(a.global_status) - STAGE_ORDER.indexOf(b.global_status)) || ((a.sequence_number || 999) - (b.sequence_number || 999)))
    .map(b => ({
      boat_id: b.boat_id, customer: b.customer_name, stage: STAGE_SHORT[b.global_status] || b.global_status,
      cells: GS_PARTS.map(p => { const r = lamBy[b.boat_id] && lamBy[b.boat_id][p]; return cellOf(r && r.status, r && r.na); }),
    }));
}

const DEMO_CODE = { P: 'Pulled', OM: 'Complete/On Mold', C: 'Complete', W: 'In Progress', O: 'Mold Open' };
export const DEMO_GLASS_ROWS = [
  ['25T072', 'Ferro', 'Pre-Prod', ['OM', 'W', 'O', '_', '_', '_', '_', '_', '_', '_', '_', '_']],
  ['30S009', '7 Sports', 'Pre-Prod', ['C', 'OM', 'W', 'O', '_', '_', '_', '_', '_', '_', '_', '_']],
  ['26F031', 'Scituate #1', 'Glass', ['P', 'P', 'P', 'OM', 'OM', 'OM', 'OM', 'OM', 'O', 'W', '_', '_']],
  ['26F033', 'Halloran', 'Glass', ['P', 'OM', 'OM', 'W', 'W', 'O', '_', 'W', '_', '_', '_', '_']],
  ['28225', 'Trey', 'Back Line', ['P', 'P', 'OM', 'P', 'OM', 'OM', 'W', 'OM', 'O', 'W', '_', '_']],
].map(([id, cust, stage, st]) => ({ boat_id: id, customer: cust, stage, cells: st.map(c => cellOf(c === '_' ? null : DEMO_CODE[c], false)) }));

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
              <span className="gs-id">{r.boat_id}</span>
              <span className="gs-cust">{r.customer}</span>
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
