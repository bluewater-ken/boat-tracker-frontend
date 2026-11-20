// Stand-in for /api/calendar/* until the server side exists (BACKEND_CALENDAR_BRIEF.md).
// OfficeCalendar switches to this only when the real route answers 404, so the tab can be
// tried out before the backend ships. Sample people, absences placed around today, and
// nothing is saved anywhere — a refresh puts it all back.
import { addDays, todayStr } from './calendarDates';

const SAMPLE_PEOPLE = [
  ['Robin P.', 'Office'], ['Dana M.', 'Office'], ['Luis A.', 'Glass Shop'], ['Marcus T.', 'Glass Shop'],
  ['Andre W.', 'Glass Shop'], ['Chris D.', 'Back Line'], ['Tony V.', 'Back Line'], ['Sam K.', 'Front Line'],
  ['Javier R.', 'Front Line'], ['Pete L.', 'Finishing'], ['Nick B.', 'Rigging'],
];
// [person index, first day, last day (offsets from this week's Monday), type, part]
const SAMPLE_ABSENCES = [
  [9, 0, 1, 'vacation'], [4, 0, 0, 'personal'], [3, 3, 3, 'personal'], [1, 4, 4, 'appointment', 'pm'],
  [2, 7, 11, 'vacation'], [4, 8, 9, 'vacation'], [5, 9, 15, 'vacation'], [7, 10, 11, 'personal'],
  [8, 14, 14, 'appointment', 'am'], [10, 17, 18, 'vacation'], [0, 18, 18, 'vacation'], [3, 21, 25, 'vacation'],
  [6, 25, 25, 'personal'],
];

const today = todayStr();
const monday = addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
let people = SAMPLE_PEOPLE.map(([name, department], i) => ({ id: i + 1, name, department, active: true }));
let events = SAMPLE_ABSENCES.map(([p, s, e, type, part], i) => ({
  id: i + 1, kind: 'absence', person_id: p + 1, start_date: addDays(monday, s), end_date: addDays(monday, e),
  type, part: part || 'full', note: '',
}));
let nextId = 100;

const joined = (ev) => {
  const p = people.find(x => x.id === ev.person_id);
  return { ...ev, person_name: p?.name || '', department: p?.department || '' };
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function previewFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const [, what, idStr] = path.split('?')[0].match(/^\/api\/calendar\/(people|events)(?:\/(\d+))?$/) || [];
  const id = idStr ? Number(idStr) : null;
  if (what === 'people') {
    if (method === 'GET') return json(people);
    if (method === 'POST') { const p = { id: nextId++, active: true, ...body }; people = [...people, p]; return json(p); }
    if (method === 'PUT') { people = people.map(p => p.id === id ? { ...p, ...body } : p); return json(people.find(p => p.id === id)); }
  }
  if (what === 'events') {
    if (method === 'GET') return json(events.map(joined));
    if (method === 'POST') { const ev = { id: nextId++, kind: 'absence', ...body }; events = [...events, ev]; return json(joined(ev)); }
    if (method === 'PUT') { events = events.map(e => e.id === id ? { ...e, ...body } : e); return json(joined(events.find(e => e.id === id))); }
    if (method === 'DELETE') { events = events.filter(e => e.id !== id); return json({ ok: true }); }
  }
  return json({ error: 'Not found' }, 404);
}
