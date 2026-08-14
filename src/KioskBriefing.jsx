// Kiosk "Today at Bluewater" screen — the shop notices you post plus the AI
// daily production briefing. Notices come from /api/announcements, the briefing
// from /api/daily-briefing (generated once each morning, refreshable in the app).
//
// The briefing text is one pipe-delimited line per BOAT, tagged with its
// department, so the wall can group it — department headers with a line per boat:
//   DEPARTMENT | HULL (Name, Color) | schedule | note
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
    'Glass Shop | 36011 (Landshark, Whisper Gray) | 36d behind | molds stuck, 10 parts unordered',
    'Glass Shop | 23T097 (PCY, White/Navy) | 2d behind | poly parts + new wire overdue',
    'Glass Shop | 28226 (PCY, Medium Gray) | 10d behind | motors not ordered, T-Top mold busy',
    'Back Line | 25T049 (PCY, Pigeon Blue) | 13d behind | 3 ASAP flags: Console, Hatches, Buckets',
    'Front Line | 28225 (Trey, White) | 4d ahead | on track, next is QC',
    'Front Line | 25T048 (Stanyek, Dark Blue) | 12d behind | hatches ASAP, bow shield pending',
    'QC | 25T043 (Svoboda, White) | 37d behind | final checks, ready to sign off',
    'Pre-Prod | 28227 (7Sports, White) | 10d behind | order motors, expedite parts',
    'Pre-Prod | 23T099 (Scituate, Ice Blue) | 118d ahead | early build, no urgency',
    'Pre-Prod | 25T051 (Scituate, White) | no target | early lamination, order parts',
    'Pre-Prod | 25T052 (Shlomi, White) | early | glass kit complete',
    'Overall: 25T049 and 36011 need urgent unblocking; 25T043 is ready to deliver. Priority: order motors for 36011, 28226, 28227.',
  ].join('\n'),
};

const DEPT_ORDER = ['Glass Shop', 'Back Line', 'Front Line', 'QC', 'Pre-Prod'];
const schedDir = (s = '') => /behind|late|overdue/i.test(s) ? 'behind' : /ahead/i.test(s) ? 'ahead' : 'ontrack';

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

// Group the briefing's per-boat lines by department (canonical order first, then
// any extras). A line without pipes becomes the overall summary.
function parseBriefing(text) {
  const byDept = {};
  let overall = '';
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes('|')) {
      const [dept, label, sched, note] = line.split('|').map(s => s.trim());
      (byDept[dept] ||= []).push({ label, sched, note });
    } else {
      overall += (overall ? ' ' : '') + line.replace(/^overall:\s*/i, '');
    }
  }
  const groups = [];
  for (const d of DEPT_ORDER) if (byDept[d]) { groups.push([d, byDept[d]]); delete byDept[d]; }
  for (const d of Object.keys(byDept)) groups.push([d, byDept[d]]);
  return { groups, overall };
}

export function BriefingScreen({ announcements = [], briefing }) {
  const notes = announcements || [];
  const { groups, overall } = parseBriefing(briefing?.text);
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
        {groups.length ? (
          <>
            <div className="kio-depts">
              {groups.map(([dept, boats]) => (
                <div key={dept} className="kio-dg">
                  <div className="kio-dg-h">
                    <span className="kio-dg-name">{dept}</span>
                    <span className="kio-dg-count">{boats.length}</span>
                  </div>
                  {boats.map((b, i) => (
                    <div key={i} className="kio-bl">
                      <span className="kio-bl-label">{b.label}</span>
                      {b.sched && <><span className="kio-bl-sep"> — </span><span className={`kio-bl-sched ${schedDir(b.sched)}`}>{b.sched}</span></>}
                      {b.note && <span className="kio-bl-note"> · {b.note}</span>}
                    </div>
                  ))}
                </div>
              ))}
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
