import { useState, useEffect, useRef } from 'react';
import { apiFetch } from './api';
import './KioskView.css';

// Full-screen, high-tech shop-floor board for a wall TV (Raspberry Pi kiosk).
// Reached at ?kiosk=1 once a session is logged in. Read-only: it only GETs data,
// auto-refreshes, and rotates between panels. Press Esc to leave kiosk mode.

// The production pipeline, as columns. Backlog + Delivered are shown as end-cap
// stats rather than columns (they're not "on the floor").
const PIPELINE = [
  { key: 'Pre-Production', label: 'PRE-PROD', accent: '#5B8DEF' },
  { key: 'Glass Shop', label: 'GLASS SHOP', accent: '#22D3EE' },
  { key: 'Back Line', label: 'BACK LINE', accent: '#2DD4BF' },
  { key: 'Front Line', label: 'FRONT LINE', accent: '#A3E635' },
  { key: 'QC', label: 'QC', accent: '#FBBF24' },
];

const FEED_ICON = {
  CHECKLIST_ITEM_COMPLETED: '📸', CHECKLIST_COMPLETED: '📸', CHECKLIST_CREATED: '📸',
  COMMENT_ADDED: '💬', PART_RECEIVED: '📦', PART_DELAYED: '🕓', PART_FLAGGED: '⚠️',
  STAGE_CHANGED: '🚩', QUESTION_POSTED: '❓', APP_TASK_UPDATED: '🛠️',
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

// Sample data for ?kiosk=demo — lets the board be previewed with no backend/login.
const DEMO_BOATS = [
  { boat_id: '25T043', customer_name: 'Stanyek', boat_model: '25T', hull_color: '#1B3A6B', global_status: 'Front Line', sequence_number: 1, segments: [{ name: 'Front Line', fill_pct: 43 }] },
  { boat_id: '25T048', customer_name: 'Morrigno', boat_model: '25T', hull_color: '#0E7C5A', global_status: 'QC', sequence_number: 2, segments: [{ name: 'QC', fill_pct: 78 }] },
  { boat_id: '26F031', customer_name: 'Scituate #1', boat_model: '26 Flats', hull_color: '#B02D2D', global_status: 'Glass Shop', sequence_number: 3, segments: [{ name: 'Glass Shop', fill_pct: 61 }] },
  { boat_id: '26F032', customer_name: 'Scituate #2', boat_model: '26 Flats', hull_color: '#C9A227', global_status: 'Back Line', sequence_number: 4, segments: [{ name: 'Back Line', fill_pct: 24 }] },
  { boat_id: '30S009', customer_name: '7 Sports', boat_model: '30 Sport', hull_color: '#2B6CB0', global_status: 'Glass Shop', sequence_number: 5, segments: [{ name: 'Glass Shop', fill_pct: 12 }] },
  { boat_id: '25T050', customer_name: 'Delgado', boat_model: '25T', hull_color: '#444', global_status: 'Pre-Production', sequence_number: 6, segments: [] },
  { boat_id: '36C004', customer_name: 'Hensley', boat_model: '36 Center', hull_color: '#155E75', global_status: 'Front Line', sequence_number: 7, segments: [{ name: 'Front Line', fill_pct: 88 }] },
  { boat_id: '25T055', customer_name: 'Backlog', boat_model: '25T', hull_color: '#333', global_status: 'Backlog', sequence_number: 8, segments: [] },
];
const DEMO_FEED = [
  { id: 1, type: 'STAGE_CHANGED', title: 'Advanced to QC', boat_id: '25T048', customer_name: 'Morrigno', actor_name: 'Ryan', created_at: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: 2, type: 'CHECKLIST_ITEM_COMPLETED', title: 'Console rigging complete', boat_id: '36C004', work_center_name: 'Front Line', actor_name: 'Jacob', created_at: new Date(Date.now() - 21 * 60000).toISOString() },
  { id: 3, type: 'PART_RECEIVED', title: 'Motors received — Mercury 250', boat_id: '26F031', customer_name: 'Scituate #1', created_at: new Date(Date.now() - 52 * 60000).toISOString() },
  { id: 4, type: 'PART_FLAGGED', title: 'Gelcoat flagged Backordered', boat_id: '30S009', actor_name: 'Kelly', created_at: new Date(Date.now() - 96 * 60000).toISOString() },
  { id: 5, type: 'QUESTION_POSTED', title: 'Which transducer on the 30?', boat_id: '30S009', actor_name: 'Floor', created_at: new Date(Date.now() - 140 * 60000).toISOString() },
  { id: 6, type: 'STAGE_CHANGED', title: 'Advanced to Back Line', boat_id: '26F032', customer_name: 'Scituate #2', actor_name: 'Ryan', created_at: new Date(Date.now() - 210 * 60000).toISOString() },
];

function KioskView({ demo }) {
  const [boats, setBoats] = useState(demo ? DEMO_BOATS : []);
  const [feed, setFeed] = useState(demo ? DEMO_FEED : []);
  const [panel, setPanel] = useState(0);   // 0 = pipeline, 1 = activity
  const [tick, setTick] = useState(0);      // rotation progress 0..1
  const now = useClock();
  const PANELS = 2;
  const ROTATE_MS = 22000;

  // --- data load + refresh ---
  const load = async () => {
    try {
      const [bRes, tlRes, fRes] = await Promise.all([
        apiFetch('/api/boats').catch(() => null),
        apiFetch('/api/timeline').catch(() => null),
        apiFetch('/api/assembly/feed?limit=80').catch(() => null),
      ]);
      let bs = bRes && bRes.ok ? await bRes.json() : [];
      if (tlRes && tlRes.ok) {
        const tl = await tlRes.json();
        const seg = {};
        for (const g of (tl.groups || [])) if (g.kind === 'boat') seg[g.key] = g.segments;
        bs = bs.map(b => ({ ...b, segments: seg[b.boat_id] }));
      }
      setBoats(bs);
      if (fRes && fRes.ok) setFeed(await fRes.json());
    } catch { /* keep last good data on the wall */ }
  };
  useEffect(() => { if (demo) return; load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [demo]);

  // --- panel rotation with a progress sweep (two independent timers) ---
  useEffect(() => {
    const sweep = setInterval(() => setTick(t => (t + 100 / ROTATE_MS >= 1 ? 0 : t + 100 / ROTATE_MS)), 100);
    const rot = setInterval(() => { setPanel(p => (p + 1) % PANELS); setTick(0); }, ROTATE_MS);
    return () => { clearInterval(sweep); clearInterval(rot); };
  }, []);

  // --- Esc leaves kiosk mode ---
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { window.location.href = window.location.pathname; } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stageOf = (b) => b.global_status;
  const inProd = boats.filter(b => PIPELINE.some(p => p.key === stageOf(b)));
  const backlog = boats.filter(b => stageOf(b) === 'Backlog').length;
  const delivered = boats.filter(b => stageOf(b) === 'Delivered').length;
  const byStage = (k) => inProd.filter(b => stageOf(b) === k).sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999));
  const fillOf = (b) => {
    const s = (b.segments || []).find(sg => sg.name === stageOf(b));
    return s && s.fill_pct != null ? Math.round(s.fill_pct) : null;
  };

  const clock = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="kio">
      <div className="kio-bg" />
      <div className="kio-scan" />

      <header className="kio-top">
        <div className="kio-brand">
          <span className="kio-logo">BLUEWATER</span>
          <span className="kio-sub">SHOP FLOOR · LIVE</span>
        </div>
        <div className="kio-kpis">
          <Kpi n={inProd.length} label="IN PRODUCTION" accent="#22D3EE" />
          <Kpi n={byStage('QC').length} label="IN QC" accent="#FBBF24" />
          <Kpi n={backlog} label="QUEUED" accent="#5B8DEF" />
          <Kpi n={delivered} label="DELIVERED" accent="#2DD4BF" />
        </div>
        <div className="kio-clock">
          <span className="kio-live"><i />LIVE</span>
          <span className="kio-time">{clock}</span>
          <span className="kio-day">{day}</span>
        </div>
      </header>

      <div className="kio-rot">
        {Array.from({ length: PANELS }).map((_, i) => (
          <span key={i} className={`kio-dot ${i === panel ? 'on' : ''}`}>
            {i === panel && <span className="kio-dot-fill" style={{ width: `${tick * 100}%` }} />}
          </span>
        ))}
      </div>

      <main className="kio-stage">
        {panel === 0 ? (
          <section className="kio-panel kio-pipeline">
            {PIPELINE.map(col => {
              const list = byStage(col.key);
              return (
                <div key={col.key} className="kio-col" style={{ '--accent': col.accent }}>
                  <div className="kio-col-head">
                    <span className="kio-col-name">{col.label}</span>
                    <span className="kio-col-count">{list.length}</span>
                  </div>
                  <div className="kio-col-body">
                    {list.map(b => {
                      const fill = fillOf(b);
                      return (
                        <div key={b.boat_id} className="kio-card">
                          <div className="kio-card-top">
                            <span className="kio-hull">{b.boat_id}</span>
                            {b.hull_color && <span className="kio-chip" title={b.hull_color} />}
                          </div>
                          <div className="kio-cust">{b.customer_name || '—'}</div>
                          <div className="kio-model">{b.boat_model || ''}</div>
                          {fill != null && (
                            <div className="kio-prog"><span style={{ width: `${fill}%` }} /><em>{fill}%</em></div>
                          )}
                        </div>
                      );
                    })}
                    {list.length === 0 && <div className="kio-empty">—</div>}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="kio-panel kio-activity">
            <div className="kio-act-head">LIVE ACTIVITY</div>
            <div className="kio-ticker">
              <div className="kio-ticker-track" style={{ animationDuration: `${Math.max(20, feed.length * 2.4)}s` }}>
                {[...feed, ...feed].map((it, i) => (
                  <div key={i} className="kio-act-row">
                    <span className="kio-act-icon">{FEED_ICON[it.type] || '•'}</span>
                    <span className="kio-act-main">
                      <span className="kio-act-title">{it.title}</span>
                      <span className="kio-act-sub">
                        {it.boat_id}{it.customer_name ? ` · ${it.customer_name}` : ''}
                        {it.work_center_name ? ` · ${it.work_center_name}` : ''}
                        {it.actor_name ? ` — ${it.actor_name}` : ''}
                      </span>
                    </span>
                    <span className="kio-act-time">{timeAgo(it.created_at)}</span>
                  </div>
                ))}
                {feed.length === 0 && <div className="kio-act-row"><span className="kio-act-main"><span className="kio-act-title">Waiting for shop activity…</span></span></div>}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Kpi({ n, label, accent }) {
  return (
    <div className="kio-kpi" style={{ '--accent': accent }}>
      <span className="kio-kpi-n">{n}</span>
      <span className="kio-kpi-l">{label}</span>
    </div>
  );
}

export default KioskView;
