import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import { isDelivered } from './boatFilter';
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
  stage_stuck: '🐌',       // legacy key (pre-Timeline)
  stage_over_norm: '🐌',
  behind_target: '🎯',
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
// Reported-issue pickers: what kind of problem, and which area (area reuses the colors above).
const ISSUE_KINDS = ['Question', 'Damage', 'Missing / Short', 'Rework', 'Safety', 'Other'];
const ISSUE_DEPTS = ['Key Parts', 'Schedule', 'Lamination', 'Finishing', 'Assembly'];
// Display names for areas — stored values stay the backend keys ('Key Parts').
const DEPT_LABEL = { 'Key Parts': 'Parts' };
const deptLabel = (d) => DEPT_LABEL[d] || d;

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

function ShopFeed({ initialView = 'activity', initialPostingOpen = false }) {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';

  const [view, setView] = useState(initialView); // which column shows on NARROW screens
  const [items, setItems] = useState([]);
  const [issues, setIssues] = useState(null); // null = issues backend not connected
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(initialPostingOpen);
  const [catFilter, setCatFilter] = useState('all');
  const [issueTab, setIssueTab] = useState('open'); // open | resolved
  const [resolved, setResolved] = useState(null); // loaded on demand
  const [qText, setQText] = useState('');
  const [qBoat, setQBoat] = useState('');
  const [qDept, setQDept] = useState('');
  const [qKind, setQKind] = useState('');
  const [qPhotos, setQPhotos] = useState([]); // { file, url } — local previews until posted
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

  // Camera/file input → local preview thumbnails (uploaded on Post).
  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    setQPhotos(prev => [...prev, ...files.map(f => ({ file: f, url: URL.createObjectURL(f) }))]);
    e.target.value = '';
  };
  const removePhoto = (i) => setQPhotos(prev => {
    if (prev[i]) URL.revokeObjectURL(prev[i].url);
    return prev.filter((_, j) => j !== i);
  });

  const postQuestion = async () => {
    const title = qText.trim();
    if (!title) return;
    try {
      // Multipart when there are photos (so the files ride along); plain JSON otherwise.
      let opts;
      if (qPhotos.length) {
        const fd = new FormData();
        fd.append('title', title);
        if (qBoat) fd.append('boat_id', qBoat);
        if (qDept) fd.append('source_tab', qDept);
        if (qKind) fd.append('problem_type', qKind);
        qPhotos.forEach(p => fd.append('photos', p.file));
        opts = { method: 'POST', body: fd }; // no Content-Type — browser sets the multipart boundary
      } else {
        opts = {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, boat_id: qBoat || null, source_tab: qDept || null, problem_type: qKind || null }),
        };
      }
      const r = await apiFetch('/api/issues', opts);
      if (!r.ok) {
        // Surface the real failure — 413 = photos too large for the server's
        // upload limit, which is the usual cause when text-only posts work.
        const detail = await r.text().catch(() => '');
        if (r.status === 413) throw new Error('Photos are too large for the server upload limit (413). Try fewer/smaller photos, or raise the Nginx client_max_body_size on the server.');
        throw new Error(`Server rejected the post (HTTP ${r.status}${detail ? ` — ${detail.slice(0, 120)}` : ''}).`);
      }
      qPhotos.forEach(p => URL.revokeObjectURL(p.url));
      setQText(''); setQBoat(''); setQDept(''); setQKind(''); setQPhotos([]); setPosting(false);
      init(true);
    } catch (e) { alert(`Failed to post. ${e.message || 'Is the issues backend set up?'}`); }
  };

  const resolve = async (id) => {
    try {
      const r = await apiFetch(`/api/issues/${id}/resolve`, { method: 'PUT' });
      if (!r.ok) throw new Error();
      setIssues(prev => (prev || []).filter(i => i.id !== id));
      setResolved(null); // force a fresh load next time the Resolved view is opened
    } catch (e) { alert('Failed to resolve'); }
  };

  // Resolved issues load only when the Resolved view is opened (last 30 days).
  const openResolvedTab = async () => {
    setIssueTab('resolved');
    if (resolved !== null) return;
    try {
      const r = await apiFetch('/api/issues/resolved?days=30').catch(() => null);
      setResolved(r && r.ok ? await r.json() : []);
    } catch (e) { setResolved([]); }
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
        {issueTab === 'open' && <button className="feed-post-btn" onClick={() => setPosting(p => !p)}>{posting ? 'Cancel' : '+ Post issue / question'}</button>}
      </div>

      <div className="issue-tabs">
        <button className={`issue-tab ${issueTab === 'open' ? 'on' : ''}`} onClick={() => setIssueTab('open')}>Open{issueCount ? ` (${issueCount})` : ''}</button>
        <button className={`issue-tab ${issueTab === 'resolved' ? 'on' : ''}`} onClick={openResolvedTab}>Resolved</button>
      </div>

      {issueTab === 'resolved' ? (
        <>
          {resolved === null && <div className="feed-quiet">Loading resolved…</div>}
          {resolved !== null && resolved.length === 0 && <div className="feed-quiet">Nothing resolved in the last 30 days.</div>}
          {(resolved || []).map(iss => (
            <div key={iss.id} className="issue-row issue-resolved" style={{ borderLeftColor: catColor(iss) }}>
              <span className="issue-icon">✓</span>
              <span className="issue-main">
                <span className="issue-title">{iss.title}</span>
                <span className="issue-sub">
                  {iss.boat_id ? `${iss.boat_id}${iss.customer_name ? ' · ' + iss.customer_name : ''} · ` : ''}
                  {iss.source_tab ? `${deptLabel(iss.source_tab)} · ` : ''}
                  resolved {ageLabel(iss.resolved_at)}{iss.resolved_by ? ` by ${iss.resolved_by}` : ''}
                </span>
                {iss.detail && <span className="issue-detail">{iss.detail}</span>}
              </span>
            </div>
          ))}
          <div className="feed-note" style={{ display: 'block', marginTop: 10 }}>Resolved in the last 30 days. Auto-issues that are still unfixed come back on their own after 24 hours.</div>
        </>
      ) : (
      <>

      {posting && (
        <div className="feed-postform">
          <textarea className="feed-post-text" rows={3} placeholder="Describe the issue or question... (your name attaches automatically)"
            value={qText} onChange={e => setQText(e.target.value)} />

          <div className="ir-label">Type</div>
          <div className="ir-chips">
            {ISSUE_KINDS.map(k => (
              <button key={k} className={`ir-chip ${qKind === k ? 'on' : ''}`} onClick={() => setQKind(qKind === k ? '' : k)}>{k}</button>
            ))}
          </div>

          <div className="ir-label">Area</div>
          <div className="ir-chips">
            {ISSUE_DEPTS.map(d => {
              const col = (ISSUE_CATS.find(c => c.key === d) || {}).color || '#5F6B73';
              return (
                <button key={d} className={`ir-chip ${qDept === d ? 'on' : ''}`}
                  style={qDept === d ? { background: col, borderColor: col, color: '#fff' } : { color: col, borderColor: col + '55' }}
                  onClick={() => setQDept(qDept === d ? '' : d)}>{deptLabel(d)}</button>
              );
            })}
          </div>

          <div className="feed-post-row">
            <select className="feed-post-boat" value={qBoat} onChange={e => setQBoat(e.target.value)}>
              <option value="">No specific boat</option>
              {boats.filter(b => !isDelivered(b)).map(b => <option key={b.boat_id} value={b.boat_id}>{b.boat_id} · {b.customer_name}</option>)}
            </select>
          </div>

          {qPhotos.length > 0 && (
            <div className="ir-thumbs">
              {qPhotos.map((p, i) => (
                <div key={i} className="ir-thumb">
                  <img src={p.url} alt="" />
                  <button className="ir-thumb-x" onClick={() => removePhoto(i)} aria-label="Remove photo">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="ir-actions">
            <label className="ir-photo-btn">📷 Add photo
              <input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} hidden />
            </label>
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
              {deptLabel(c.key)} ({catCounts[c.key]})
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
              {iss.source_tab ? `${deptLabel(iss.source_tab)} · ` : ''}
              open {ageLabel(iss.created_at)}
              {iss.actor_name ? ` — asked by ${iss.actor_name}` : ''}
            </span>
            {iss.detail && <span className="issue-detail">{iss.detail}</span>}
            {iss.problem_type && <span className="ir-kind-badge">{iss.problem_type}</span>}
            {iss.photo_urls?.length > 0 && (
              <span className="ir-card-thumbs">
                {iss.photo_urls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="issue photo" /></a>
                ))}
              </span>
            )}
          </span>
          {isOps && <button className="issue-resolve" onClick={() => resolve(iss.id)}>Resolve</button>}
        </div>
      ))}
      <div className="feed-note" style={{ display: 'block', marginTop: 10 }}>
        Auto-flagged from tracker data + CompanyCam Build Improvements + posted questions. Fix the real thing and an
        auto-issue clears itself; Resolve just hides it{isOps ? '' : ' (Ops)'} — it returns in 24 hours if still true.
      </div>
      </>
      )}
    </div>
  );

  return (
    <div className="feed feed-split">
      {issuesCol}
      {activityCol}
    </div>
  );
}

export default ShopFeed;
