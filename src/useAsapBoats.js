import { useState, useEffect } from 'react';
import { apiFetch } from './api';

// Set of boat_ids that have at least one key part flagged "Order ASAP" and not yet
// received. Lets any tab surface an urgent-parts badge on the boat, so the whole
// shop sees it — not just whoever's on the Key Parts tab. Refreshes on `trigger`.
export default function useAsapBoats(trigger) {
  const [set, setSet] = useState(() => new Set());
  useEffect(() => {
    let alive = true;
    apiFetch('/api/parts').then(r => (r.ok ? r.json() : [])).then(parts => {
      if (!alive) return;
      setSet(new Set((parts || [])
        .filter(p => p.order_asap && !p.na && p.status !== 'Received')
        .map(p => p.boat_id)));
    }).catch(() => {});
    return () => { alive = false; };
  }, [trigger]);
  return set;
}
