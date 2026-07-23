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

// Build glass-shop rows from /api/boats + /api/lamination.
export function computeGlassRows(boats, lam) {
  const lamBy = {}; for (const r of (lam || [])) { (lamBy[r.boat_id] || (lamBy[r.boat_id] = {}))[r.task_name] = r; }
  return (boats || [])
    .filter(b => b.global_status === 'Glass Shop')
    .sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999))
    .map(b => ({
      boat_id: b.boat_id, customer: b.customer_name,
      cells: GS_PARTS.map(p => { const r = lamBy[b.boat_id] && lamBy[b.boat_id][p]; return cellOf(r && r.status, r && r.na); }),
    }));
}

const DEMO_CODE = { P: 'Pulled', OM: 'Complete/On Mold', C: 'Complete', W: 'In Progress', O: 'Mold Open' };
export const DEMO_GLASS_ROWS = [
  ['26F031', 'Scituate #1', ['P', 'P', 'P', 'OM', 'OM', 'OM', 'OM', 'OM', 'O', 'W', '_', '_']],
  ['28225', 'Trey', ['C', 'P', 'OM', 'W', 'O', 'OM', 'W', 'OM', 'O', '_', '_', '_']],
  ['26F033', 'Halloran', ['P', 'OM', 'OM', 'W', 'W', 'O', '_', 'W', '_', '_', '_', '_']],
  ['30S009', '7 Sports', ['C', 'OM', 'W', 'O', '_', '_', '_', '_', '_', '_', '_', '_']],
  ['25T072', 'Ferro', ['OM', 'W', 'O', '_', '_', '_', '_', '_', '_', '_', '_', '_']],
].map(([id, cust, st]) => ({ boat_id: id, customer: cust, cells: st.map(c => cellOf(c === '_' ? null : DEMO_CODE[c], false)) }));

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
            <div className="gs-boat"><span className="gs-id">{r.boat_id}</span><span className="gs-cust">{r.customer}</span></div>
            {r.cells.map((c, i) => <div key={i} className={`gs-cell ${c.cls}`}>{c.label}</div>)}
          </div>
        ))}
        {rows.length === 0 && <div className="gs-empty">No boats in the glass shop right now.</div>}
      </div>
    </section>
  );
}
