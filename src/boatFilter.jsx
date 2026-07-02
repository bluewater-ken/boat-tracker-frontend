// Shared "hide delivered boats" filter, used by the four tracking boards
// (Production Schedule, Key Parts, Lamination, Finishing). Delivered boats stay
// in the data + Boat Information; they're just hidden from the active boards
// unless the user flips the toggle. Nothing is deleted.
import './boatFilter.css';

export const isDelivered = (b) => b?.global_status === 'Delivered';

// Split a boat list into what's shown vs. how many delivered are hidden.
export function applyDeliveredFilter(boats, showDelivered) {
  const delivered = boats.filter(isDelivered).length;
  const visible = showDelivered ? boats : boats.filter((b) => !isDelivered(b));
  return { visible, delivered };
}

// Small toggle for the board toolbars. Only appears once there's something to show.
export function ShowDeliveredToggle({ count, on, onChange }) {
  if (!count && !on) return null;
  return (
    <label className="show-delivered">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>Show delivered{count ? ` (${count})` : ''}</span>
    </label>
  );
}
