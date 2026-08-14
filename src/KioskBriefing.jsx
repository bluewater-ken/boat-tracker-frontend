// Kiosk "Today at Bluewater" screen — the shop notices you post plus the AI
// daily production briefing. Notices come from /api/announcements, the briefing
// from /api/daily-briefing (generated once each morning, refreshable in the app).
//
// The briefing text is one pipe-delimited line per boat so it renders as scannable
// status cards, not prose:
//   LABEL | stage | pct | schedule | issue; issue | next step
// Any line without pipes (e.g. "Overall: …") becomes the summary banner.

// A self-contained sample photo (inline SVG, no network) so the demo shows how a
// notice with a picture looks. Real notices carry a downscaled JPEG data URL.
const DEMO_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="220" viewBox="0 0 260 220">' +
  '<rect width="260" height="220" fill="#0e2a3a"/><rect y="132" width="260" height="88" fill="#12546b"/>' +
  '<circle cx="212" cy="48" r="22" fill="#ffd76a"/>' +
  '<path d="M64 130 L196 130 L178 166 L82 166 Z" fill="#eef3f7"/>' +
  '<rect x="126" y="86" width="8" height="44" fill="#c9d6e0"/>' +
  '<path d="M134 88 L134 130 L174 130 Z" fill="#f4b942"/></svg>'
);

export const DEMO_ANNOUNCEMENTS = [
  { id: 1, body: 'Team lunch today at noon — tacos in the break room. On the house!', author_name: 'Ken', created_at: '2026-08-14T08:10:00', image_url: null },
  { id: 2, body: 'Customer visit 2:00 PM — the Landshark owner is touring the floor. Let’s make her shine.', author_name: 'Ryan', created_at: '2026-08-14T07:30:00', image_url: DEMO_PHOTO },
  { id: 3, body: 'Safety stand-up Friday 7:30 AM sharp. All hands in the paint bay.', author_name: 'Ken', created_at: '2026-08-13T16:00:00', image_url: null },
];

export const DEMO_BRIEFING = {
  generated_at: '2026-08-14T06:05:00',
  text: [
    '28225 (Trey, White) | Front Line | 77% | 4 days ahead | Wallabys Other partial; bow seat unresolved | Finish Front Line tasks, move to QC',
    '25T043 (Svoboda, White) | QC | 96% | 37 days behind | All parts in; final QC + photos | Sign off for delivery',
    '25T048 (Stanyek, Dark Blue) | Front Line | 51% | 12 days behind | Hatches flagged ASAP; bow shield pending | Push Hatches, hold Front Line',
    '25T049 (PCY, Pigeon Blue) | Back Line | 37% | 13 days behind | 3 ASAP: Console, Hatches, Buckets; Wallabys overdue | Unblock the 3 ASAP tasks today',
    '23T097 (PCY, White/Navy) | Glass Shop | 42% | 2 days behind | Poly Teak, Poly Premium, New Wire overdue | Expedite parts, start Front Line',
    '36011 (Landshark, Whisper Gray) | Glass Shop | 15% | 36 days behind | 5 molds stuck; 10 parts not ordered | Clear molds, order long-lead parts',
    '23T099 (Scituate, Ice Blue) | Pre-Production | 25% | 118 days ahead | Early build, no urgency | Continue lamination',
    'Overall: Two boats need urgent unblocking — 25T049 (ASAP flags) and 36011 (molds + unordered parts). 25T043 is delivery-ready in final QC. Priority: order motors for 36011, 28226, 28227.',
  ].join('\n'),
};

function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtWhen(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? fmtTime(s) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Split the briefing into per-boat cards + an overall summary. Boat lines are
// pipe-delimited; anything without pipes is treated as the summary.
function parseBriefing(text) {
  const boats = [];
  let overall = '';
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes('|')) {
      const [label, stage, pct, sched, issues, next] = line.split('|').map(s => s.trim());
      boats.push({ label, stage, pct, sched, issues, next });
    } else {
      overall += (overall ? ' ' : '') + line.replace(/^overall:\s*/i, '');
    }
  }
  return { boats, overall };
}

const schedDir = (s = '') => /behind|late|overdue/i.test(s) ? 'behind' : /ahead/i.test(s) ? 'ahead' : 'ontrack';
const schedShort = (s = '') => s.replace(/(\d+)\s*days?/i, '$1d');
const pctNum = (s = '') => { const n = parseInt(s, 10); return isNaN(n) ? null : Math.max(0, Math.min(100, n)); };

function BoatCard({ b }) {
  const dir = schedDir(b.sched);
  const p = pctNum(b.pct);
  const issues = (b.issues || '').split(/;\s*/).map(s => s.trim()).filter(x => x && x !== '—');
  return (
    <div className="kio-bc">
      <div className="kio-bc-top">
        <span className="kio-bc-label">{b.label}</span>
        {b.sched && <span className={`kio-bc-sched ${dir}`}>{schedShort(b.sched)}</span>}
      </div>
      <div className="kio-bc-stagerow">
        <span className="kio-bc-stage">{b.stage}</span>
        {p != null && <span className="kio-bc-pct">{p}%</span>}
      </div>
      {p != null && <div className="kio-bc-bar"><i style={{ width: `${p}%` }} /></div>}
      {issues.length > 0 && (
        <div className="kio-bc-issues">
          {issues.map((it, i) => <span key={i} className="kio-bc-chip">{it}</span>)}
        </div>
      )}
      {b.next && <div className="kio-bc-next"><span>Next</span> {b.next}</div>}
    </div>
  );
}

export function BriefingScreen({ announcements = [], briefing }) {
  const notes = announcements || [];
  const { boats, overall } = parseBriefing(briefing?.text);
  const genWhen = briefing?.generated_at ? fmtTime(briefing.generated_at) : null;
  return (
    <div className={`kio-brief ${notes.length ? '' : 'nonotices'}`}>
      {notes.length > 0 && (
        <section className="kio-brief-col kio-brief-notices">
          <h3 className="kio-brief-h"><span className="kio-brief-hi">📣</span> Today’s notices</h3>
          <div className="kio-brief-cards">
            {notes.map(a => (
              <article key={a.id} className="kio-brief-card">
                {a.image_url && <img className="kio-brief-img" src={a.image_url} alt="" />}
                <div className="kio-brief-cbody">
                  <div className="kio-brief-text">{a.body}</div>
                  <div className="kio-brief-meta">{a.author_name || 'Shop'}{a.created_at ? ` · ${fmtWhen(a.created_at)}` : ''}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="kio-brief-col kio-brief-ai">
        <h3 className="kio-brief-h">
          <span className="kio-brief-hi">🤖</span> Production briefing
          {genWhen && <span className="kio-brief-when">as of {genWhen}</span>}
        </h3>
        {boats.length ? (
          <>
            <div className="kio-bc-grid">
              {boats.map((b, i) => <BoatCard key={i} b={b} />)}
            </div>
            {overall && <div className="kio-bc-overall"><span>Overall</span> {overall}</div>}
          </>
        ) : (
          <div className="kio-brief-empty">The daily briefing is generated each morning.</div>
        )}
      </section>
    </div>
  );
}
