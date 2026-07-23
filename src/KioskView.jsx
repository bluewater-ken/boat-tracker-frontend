import { useState, useEffect, useRef } from 'react';
import { apiFetch } from './api';
import Logo from './Logo';
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
// Feed events that count as "something got done" — a new one drops the bomb.
const COMPLETION_TYPES = new Set(['CHECKLIST_ITEM_COMPLETED', 'CHECKLIST_COMPLETED', 'PART_RECEIVED', 'STAGE_CHANGED']);

// Synthesized bomb-drop (falling whistle → explosion) via Web Audio — no audio
// file, CSP-safe. Evokes the classic DJ air-horn/bomb without using any sample.
function playBombDrop() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = playBombDrop._ctx || (playBombDrop._ctx = new AC());
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;

    // 1) Falling whistle
    const w = ctx.createOscillator(), wg = ctx.createGain();
    w.type = 'sine';
    w.frequency.setValueAtTime(1500, t0);
    w.frequency.exponentialRampToValueAtTime(170, t0 + 0.7);
    wg.gain.setValueAtTime(0.0001, t0);
    wg.gain.exponentialRampToValueAtTime(0.3, t0 + 0.05);
    wg.gain.exponentialRampToValueAtTime(0.08, t0 + 0.7);
    w.connect(wg); wg.connect(ctx.destination);
    w.start(t0); w.stop(t0 + 0.72);

    // 2) Explosion when the whistle lands
    const bt = t0 + 0.66, dur = 1.0;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass';
    nf.frequency.setValueAtTime(1400, bt); nf.frequency.exponentialRampToValueAtTime(120, bt + 0.6);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, bt); ng.gain.exponentialRampToValueAtTime(0.001, bt + 0.85);
    noise.connect(nf); nf.connect(ng); ng.connect(ctx.destination);
    noise.start(bt); noise.stop(bt + dur);

    // low sub-boom for the punch
    const s = ctx.createOscillator(), sg = ctx.createGain();
    s.type = 'sine';
    s.frequency.setValueAtTime(130, bt); s.frequency.exponentialRampToValueAtTime(38, bt + 0.5);
    sg.gain.setValueAtTime(0.0001, bt); sg.gain.exponentialRampToValueAtTime(0.9, bt + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.001, bt + 0.75);
    s.connect(sg); sg.connect(ctx.destination);
    s.start(bt); s.stop(bt + 0.8);
  } catch { /* audio not allowed yet (needs a gesture / kiosk autoplay flag) */ }
}

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
const dOff = (days) => { const x = new Date(); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
// each in-prod boat: last segment `end` (projected completion) + `target_date` so
// the pipeline can show ETA and behind/ahead. Extra backlog boats so the column scrolls.
const seg = (name, fill, end) => [{ name, fill_pct: fill, end }];
const DEMO_BOATS = [
  { boat_id: '25T043', customer_name: 'Stanyek', boat_model: '25T', hull_color: '#1B3A6B', global_status: 'Front Line', sequence_number: 1, segments: seg('Front Line', 43, dOff(18)), target_date: dOff(10) },
  { boat_id: '25T048', customer_name: 'Morrigno', boat_model: '25T', hull_color: '#0E7C5A', global_status: 'QC', sequence_number: 2, segments: seg('QC', 78, dOff(6)), target_date: dOff(12) },
  { boat_id: '26F031', customer_name: 'Scituate #1', boat_model: '26 Flats', hull_color: '#B02D2D', global_status: 'Glass Shop', sequence_number: 3, segments: seg('Glass Shop', 61, dOff(34)), target_date: dOff(35) },
  { boat_id: '26F032', customer_name: 'Scituate #2', boat_model: '26 Flats', hull_color: '#C9A227', global_status: 'Back Line', sequence_number: 4, segments: seg('Back Line', 24, dOff(41)), target_date: dOff(30) },
  { boat_id: '30S009', customer_name: '7 Sports', boat_model: '30 Sport', hull_color: '#2B6CB0', global_status: 'Glass Shop', sequence_number: 5, segments: seg('Glass Shop', 12, dOff(47)), target_date: dOff(52) },
  { boat_id: '36C004', customer_name: 'Hensley', boat_model: '36 Center', hull_color: '#155E75', global_status: 'Front Line', sequence_number: 6, segments: seg('Front Line', 88, dOff(4)), target_date: dOff(4) },
  { boat_id: '25T050', customer_name: 'Delgado', boat_model: '25T', hull_color: '#6B4FA0', global_status: 'Pre-Production', sequence_number: 7, segments: seg('Pre-Production', 30, dOff(58)), target_date: dOff(55) },
  { boat_id: '28C012', customer_name: 'Rourke', boat_model: '28 Center', hull_color: '#0F766E', global_status: 'Back Line', sequence_number: 8, segments: seg('Back Line', 55, dOff(29)), target_date: dOff(33) },
  { boat_id: '25T060', customer_name: 'Alvarez', boat_model: '25T', hull_color: '#334155', global_status: 'QC', sequence_number: 9, segments: seg('QC', 40, dOff(9)), target_date: dOff(7) },
  ...['Whitaker', 'Ferro', 'Nguyen', 'Costa', 'Bianchi', 'Ortiz', 'Halloran', 'Vance', 'Reyes', 'Pope'].map((c, i) => (
    { boat_id: `25T0${70 + i}`, customer_name: c, boat_model: i % 2 ? '30 Sport' : '25T', hull_color: '#3A4553', global_status: 'Backlog', sequence_number: 10 + i, segments: [] })),
];
const DEMO_FEED = [
  { id: 1, type: 'STAGE_CHANGED', title: 'Advanced to QC', boat_id: '25T048', customer_name: 'Morrigno', actor_name: 'Ryan', created_at: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: 2, type: 'CHECKLIST_ITEM_COMPLETED', title: 'Console rigging complete', boat_id: '36C004', work_center_name: 'Front Line', actor_name: 'Jacob', created_at: new Date(Date.now() - 21 * 60000).toISOString() },
  { id: 3, type: 'PART_RECEIVED', title: 'Motors received — Mercury 250', boat_id: '26F031', customer_name: 'Scituate #1', created_at: new Date(Date.now() - 52 * 60000).toISOString() },
  { id: 4, type: 'PART_FLAGGED', title: 'Gelcoat flagged Backordered', boat_id: '30S009', actor_name: 'Kelly', created_at: new Date(Date.now() - 96 * 60000).toISOString() },
  { id: 5, type: 'QUESTION_POSTED', title: 'Which transducer on the 30?', boat_id: '30S009', actor_name: 'Floor', created_at: new Date(Date.now() - 140 * 60000).toISOString() },
  { id: 6, type: 'STAGE_CHANGED', title: 'Advanced to Back Line', boat_id: '26F032', customer_name: 'Scituate #2', actor_name: 'Ryan', created_at: new Date(Date.now() - 210 * 60000).toISOString() },
];
// One richly-populated boat (lots of tasks) so overflow/auto-scroll is visible.
const DEMO_BOAT_DETAIL = {
  boat_id: '25T048', customer_name: 'Morrigno', boat_model: '25T', hull_color: '#0E7C5A',
  motor: 'Twin Mercury 250', global_status: 'Back Line', stageFill: 55, target: 'Aug 14',
  keyParts: [
    { n: 'Motors', s: 'done', d: 'Twin Mercury 250' }, { n: 'Gelcoat', s: 'done' }, { n: 'Coosa Kit', s: 'done' },
    { n: 'Steering', s: 'done' }, { n: 'Hardware', s: 'done' }, { n: 'Ride Plate', s: 'done' },
    { n: 'New Wire', s: 'done' }, { n: 'Upholstery', s: 'ordered' }, { n: 'Electronics', s: 'ordered' },
    { n: 'Bracket', s: 'not' }, { n: 'Trailer', s: 'not' }, { n: 'Wallabys Tanks', s: 'not' },
  ],
  lamination: [
    { n: 'Glass Kit', s: 'done' }, { n: 'Hull', s: 'done' }, { n: 'T Top', s: 'done' }, { n: 'Liner', s: 'done' },
    { n: 'Ring', s: 'done' }, { n: 'Baitwell', s: 'done' }, { n: 'Leaning Post', s: 'done' }, { n: 'Console', s: 'done' },
    { n: 'Console Face', s: 'progress' }, { n: 'Hatches', s: 'progress' }, { n: 'Boxes', s: 'not' }, { n: 'Grid', s: 'not' },
  ],
  finishing: [
    { n: 'Hull', s: 'done' }, { n: 'Liner', s: 'progress' }, { n: 'Ring', s: 'not' }, { n: 'Hard Top', s: 'not' },
    { n: 'Console', s: 'progress' }, { n: 'Console Face', s: 'not' }, { n: 'Hatches', s: 'not' },
    { n: 'Leaning Post', s: 'not' }, { n: 'Buckets', s: 'not' },
  ],
  workcenters: [
    { n: 'Backline — Hull', done: 4, total: 18, open: ['Take photos of motors', 'Drill/cut transom thru-hull', 'Rig for windlass', 'Install fuel tanks', 'Install rig tube', 'Install anchor liner', 'Install forward fish boxes', 'Install coffin box', 'Install fresh water tank', 'Install aft fish boxes', 'Paint bilge and transom', 'Foam all hull areas', 'Set floor', 'Bond stringers'] },
    { n: 'Backline — Deck', done: 8, total: 12, open: ['Dry fit to hull', 'Mate deck to hull', 'Bond deck seam', 'Install rub rail'] },
    { n: 'Backline — Ring', done: 0, total: 14, open: ['Cut and trim flange', 'Cut out deck cleats', 'Cut out fuel fills', 'Cut fwd nav light', 'Check livewell for leaks', 'Install deck cleats', 'Install rod holders', 'Install bolster clips', 'Install baitwell lights', 'Drill mounting holes', 'Fit hatches', 'Seal gunnels', 'Rig plumbing', 'Final trim'] },
    { n: 'Console & Hardtop', done: 2, total: 16, open: ['Cut out console door', 'Install binnacle', 'Install helm', 'Install gauge', 'Install joystick', 'Install steering (electric)', 'Install kill switch', 'Install MFDs', 'Electronics mounting', 'Install switch panel', 'Wire nav lights', 'Mount stereo', 'Fit windshield', 'Install grab rail'] },
    { n: 'Front Line', done: 3, total: 15, open: ['Install scupper covers', 'Install pickup strainer', 'Install transom rod rack', 'Install rub rail', 'Install deck hatches', 'Plumb livewell', 'Connect gutter drains', 'Connect in bilge', 'Install legset and hardtop', 'Install transom door', 'Rig fuel', 'Bleed steering'] },
  ],
  flags: [{ t: 'QC PUNCH LIST', c: 'warn' }],
};

const STATUS_MARK = { done: '✓', received: '✓', ordered: '◐', progress: '◐', not: '○' };
const STATUS_CLS = { done: 'ok', received: 'ok', ordered: 'wip', progress: 'wip', not: 'off' };
const countDone = (arr) => arr.filter(i => i.s === 'done' || i.s === 'received').length;

// CompanyCam checklist items carry template cruft — strip it so only real tasks show.
const KNOISE = [/template is a new format/i, /provide feedback/i, /^additional notes/i, /^approved by/i, /read carefully/i, /input pictures here/i];
const cleanItem = (raw) => {
  const s = String(raw || '').replace(/\*\*|__/g, '').trim();
  if (!s || s.includes('🛑')) return null;
  return KNOISE.some(re => re.test(s)) ? null : s;
};

// Per-boat detail mapping — mirrors PreProductionReport so the kiosk reads the same.
const KLAM_TASKS = ['Glass Kit', 'Hull', 'T Top', 'Liner', 'Ring', 'Baitwell', 'Leaning Post', 'Console', 'Console Face', 'Hatches', 'Boxes', 'Grid', 'Other'];
const KFIN_TASKS = ['Hull', 'Liner', 'Ring', 'Hard Top', 'Console', 'Console Face', 'Hatches', 'Leaning Post', 'Buckets', 'Other'];
const lamDone = (task, status) => (task === 'Glass Kit' ? ['Complete'] : ['Complete/On Mold', 'Pulled']).includes(status || '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtMonthDay = (iso) => { if (!iso) return '—'; const [, m, d] = String(iso).slice(0, 10).split('-'); return `${MON[+m - 1]} ${+d}`; };
const isMotor = (name) => /^motors?$/i.test(String(name || '').trim());

// Build one boat's detail object (shape consumed by KioskTraveler/KioskStatus) from
// the fetched lamination/finishing/parts/assembly data.
function buildBoatDetail(b, aux) {
  const { lam, fin, parts, std, asm, wcs } = aux;
  const pFor = parts.filter(p => p.boat_id === b.boat_id);
  const keyParts = std.map(name => {
    const p = pFor.find(x => x.part_name === name && !x.is_custom);
    if (!p || p.na) return null;
    const s = p.status === 'Received' ? 'done' : p.status === 'Ordered' ? 'ordered' : 'not';
    return { n: name, s, d: isMotor(name) ? (p.description || '') : '' };
  }).filter(Boolean);
  const lamBy = {}; for (const r of lam) if (r.boat_id === b.boat_id) lamBy[r.task_name] = r;
  const lamination = KLAM_TASKS.map(t => {
    const r = lamBy[t]; if (!r || r.na) return null;
    const s = lamDone(t, r.status) ? 'done' : (r.status === 'In Progress' || r.status === 'Mold Open') ? 'progress' : 'not';
    return { n: t, s };
  }).filter(Boolean);
  const finBy = {}; for (const r of fin) if (r.boat_id === b.boat_id) finBy[r.task_name] = r;
  const finishing = KFIN_TASKS.map(t => {
    const r = finBy[t]; if (!r || r.na || r.status === 'Not Available') return null;
    const s = r.status === 'Complete' ? 'done' : r.status === 'In Progress' ? 'progress' : 'not';
    return { n: t, s };
  }).filter(Boolean);
  const workcenters = (wcs || []).filter(w => w.id !== 'quality-control').map(w => {
    const row = (asm?.rows || []).find(r => r.boat_id === b.boat_id && r.work_center_id === w.id);
    if (!row) return null;
    const items = (row.items || []).map(i => ({ name: cleanItem(i.name), done: !!i.done })).filter(i => i.name);
    // Older/delivered boats have no items[] — fall back to the open "remaining" list.
    const open = items.length ? items.filter(i => !i.done).map(i => i.name)
      : (row.remaining || []).map(cleanItem).filter(Boolean);
    const total = items.length || (row.remaining || []).length;
    if (!total) return null;
    return { n: w.name || w.id, done: items.filter(i => i.done).length, total, open };
  }).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  const flags = [];
  if (pFor.some(p => p.status !== 'Received' && (p.flag_late || p.flag_backordered ||
    (p.expected_delivery && String(p.expected_delivery).slice(0, 10) < today)))) flags.push({ t: 'PARTS LATE', c: 'warn' });
  const seg = (b.segments || []).find(s => s.name === b.global_status);
  const segs = b.segments || [];
  return {
    boat_id: b.boat_id, customer_name: b.customer_name, boat_model: b.boat_model, hull_color: b.hull_color,
    motor: (pFor.find(p => isMotor(p.part_name))?.description || '').trim(),
    global_status: b.global_status,
    stageFill: seg && seg.fill_pct != null ? Math.round(seg.fill_pct) : null,
    target: b.target_date ? fmtMonthDay(b.target_date) : (segs.length ? fmtMonthDay(segs[segs.length - 1].end) : '—'),
    keyParts, lamination, finishing, workcenters, flags,
  };
}

function KioskView({ demo }) {
  const [boats, setBoats] = useState(demo ? DEMO_BOATS : []);
  const [feed, setFeed] = useState(demo ? DEMO_FEED : []);
  const [aux, setAux] = useState(null); // { lam, fin, parts, std, asm, wcs } for per-boat pages
  const [panel, setPanel] = useState(0);   // index into `pages` (0 = pipeline)
  const [manual, setManual] = useState(false); // arrows browse boat pages
  const now = useClock();
  const RESUME_MS = 60000; // after a manual move, return to the pipeline when idle this long
  const seenRef = useRef(null); // feed ids seen so far — a new completion drops the bomb

  // --- data load + refresh ---
  const load = async () => {
    try {
      const [bRes, tlRes, fRes, lamRes, finRes, asmRes, partsRes, stdRes] = await Promise.all([
        apiFetch('/api/boats').catch(() => null),
        apiFetch('/api/timeline').catch(() => null),
        apiFetch('/api/assembly/feed?limit=80').catch(() => null),
        apiFetch('/api/lamination').catch(() => null),
        apiFetch('/api/finishing').catch(() => null),
        apiFetch('/api/assembly').catch(() => null),
        apiFetch('/api/parts').catch(() => null),
        apiFetch('/api/parts/standard').catch(() => null),
      ]);
      let bs = bRes && bRes.ok ? await bRes.json() : [];
      if (tlRes && tlRes.ok) {
        const tl = await tlRes.json();
        const seg = {}, tgt = {};
        for (const g of (tl.groups || [])) if (g.kind === 'boat') { seg[g.key] = g.segments; tgt[g.key] = g.target_date; }
        bs = bs.map(b => ({ ...b, segments: seg[b.boat_id], target_date: b.target_date || tgt[b.boat_id] }));
      }
      setBoats(bs);
      if (fRes && fRes.ok) {
        const f = await fRes.json();
        setFeed(f);
        // Drop the bomb when a NEW completion shows up (but not on the first load,
        // which would fire for every existing item).
        const ids = new Set(f.map(it => it.id));
        if (seenRef.current && f.some(it => !seenRef.current.has(it.id) && COMPLETION_TYPES.has(it.type))) playBombDrop();
        seenRef.current = ids;
      }
      const asm = asmRes && asmRes.ok ? await asmRes.json() : null;
      setAux({
        lam: lamRes && lamRes.ok ? await lamRes.json() : [],
        fin: finRes && finRes.ok ? await finRes.json() : [],
        parts: partsRes && partsRes.ok ? await partsRes.json() : [],
        std: stdRes && stdRes.ok ? await stdRes.json() : [],
        asm,
        wcs: (asm?.work_centers || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      });
    } catch { /* keep last good data on the wall */ }
  };
  useEffect(() => { if (demo) return; load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [demo]);

  // After browsing boat pages with the arrows, return to the pipeline when idle.
  useEffect(() => {
    if (!manual) return;
    const t = setTimeout(() => { setManual(false); setPanel(0); }, RESUME_MS);
    return () => clearTimeout(t);
  }, [manual, panel]);

  const stageOf = (b) => b.global_status;
  const inProd = boats.filter(b => PIPELINE.some(p => p.key === stageOf(b)));
  const backlog = boats.filter(b => stageOf(b) === 'Backlog').length;
  const delivered = boats.filter(b => stageOf(b) === 'Delivered').length;
  const byStage = (k) => inProd.filter(b => stageOf(b) === k).sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999));
  // All boats in a stage (incl. Backlog, which isn't in `inProd`) for the pipeline columns.
  const stageBoats = (k) => boats.filter(b => stageOf(b) === k).sort((a, b) => (a.sequence_number || 999) - (b.sequence_number || 999));
  // Pipeline columns: the Queued (Backlog) boats first, then the production stages.
  const PIPE_COLS = [{ key: 'Backlog', label: 'BACKLOG', accent: '#8492A6' }, ...PIPELINE];
  const fillOf = (b) => {
    const s = (b.segments || []).find(sg => sg.name === stageOf(b));
    return s && s.fill_pct != null ? Math.round(s.fill_pct) : null;
  };
  // Projected completion (last timeline segment end) and how it compares to the
  // boat's ◆ target date — behind (projected past target), ahead, or on time.
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  const schedOf = (b) => {
    const segs = b.segments || [];
    const end = segs.length ? segs[segs.length - 1].end : null;
    if (!end) return null;
    const eta = fmtMonthDay(end);
    const target = b.target_date;
    if (!target) return { eta, status: null };
    const d = dayDiff(String(target).slice(0, 10), String(end).slice(0, 10));
    return { eta, status: d > 1 ? 'behind' : d < -1 ? 'ahead' : 'ontime', days: Math.abs(d) };
  };

  // The pipeline is the always-on main page; each in-production boat adds a
  // Build Traveler page reachable with the arrows. The live feed is NOT a page —
  // it runs as a horizontal ticker along the bottom of every screen.
  const pages = ['pipeline'];
  if (demo) pages.push({ v: 'traveler', b: DEMO_BOAT_DETAIL });
  else if (aux) inProd.forEach(b => pages.push({ v: 'traveler', b: buildBoatDetail(b, aux) }));
  const cur = pages[Math.min(panel, pages.length - 1)];

  const step = (dir) => { setManual(true); setPanel(p => (p + dir + pages.length) % pages.length); };
  const stepRef = useRef(step); stepRef.current = step;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') window.location.href = window.location.pathname;
      else if (e.key === 'ArrowRight') stepRef.current(1);
      else if (e.key === 'ArrowLeft') stepRef.current(-1);
      else if (e.key === 's' || e.key === 'S') playBombDrop(); // test the completion sound
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pageLabel = (p) => p === 'pipeline' ? 'PRODUCTION PIPELINE' : `${p.b.boat_id} · BOAT DETAIL`;

  const clock = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="kio">
      <div className="kio-bg" />
      <div className="kio-scan" />

      <header className="kio-top">
        <div className="kio-brand">
          <Logo size={30} light />
          <span className="kio-sub">B.O.S.S · Bluewater Operations &amp; Shop System</span>
        </div>
        <div className="kio-kpis">
          <Kpi n={inProd.length} label="IN PRODUCTION" accent="#22D3EE" />
          <Kpi n={byStage('QC').length} label="IN QC" accent="#FBBF24" />
          <Kpi n={backlog} label="BACKLOG" accent="#5B8DEF" />
          <Kpi n={delivered} label="DELIVERED" accent="#2DD4BF" />
        </div>
        <div className="kio-clock">
          <span className="kio-live"><i />LIVE</span>
          <span className="kio-time">{clock}</span>
          <span className="kio-day">{day}</span>
        </div>
      </header>

      <div className="kio-rot">
        <button className="kio-nav" onClick={() => step(-1)} aria-label="Previous page">‹</button>
        {cur === 'pipeline' ? (
          <span className="kio-rot-label">PRODUCTION PIPELINE{manual && <em> · paused</em>}</span>
        ) : (
          <div className="kio-rot-boat">
            <span className="kio-rb-hull">{cur.b.boat_id}</span>
            {cur.b.hull_color && <span className="kio-bchip" style={{ color: cur.b.hull_color }} />}
            <span className="kio-rb-cust">{cur.b.customer_name}</span>
            {[cur.b.boat_model, cur.b.motor].filter(Boolean).length > 0 &&
              <span className="kio-rb-spec">{[cur.b.boat_model, cur.b.motor].filter(Boolean).join(' · ')}</span>}
            <span className="kio-rb-stage">{cur.b.global_status}</span>
            {manual && <em className="kio-rb-paused">paused</em>}
          </div>
        )}
        <div className="kio-dots">
          {pages.map((p, i) => (
            <span key={i} className={`kio-dot ${i === panel ? 'on' : ''} ${p === 'pipeline' ? 'overview' : 'boat'}`}
              title={p === 'pipeline' ? 'Overview' : p.b.boat_id}>
              {p === 'pipeline' ? '▦' : '🚤'}
            </span>
          ))}
        </div>
        <button className="kio-nav" onClick={() => step(1)} aria-label="Next page">›</button>
      </div>

      <main className="kio-stage">
        {cur === 'pipeline' ? (
          <section className="kio-panel kio-pipeline" style={{ gridTemplateColumns: `repeat(${PIPE_COLS.length}, 1fr)` }}>
            {PIPE_COLS.map(col => {
              const list = stageBoats(col.key);
              return (
                <div key={col.key} className="kio-col" style={{ '--accent': col.accent }}>
                  <div className="kio-col-head">
                    <span className="kio-col-name">{col.label}</span>
                    <span className="kio-col-count">{list.length}</span>
                  </div>
                  <AutoScroll className="kio-col-body">
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
                          {(() => { const s = schedOf(b); if (!s) return null; return (
                            <div className="kio-eta">
                              <span className="kio-eta-d">ETA {s.eta}</span>
                              {s.status === 'behind' && <span className="kio-sched behind">{s.days}d behind</span>}
                              {s.status === 'ahead' && <span className="kio-sched ahead">{s.days}d ahead</span>}
                              {s.status === 'ontime' && <span className="kio-sched ontime">on time</span>}
                            </div>
                          ); })()}
                        </div>
                      );
                    })}
                    {list.length === 0 && <div className="kio-empty">—</div>}
                  </AutoScroll>
                </div>
              );
            })}
          </section>
        ) : (
          <KioskTraveler b={cur.b} />
        )}
      </main>

      <TickerBar feed={feed} />
    </div>
  );
}

// Persistent horizontal news-ticker along the bottom of every screen — the live
// shop feed scrolling right→left. The list is doubled so the scroll loops seamlessly.
function TickerBar({ feed }) {
  const items = feed.length ? feed : [{ id: 'x', title: 'Waiting for shop activity…' }];
  return (
    <div className="kio-tickerbar">
      <span className="kio-tick-tag"><i />LIVE</span>
      <div className="kio-tick-view">
        <div className="kio-tick-track" style={{ animationDuration: `${Math.max(30, items.length * 6)}s` }}>
          {[...items, ...items].map((it, i) => (
            <span key={i} className="kio-tick-item">
              <span className="kio-tick-icon">{FEED_ICON[it.type] || '•'}</span>
              <span className="kio-tick-title">{it.title}</span>
              {it.boat_id && <span className="kio-tick-meta">{it.boat_id}{it.customer_name ? ` · ${it.customer_name}` : ''}{it.actor_name ? ` — ${it.actor_name}` : ''}</span>}
              {it.created_at && <span className="kio-tick-time">{timeAgo(it.created_at)}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// A box that slowly auto-pans its content up, pauses, then back down — so a wall
// display with no input still reveals data that overflows. No scrollbar (the box
// stays overflow:hidden; we drive scrollTop). Idle when nothing overflows.
function AutoScroll({ className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf, pos = 0, dir = 1, pauseUntil = 0, last = performance.now();
    const SPEED = 16, PAUSE = 2200; // px/sec, ms at each end
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 4) {
        if (now >= pauseUntil) {
          pos += dir * SPEED * dt;
          if (pos >= max) { pos = max; dir = -1; pauseUntil = now + PAUSE; }
          else if (pos <= 0) { pos = 0; dir = 1; pauseUntil = now + PAUSE; }
          el.scrollTop = pos;
        }
      } else if (el.scrollTop) { el.scrollTop = pos = 0; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

function Kpi({ n, label, accent }) {
  return (
    <div className="kio-kpi" style={{ '--accent': accent }}>
      <span className="kio-kpi-n">{n}</span>
      <span className="kio-kpi-l">{label}</span>
    </div>
  );
}

function StatList({ title, items }) {
  const isDone = (i) => i.s === 'done' || i.s === 'received';
  const left = items.filter(i => !isDone(i)).length;
  // Not-done first (stable) so if the column clips, it only hides completed items.
  const ordered = [...items].sort((a, b) => (isDone(a) ? 1 : 0) - (isDone(b) ? 1 : 0));
  return (
    <div className="kio-bcol">
      <div className="kio-bcol-head">
        <span>{title}</span>
        {left > 0 ? <em className="kio-left">{left} LEFT</em> : <em className="kio-alldone">✓ DONE</em>}
      </div>
      <AutoScroll className="kio-bcol-list">
        {ordered.map(it => (
          <div key={it.n} className={`kio-bitem ${STATUS_CLS[it.s]}`}>
            <span className="kio-bmark">{STATUS_MARK[it.s]}</span>
            <span className="kio-bname">{it.n}{it.d ? <em> — {it.d}</em> : ''}</span>
          </div>
        ))}
      </AutoScroll>
    </div>
  );
}

// Full build traveler: Key Parts / Lamination / Finishing across the top, then
// Work Centers spanning the full width below (sub-columns) so a boat in heavy
// assembly can show many individual open tasks.
function KioskTraveler({ b }) {
  const wcOpen = b.workcenters.reduce((s, w) => s + (w.open?.length || 0), 0);
  return (
    <section className="kio-panel kio-boat kio-traveler">
      <div className="kio-btop">
        <StatList title="KEY PARTS" items={b.keyParts} />
        <StatList title="LAMINATION" items={b.lamination} />
        <StatList title="FINISHING" items={b.finishing} />
      </div>
      <div className="kio-bwc kio-bcol">
        <div className="kio-bcol-head">
          <span>WORK CENTERS</span>
          {wcOpen > 0 ? <em className="kio-left">{wcOpen} LEFT</em> : <em className="kio-alldone">✓ DONE</em>}
        </div>
        <div className="kio-wc-grid">
          {b.workcenters.map(w => {
            const pct = Math.round((w.done / w.total) * 100);
            const open = w.open || [];
            return (
              <div key={w.n} className="kio-wc">
                <div className="kio-wc-top"><span>{w.n}</span><em>{w.done}/{w.total}</em></div>
                <div className="kio-wc-bar"><span style={{ width: `${pct}%` }} /></div>
                {open.length > 0 && (
                  <AutoScroll className="kio-wc-tasks">
                    {open.map(t => <span key={t} className="kio-wc-task">{t}</span>)}
                  </AutoScroll>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default KioskView;
