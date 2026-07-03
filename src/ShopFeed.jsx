import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import './ShopFeed.css';

// Shop Feed — Activity (event stream) + Issues (open items).
// Wide screens show BOTH side by side; narrow screens show one at a time with the
// Activity | Issues toggle (the CSS media query decides — see ShopFeed.css).
// Resolving an issue NEVER changes tracker data; fixing the data auto-clears the issue.

const TYPE_ICON = {
  CHECKLIST_ITEM_COMPLETED: '✓',
  CHECKLIST_COMPLETED: '✅',
  CHECKLIST_CREATED: '＋',
  PHOTO_ADDED: '📷',
  COMMENT_ADDED: '💬',
  APP_TASK_UPDATED: '✓',   // Lamination/Finishing status change
  PART_RECEIVED: '📦',      // Key Parts: marked Received
  PART_DELAYED: '🕓',       // Key Parts: expected delivery pushed
  PART_FLAGGED: '⚠️',       // Key Parts: Late/Backordered/Unsatisfactory turned on
  STAGE_CHANGED: '»',       // Production Schedule stage move
  QUESTION_POSTED: '❓',    // someone posted an issue/question
};

// Issue rule -> icon (fallback ⚠️). Keys match the backend rule_key values.
const RULE_ICON = {
  part_overdue: '🕓',
  parts_unordered: '🛒',
  backorder_stale: '⏳',
  stage_stuck: '🐌',
  flag_stale: '⚠️',
  lam_stalled: '🧊',
  ugly_part: '🙁',
  asap_idle: '🔥',
  wc_quiet: '💤',
  build_improvement: '🔧',
  question: '❓',
};

// Issue categories = the tab the issue came from (+ Questions + the CompanyCam
// "Build Improvements" punch list). Colors the left edge of each card and powers
// the filter chips. Keys match source_tab from the backend.
const ISSUE_CATS = [
  { key: 'Key Parts', color: '#BA7517' },
  { key: 'Schedule', color: '#185FA5' },
  { key: 'Lamination', color: '#2E7D8A' },
  { key: 'Finishing', color: '#A32D2D' },
  { key: 'Assembly', color: '#5C9A2E' },
  { key: 'Build Improvements', color: '#5C7A92' },
  { key: 'Questions', color: '#2E92D6' },
];
const catOf = (iss) => iss.kind === 'question' ? 'Questions' : (iss.source_tab || 'Questions');
const catColor = (iss) => (ISSUE_CATS.find(c => c.key === catOf(iss)) || {}).color || '#BA7517';

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
const ageLabel = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
};

function ShopFeed() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';

  const [view, setView] = useState('activity'); // which column shows on NARROW screens
  const [items, setItems] = useState([]);
  const [issues, setIssues] = useState(null); // null = issues backend not connected
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [qText, setQText] = useState('');
  const [qBoat, setQBoat] = useState('');
  const [boats, setBoats] = useState([]);

  useEffect(() => {
    init();
    const t = setInterval(() => init(true), 60000); // auto-refresh
    return () => clearInterval(t);
  }, []);

  const init = async (quiet) => {
    try {
      if (!quiet) setLoading(true);
      const [feedRes, issuesRes, boatsRes] = await Promise.all([
        apiFetch('/api/assembly/feed?limit=150').catch(() => null),
        apiFetch('/api/issues').catch(() => null),
        apiFetch('/api/boats').catch(() => null),
      ]);
      if (feedRes && feedRes.ok) {
        setItems(await feedRes.json());
        setConnected(true);
      }
      if (issuesRes && issuesRes.ok) setIssues(await issuesRes.json());
      if (boatsRes && boatsRes.ok) setBoats(await boatsRes.json());
    } catch (e) { /* stays in not-connected state */ }
    finally { if (!quiet) setLoading(false); }
  };

  const postQuestion = async () => {
    const title = qText.trim();
    if (!title) return;
    try {
      const r = await apiFetch('/api/issues', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, boat_id: qBoat || null }),
      });
      if (!r.ok) throw new Error();
      setQText(''); setQBoat(''); setPosting(false);
      init(true);
    } catch (e) { alert('Failed to post — is the issues backend set up?'); }
  };

  const resolve = async (id) => {
    try {
      const r = await apiFetch(`/api/issues/${id}/resolve`, { method: 'PUT' });
      if (!r.ok) throw new Error();
      setIssues(prev => (prev || []).filter(i => i.id !== id));
    } catch (e) { alert('Failed to resolve'); }
  };

  if (loading) return <div className="loading">Loading shop feed...</div>;

  const issueCount = issues ? issues.length : 0;

  // Shown only on narrow screens (CSS hides it when both columns fit side by side).
  const viewToggle = (
    <div className="feed-views">
      <button className={`feed-view-btn ${view === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}>Activity</button>
      <button className={`feed-view-btn ${view === 'issues' ? 'active' : ''}`} onClick={() => setView('issues')}>
        Issues{issueCount ? ` (${issueCount})` : ''}
      </button>
    </div>
  );

  // ---------- Activity column ----------
  const groups = [];
  for (const it of items) {
    const k = dayKey(it.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(it);
    else groups.push({ key: k, label: dayLabel(it.created_at), items: [it] });
  }

  const activityCol = (
    <div className={`feed-col ${view === 'activity' ? 'active' : ''}`}>
      <div className="feed-head">
        {viewToggle}
        <span className="feed-col-title">Activity</span>
      </div>
      {!connected ? (
        <div className="feed-quiet">Not connected to CompanyCam yet. Once the backend link is set up, every checklist
        item your crews check off shows up here the moment it happens — newest first.</div>
      ) : (
        <>
          {groups.length === 0 && <div className="feed-quiet">No activity yet. It shows up here as crews check items off in CompanyCam.</div>}
          {groups.map(g => (
            <div key={g.key} className="feed-day">
              <div className="feed-daylabel">{g.label}</div>
              {g.items.map(it => (
                <div key={it.id} className="feed-row">
                  <span className="feed-time">{fmtTime(it.created_at)}</span>
                  <span className="feed-icon">{TYPE_ICON[it.type] || '•'}</span>
                  {/* "Who" only shows when the event carries a real user: app events do;
                      CompanyCam events don't (the shop shares one CC login). */}
                  <span className="feed-main">
                    <span className="feed-title">{it.title}</span>
                    <span className="feed-sub">
                      {it.boat_id}{it.customer_name ? ` · ${it.customer_name}` : ''}
                      {it.work_center_name ? ` · ${it.work_center_name}` : ''}
                      {it.actor_name ? ` — ${it.actor_name}` : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );

  // ---------- Issues column ----------
  const catCounts = {};
  for (const iss of issues || []) catCounts[catOf(iss)] = (catCounts[catOf(iss)] || 0) + 1;
  const shown = (issues || []).filter(iss => catFilter === 'all' || catOf(iss) === catFilter);

  const issuesCol = (
    <div className={`feed-col ${view === 'issues' ? 'active' : ''}`}>
      <div className="feed-head">
        {viewToggle}
        <span className="feed-col-title">Issues{issueCount ? ` (${issueCount})` : ''}</span>
        <button className="feed-post-btn" onClick={() => setPosting(p => !p)}>{posting ? 'Cancel' : '+ Post issue / question'}</button>
      </div>

      {posting && (
        <div className="feed-postform">
          <textarea className="feed-post-text" rows={3} placeholder="Type the issue or question... (your name attaches automatically)"
            value={qText} onChange={e => setQText(e.target.value)} />
          <div className="feed-post-row">
            <select className="feed-post-boat" value={qBoat} onChange={e => setQBoat(e.target.value)}>
              <option value="">No specific boat</option>
              {boats.map(b => <option key={b.boat_id} value={b.boat_id}>{b.boat_id} · {b.customer_name}</option>)}
            </select>
            <button className="feed-post-submit" onClick={postQuestion} disabled={!qText.trim()}>Post</button>
          </div>
        </div>
      )}

      {(issues || []).length > 0 && (
        <div className="issue-cats">
          <button className={`issue-cat ${catFilter === 'all' ? 'on' : ''}`} onClick={() => setCatFilter('all')}>
            All ({(issues || []).length})
          </button>
          {ISSUE_CATS.filter(c => catCounts[c.key]).map(c => (
            <button key={c.key} className={`issue-cat ${catFilter === c.key ? 'on' : ''}`}
              style={catFilter === c.key ? { background: c.color, borderColor: c.color, color: '#fff' } : { color: c.color, borderColor: c.color + '55' }}
              onClick={() => setCatFilter(catFilter === c.key ? 'all' : c.key)}>
              {c.key} ({catCounts[c.key]})
            </button>
          ))}
        </div>
      )}

      {issues === null && (
        <div className="feed-quiet">Issues backend isn't set up yet — once it is, anything needing attention shows up here automatically.</div>
      )}
      {issues !== null && issues.length === 0 && (
        <div className="feed-quiet">🎉 No open issues. Anything needing attention shows up here automatically.</div>
      )}
      {shown.map(iss => (
        <div key={iss.id} className="issue-row" style={{ borderLeftColor: catColor(iss) }}>
          <span className="issue-icon">{RULE_ICON[iss.rule_key] || '⚠️'}</span>
          <span className="issue-main">
            <span className="issue-title">{iss.title}</span>
            <span className="issue-sub">
              {iss.boat_id ? `${iss.boat_id}${iss.customer_name ? ' · ' + iss.customer_name : ''} · ` : ''}
              {iss.source_tab ? `${iss.source_tab} · ` : ''}
              open {ageLabel(iss.created_at)}
              {iss.actor_name ? ` — asked by ${iss.actor_name}` : ''}
            </span>
            {iss.detail && <span className="issue-detail">{iss.detail}</span>}
          </span>
          {isOps && <button className="issue-resolve" onClick={() => resolve(iss.id)}>Resolve</button>}
        </div>
      ))}
      <div className="feed-note" style={{ display: 'block', marginTop: 10 }}>
        Auto-flagged from tracker data + CompanyCam Build Improvements + posted questions. Fix the real thing and an
        auto-issue clears itself; Resolve just hides it{isOps ? '' : ' (Ops)'} — it returns in 24 hours if still true.
      </div>
    </div>
  );

  return (
    <div className="feed feed-split">
      {activityCol}
      {issuesCol}
    </div>
  );
}

export default ShopFeed;
