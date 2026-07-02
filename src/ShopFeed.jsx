import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import './ShopFeed.css';

// Shop Feed — newest-first activity stream mirrored from CompanyCam webhooks.
// "What got done today?" at a glance. Read-only.

const TYPE_ICON = {
  CHECKLIST_ITEM_COMPLETED: '✓',
  CHECKLIST_COMPLETED: '✅',
  CHECKLIST_CREATED: '＋',
  PHOTO_ADDED: '📷',
  COMMENT_ADDED: '💬',
};

const fmtTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const dayKey = (iso) => new Date(iso).toDateString();
const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'numeric', day: 'numeric' });
};

function ShopFeed() {
  const [items, setItems] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
    const t = setInterval(() => init(true), 60000); // auto-refresh
    return () => clearInterval(t);
  }, []);

  const init = async (quiet) => {
    try {
      if (!quiet) setLoading(true);
      const res = await apiFetch('/api/assembly/feed?limit=150').catch(() => null);
      if (res && res.ok) {
        setItems(await res.json());
        setConnected(true);
      }
    } catch (e) { /* stays in not-connected state */ }
    finally { if (!quiet) setLoading(false); }
  };

  if (loading) return <div className="loading">Loading shop feed...</div>;

  if (!connected) {
    return (
      <div className="feed-empty">
        <h2>Shop Feed</h2>
        <p>Not connected to CompanyCam yet. Once the backend link is set up, every checklist
        item your crews check off shows up here the moment it happens — newest first.</p>
      </div>
    );
  }

  // Group by day, newest first (backend already sorts desc).
  const groups = [];
  for (const it of items) {
    const k = dayKey(it.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(it);
    else groups.push({ key: k, label: dayLabel(it.created_at), items: [it] });
  }

  return (
    <div className="feed">
      <div className="feed-head">
        <span className="feed-note">Live from CompanyCam — what got done, newest first. Updates automatically.</span>
      </div>
      {groups.length === 0 && <div className="feed-quiet">No activity yet. It shows up here as crews check items off in CompanyCam.</div>}
      {groups.map(g => (
        <div key={g.key} className="feed-day">
          <div className="feed-daylabel">{g.label}</div>
          {g.items.map(it => (
            <div key={it.id} className="feed-row">
              <span className="feed-time">{fmtTime(it.created_at)}</span>
              <span className="feed-icon">{TYPE_ICON[it.type] || '•'}</span>
              <span className="feed-main">
                <span className="feed-title">{it.title}</span>
                {/* No "who" — the shop shares one CompanyCam login, so the actor is always
                    the same account. If per-user seats ever arrive, add actor_name back here. */}
                <span className="feed-sub">
                  {it.boat_id}{it.customer_name ? ` · ${it.customer_name}` : ''}
                  {it.work_center_name ? ` · ${it.work_center_name}` : ''}
                </span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default ShopFeed;
