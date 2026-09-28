import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import './NextDeliveryRow.css';

// "Next build slot" on the Timeline: the estimated delivery a NEW order would
// get, set by hand as the schedule moves. The online configurator shows it to
// buyers as "Estimated delivery". Two dates: one shared by the 23T/25T/2850,
// one for the 36 (its own mold and line). See BACKEND_NEXT_DELIVERY_BRIEF.md.
const GROUPS = [
  { key: 'small', label: '23T · 25T · 2850' },
  { key: '36', label: '36' },
];

export default function NextDeliveryRow({ canEdit }) {
  const [dates, setDates] = useState(null); // { small, 36 } as YYYY-MM-DD or null
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/public/next-delivery')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setDates({ small: d.small ?? null, 36: d['36'] ?? null }))
      .catch(() => setError('Not set up on the server yet (see BACKEND_NEXT_DELIVERY_BRIEF.md).'));
  }, []);

  const save = async (group, date) => {
    setSaving(group);
    setError('');
    try {
      const r = await apiFetch('/api/timeline/next-delivery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, date: date || null }),
      });
      if (!r.ok) throw new Error(r.status);
      setDates((d) => ({ ...d, [group]: date || null }));
    } catch {
      setError('Could not save the date.');
    } finally {
      setSaving('');
    }
  };

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
              disabled={!dates || saving === g.key}
              onChange={(e) => save(g.key, e.target.value)}
            />
          ) : (
            <strong>{dates?.[g.key] ? new Date(dates[g.key] + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</strong>
          )}
        </label>
      ))}
      {error && <span className="nextdel-error">{error}</span>}
    </div>
  );
}
