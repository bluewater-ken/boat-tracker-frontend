// Kiosk "Today at Bluewater" screen — the shop notices you post plus the AI
// daily production briefing. Notices come from /api/announcements, the briefing
// from /api/daily-briefing (generated once each morning, refreshable in the app).
//
// The briefing text is one pipe-delimited line per DEPARTMENT so it reads as a
// clean status board, not prose:
//   DEPARTMENT | count | boats | headline note
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
    'Glass Shop | 3 | 36011, 23T097, 28226 | molds bottlenecked, parts pending',
    'Back Line | 1 | 25T049 | 3 ASAP flags — Console, Hatches, Buckets',
    'Front Line | 2 | 28225 (ahead), 25T048 (hatches ASAP) | ',
    'QC | 1 | 25T043 | final checks, ready to sign off',
    'Pre-Prod | 4 | 28227, 23T099, 25T051, 25T052 | early builds, order long-lead parts',
    'Overall: 25T049 and 36011 need urgent unblocking; 25T043 is ready to deliver. Priority: order motors for 36011, 28226, 28227.',
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

// Split the briefing into one row per department + an overall summary. Department
// lines are pipe-delimited; anything without pipes is treated as the summary.
function parseBriefing(text) {
  const depts = [];
  let overall = '';
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes('|')) {
      const [name, count, boats, note] = line.split('|').map(s => s.trim());
      depts.push({ name, count, boats, note });
    } else {
      overall += (overall ? ' ' : '') + line.replace(/^overall:\s*/i, '');
    }
  }
  return { depts, overall };
}

export function BriefingScreen({ announcements = [], briefing }) {
  const notes = announcements || [];
  const { depts, overall } = parseBriefing(briefing?.text);
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
        {depts.length ? (
          <>
            <div className="kio-depts">
              {depts.map((d, i) => (
                <div key={i} className="kio-dept">
                  <div className="kio-dept-tag">
                    <span className="kio-dept-name">{d.name}</span>
                    {d.count && <span className="kio-dept-count">{d.count}</span>}
                  </div>
                  <div className="kio-dept-info">
                    <span className="kio-dept-boats">{d.boats}</span>
                    {d.note && <span className="kio-dept-note"> — {d.note}</span>}
                  </div>
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
