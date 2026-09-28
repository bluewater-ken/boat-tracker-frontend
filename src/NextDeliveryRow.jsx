import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';
import './NextDeliveryRow.css';

// "Next build slot" on the Timeline: the estimated delivery a NEW order would
// get, set by hand as the schedule moves. The online configurator shows it to
// buyers as "Estimated delivery". Two dates: one shared by the 23T/25T/2850,
// one for the 36 (its own mold and line). See BACKEND_NEXT_DELIVERY_BRIEF.md.
//
// Shown two ways: a dashed line on the Timeline itself (drag its tag to move
// it, Ken 2026-09-28: easier to see against the bars than a typed date) and
// the date boxes below the chart for exact entry. Both use useNextDelivery.
export const GROUPS = [
  { key: 'small', label: '23T · 25T · 2850' },
  { key: '36', label: '36' },
];

/** The two dates and a saver, shared by the Timeline line and the row. */
export function useNextDelivery() {
  const [dates, setDates] = useState(null); // { small, 36 } as YYYY-MM-DD or null
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(null); // { id, dDays } while a tag is dragged

  useEffect(() => {
    apiFetch('/api/public/next-delivery')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setDates({ small: d.small ?? null, 36: d['36'] ?? null }))
      .catch(() => setError('Not set up on the server yet (see BACKEND_NEXT_DELIVERY_BRIEF.md).'));
  }, []);

  /** Save one group's date, or both at once ({ small, 36 }) when one line moves both. */
  const save = useCallback(async (patch) => {
    const keys = Object.keys(patch);
    setSaving(keys.join(','));
    setError('');
    const before = dates;
    setDates((d) => ({ ...d, ...patch }));
    try {
      for (const group of keys) {
        const r = await apiFetch('/api/timeline/next-delivery', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group, date: patch[group] || null }),
        });
        if (!r.ok) throw new Error(r.status);
      }
    } catch {
      setDates(before);
      setError('Could not save the date.');
    } finally {
      setSaving('');
    }
  }, [dates]);

  return { dates, saving, error, save, drag, setDrag };
}

export default function NextDeliveryRow({ canEdit, nd }) {
  const { dates, saving, error, save } = nd;
  return (
    <div className="nextdel">
      <span className="nextdel-title" title="What a new order would get today. Shown to buyers in the online builder as “Estimated delivery”.">
        Next build slot · est. delivery for a new order
      </span>
      {GROUPS.map((g) => (
        <label key={g.key} className="nextdel-item">
          <span>{g.label}</span>
          {canEdit ? (
            <input
              type="date"
              value={dates?.[g.key] ?? ''}
              disabled={!dates || saving.includes(g.key)}
              onChange={(e) => save({ [g.key]: e.target.value })}
            />
          ) : (
            <strong>{dates?.[g.key] ? new Date(dates[g.key] + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</strong>
          )}
        </label>
      ))}
      {canEdit && <span className="nextdel-hint">or drag the green “Next slot” tag on the chart</span>}
      {error && <span className="nextdel-error">{error}</span>}
    </div>
  );
}

const shift = (d, n) => {
  const t = new Date(d + 'T12:00:00');
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
};
const fmt = (d) => new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** One line when both groups share a date, two when they differ. */
function slotLines(dates) {
  if (!dates) return [];
  if (dates.small && dates.small === dates['36']) return [{ keys: ['small', '36'], date: dates.small, label: 'Next slot · all models' }];
  return GROUPS.filter((g) => dates[g.key]).map((g) => ({ keys: [g.key], date: dates[g.key], label: `Next slot · ${g.key === '36' ? '36' : '23T/25T/2850'}` }));
}

/**
 * The dashed "Next slot" lines drawn down the whole Timeline. `x` maps a date
 * to pixels in the lanes, `left` is where the lanes start. Their draggable
 * tags live in the sticky header (NextSlotTags), next to "Today".
 */
export function NextSlotLines({ nd, x, left }) {
  const { drag } = nd;
  return (
    <div className="nextslot-layer" style={{ left }}>
      {slotLines(nd.dates).map((l) => {
        const moving = drag?.id === l.keys.join();
        return <div key={l.keys.join()} className={`nextslot ${moving ? 'moving' : ''}`} style={{ left: x(moving ? shift(l.date, drag.dDays) : l.date) }} />;
      })}
    </div>
  );
}

/** The tags for the lines, inside a sticky header lane so they never scroll away. Drag one to move its line. */
export function NextSlotTags({ nd, x, px, canEdit }) {
  const { drag, setDrag } = nd;
  const lines = slotLines(nd.dates);

  const begin = (e, line) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation(); // a drag here is not a chart pan
    const id = line.keys.join();
    const x0 = e.clientX;
    const onMove = (ev) => setDrag({ id, dDays: Math.round((ev.clientX - x0) / px) });
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const n = Math.round((ev.clientX - x0) / px);
      setDrag(null);
      if (n) nd.save(Object.fromEntries(line.keys.map((k) => [k, shift(line.date, n)])));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return lines.map((l) => {
    const moving = drag?.id === l.keys.join();
    const date = moving ? shift(l.date, drag.dDays) : l.date;
    return (
      <div
        key={l.keys.join()}
        className={`nextslot-tag ${canEdit ? 'editable' : ''} ${moving ? 'moving' : ''}`}
        style={{ left: x(date) }}
        onPointerDown={(e) => begin(e, l)}
        title={canEdit ? 'Drag left or right to move the next build slot. Buyers see this month as “Estimated delivery”.' : 'The next open build slot, shown to buyers as “Estimated delivery”.'}
      >
        {canEdit && <span className="nextslot-grip">⇔</span>}
        {l.label} · {fmt(date)}
      </div>
    );
  });
}
