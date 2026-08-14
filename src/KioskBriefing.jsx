// Kiosk "Today at Bluewater" screen — the shop notices you post plus the AI
// daily production briefing. Notices come from /api/announcements, the briefing
// from /api/daily-briefing (generated once each morning, refreshable in the app).

export const DEMO_ANNOUNCEMENTS = [
  { id: 1, body: 'Team lunch today at noon — tacos in the break room. On the house!', author_name: 'Ken', created_at: '2026-08-14T08:10:00', image_url: null },
  { id: 2, body: 'Customer visit 2:00 PM — the Landshark owner is touring the floor. Let’s make her shine.', author_name: 'Ryan', created_at: '2026-08-14T07:30:00', image_url: null },
  { id: 3, body: 'Safety stand-up Friday 7:30 AM sharp. All hands in the paint bay.', author_name: 'Ken', created_at: '2026-08-13T16:00:00', image_url: null },
];

export const DEMO_BRIEFING = {
  generated_at: '2026-08-14T06:05:00',
  text: [
    '36011 (Landshark, Whisper Gray) — Back Line. Hull rework wrapped; motors still not ordered.',
    '25T048 (Stanyek, Dark Blue) — Finishing. Hatches need to move today to hold the date.',
    '28226 (PCY, Medium Gray) — Glass shop. Hull on the mold, hatches in progress.',
    '23T097 (Coastal, Sea Foam) — Glass shop. On track, no open issues.',
    'Overall: three boats need parts attention; the floor is otherwise tracking to schedule.',
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

// Split the AI briefing into per-boat lines, separating the boat label
// ("36011 (Landshark, Whisper Gray)") from its note. A line with no boat label
// (e.g. the overall-shop summary) renders as a plain summary line.
function parseBriefing(text) {
  return (text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const clean = line.replace(/^[-•*]\s*/, '');
    const m = clean.match(/^(.*?)(\s+—\s+|:\s+)(.*)$/);
    if (m && /\(/.test(m[1])) return { label: m[1].trim(), note: m[3].trim() };
    return { label: null, note: clean };
  });
}

export function BriefingScreen({ announcements = [], briefing }) {
  const notes = announcements || [];
  const lines = parseBriefing(briefing?.text);
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
        <div className="kio-brief-lines">
          {lines.length ? lines.map((l, i) => (
            <div key={i} className={`kio-brief-line ${l.label ? '' : 'summary'}`}>
              {l.label && <span className="kio-brief-boat">{l.label}</span>}
              <span className="kio-brief-note">{l.note}</span>
            </div>
          )) : <div className="kio-brief-empty">The daily briefing is generated each morning.</div>}
        </div>
      </section>
    </div>
  );
}
