import { useState, useEffect, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import listPlugin from '@fullcalendar/react/list';
import interactionPlugin from '@fullcalendar/react/interaction';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import useIsMobile from './useIsMobile';
import { addDays, todayStr, parseDay, fmtDay } from './calendarDates';
import './OfficeCalendar.css';

// Office calendar. First job: planned employee absences. Ops enter and edit; everyone else
// looks. The server strips `type` and `note` for non-Ops (BACKEND_CALENDAR_BRIEF.md), so a
// shop login only ever learns who is out and when — that rule is not enforced here.
// Every entry carries a `kind` ('absence' today) so shop appointments can join later
// without a new table or a new screen.

const TYPES = [
  { key: 'vacation', label: 'Vacation', color: '#2E92D6' },
  { key: 'personal', label: 'Personal', color: '#6B5B95' },
  { key: 'appointment', label: 'Appointment', color: '#B97A0C' },
];
const OUT_COLOR = '#173A5E'; // what a login without the type sees
const PARTS = [{ key: 'full', label: 'Full day' }, { key: 'am', label: 'Morning' }, { key: 'pm', label: 'Afternoon' }];
const DEPT_HINTS = ['Office', 'Glass Shop', 'Back Line', 'Front Line', 'Finishing', 'Rigging'];
const typeOf = (key) => TYPES.find(t => t.key === key);
const partTag = (part) => (part === 'am' ? ' · AM' : part === 'pm' ? ' · PM' : '');
const span = (a) => (a.start_date === a.end_date ? `${fmtDay(a.start_date)}${partTag(a.part)}` : `${fmtDay(a.start_date)} – ${fmtDay(a.end_date)}`);
const overlaps = (a, from, to) => a.start_date <= to && a.end_date >= from;

function OfficeCalendar() {
  const { user } = useAuth();
  const isOps = user?.role === 'ops';
  const isMobile = useIsMobile();
  const api = useRef(apiFetch);
  const [preview, setPreview] = useState(false); // server side not installed → sample data
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [range, setRange] = useState(null); // { from, to } currently loaded
  const [dept, setDept] = useState('');
  const [form, setForm] = useState(null); // the absence being added or edited
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const today = todayStr();
  const monday = addDays(today, -((parseDay(today).getDay() + 6) % 7));

  // People first. A 404 here means the backend brief hasn't been run yet: fall back to the
  // sample store so the tab can still be tried. Any other failure is a real error.
  useEffect(() => {
    (async () => {
      try {
        let r = await apiFetch('/api/calendar/people');
        if (r.status === 404) {
          const m = await import('./calendarPreview');
          api.current = m.previewFetch;
          setPreview(true);
          r = await m.previewFetch('/api/calendar/people');
        }
        if (!r.ok) throw new Error();
        setPeople(await r.json());
      } catch { setError('Could not load the calendar. Check the connection and try again.'); }
      finally { setReady(true); }
    })();
  }, []);

  // Events for the visible dates, always widened to cover last week through three weeks
  // out so "Out today / this week / next week" stay right whatever month is on screen.
  useEffect(() => {
    if (!ready || error || !range) return;
    let stale = false;
    (async () => {
      try {
        const r = await api.current(`/api/calendar/events?from=${range.from}&to=${range.to}`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        // The server already leaves these out for non-Ops; the sample store can't know the role.
        const rows = (Array.isArray(d) ? d : []).map(a => (isOps ? a : { ...a, type: undefined, note: undefined }));
        if (!stale) setEvents(rows);
      } catch { if (!stale) setError('Could not load the calendar. Check the connection and try again.'); }
    })();
    return () => { stale = true; };
  }, [ready, error, range, isOps]);

  const onDatesSet = (info) => {
    const from = [info.startStr.slice(0, 10), addDays(today, -7)].sort()[0];
    const to = [addDays(info.endStr.slice(0, 10), -1), addDays(today, 21)].sort()[1];
    setRange(r => (r && r.from === from && r.to === to ? r : { from, to }));
  };

  const departments = useMemo(() => [...new Set(people.map(p => p.department).filter(Boolean))].sort(), [people]);
  const shown = useMemo(() => events.filter(a => !dept || a.department === dept), [events, dept]);
  const byStart = (a, b) => a.start_date.localeCompare(b.start_date) || a.person_name.localeCompare(b.person_name);
  const outToday = shown.filter(a => overlaps(a, today, today)).sort(byStart);
  const thisWeek = shown.filter(a => overlaps(a, monday, addDays(monday, 6))).sort(byStart);
  const nextWeek = shown.filter(a => overlaps(a, addDays(monday, 7), addDays(monday, 13))).sort(byStart);

  // FullCalendar's all-day `end` is exclusive; ours is the last day out.
  const fcEvents = useMemo(() => shown.map(a => ({
    id: String(a.id),
    title: `${a.person_name}${partTag(a.part)}`,
    start: a.start_date,
    end: addDays(a.end_date, 1),
    allDay: true,
    color: typeOf(a.type)?.color || OUT_COLOR,
    extendedProps: { raw: a },
  })), [shown]);

  const openNew = (start = today, end = start) => {
    if (!isOps) return;
    setFormError('');
    setForm({ person_id: '', start_date: start, end_date: end, type: 'vacation', part: 'full', note: '' });
  };
  const openEdit = (a) => {
    if (!isOps) return;
    setFormError('');
    setForm({ id: a.id, person_id: a.person_id, start_date: a.start_date, end_date: a.end_date, type: a.type || 'vacation', part: a.part || 'full', note: a.note || '' });
  };

  // What the server would hand back, for the demo account (its writes are faked) and for
  // showing a change before the round trip finishes.
  const localRow = (id, body) => {
    const p = people.find(x => x.id === Number(body.person_id));
    return { kind: 'absence', ...body, id, person_name: p?.name || '', department: p?.department || '' };
  };
  const upsert = (row) => setEvents(list => (list.some(e => e.id === row.id) ? list.map(e => (e.id === row.id ? row : e)) : [...list, row]));

  const save = async () => {
    if (!form.person_id) return setFormError('Pick who is out.');
    if (!form.start_date || !form.end_date) return setFormError('Both dates are needed.');
    if (form.end_date < form.start_date) return setFormError('The last day out is before the first.');
    const body = {
      kind: 'absence', person_id: Number(form.person_id), start_date: form.start_date, end_date: form.end_date,
      type: form.type, part: form.start_date === form.end_date ? form.part : 'full', note: form.note.trim(),
    };
    setSaving(true);
    try {
      const r = await api.current(form.id ? `/api/calendar/events/${form.id}` : '/api/calendar/events', {
        method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      const d = await r.json().catch(() => ({}));
      upsert(d && d.id ? d : localRow(form.id || `tmp-${Date.now()}`, body));
      setForm(null);
    } catch { setFormError('Could not save. Try again.'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    const a = events.find(e => e.id === form.id);
    if (!window.confirm(`Remove ${a?.person_name || 'this'} absence (${a ? span(a) : ''})?`)) return;
    setSaving(true);
    try {
      const r = await api.current(`/api/calendar/events/${form.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setEvents(list => list.filter(e => e.id !== form.id));
      setForm(null);
    } catch { setFormError('Could not remove it. Try again.'); }
    finally { setSaving(false); }
  };

  // Dragging or stretching a bar on the grid. Puts the bar back if the save fails.
  const onMove = async (info) => {
    const a = info.event.extendedProps.raw;
    const start_date = info.event.startStr.slice(0, 10);
    const end_date = info.event.endStr ? addDays(info.event.endStr.slice(0, 10), -1) : start_date;
    const body = { kind: 'absence', person_id: a.person_id, start_date, end_date, type: a.type, part: start_date === end_date ? a.part : 'full', note: a.note || '' };
    upsert({ ...a, ...body });
    try {
      const r = await api.current(`/api/calendar/events/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
    } catch { upsert(a); info.revert(); alert('Could not move it. The calendar was put back.'); }
  };

  if (!ready) return <div className="loading">Loading calendar…</div>;
  if (error) return <div className="cal"><div className="cal-error">{error}</div></div>;
  // Sample people are for the office to try the screen out. Nobody else should ever see
  // made-up absences, so a non-Ops login gets a plain note until the server side is live.
  if (preview && !isOps) return <div className="cal"><div className="cal-preview">The calendar isn’t switched on yet.</div></div>;

  const active = people.filter(p => p.active !== false);
  const oneDay = form && form.start_date === form.end_date;
  const sideList = (title, list) => (
    <div className="cal-side-block">
      <h4>{title}</h4>
      {list.length === 0 && <div className="cal-side-none">Nobody out</div>}
      {list.map(a => (
        <button key={a.id} className="cal-side-row" onClick={() => openEdit(a)} disabled={!isOps}>
          <span className="cal-dot" style={{ background: typeOf(a.type)?.color || OUT_COLOR }} />
          <b>{a.person_name}</b>
          <span>{span(a)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="cal">
      {preview && (
        <div className="cal-preview">
          Preview only. The server side of the calendar isn’t installed yet, so these are sample people and nothing you enter is saved.
        </div>
      )}

      <div className="cal-bar">
        <div className={`cal-today ${outToday.length ? 'some' : ''}`}>
          {outToday.length
            ? <>Out today: <b>{outToday.map(a => `${a.person_name}${partTag(a.part)}`).join(', ')}</b></>
            : 'Nobody is out today'}
        </div>
        <select className="cal-dept" value={dept} onChange={e => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {isOps && <button className="cal-btn" onClick={() => setPeopleOpen(true)}>People</button>}
        {isOps && <button className="cal-btn primary" onClick={() => openNew()}>+ Add absence</button>}
      </div>

      <div className="cal-split">
        <div className="cal-main">
          <FullCalendar
            plugins={[classicThemePlugin, dayGridPlugin, listPlugin, interactionPlugin]}
            initialView={isMobile ? 'listMonth' : 'dayGridMonth'}
            headerToolbar={isMobile
              ? { left: 'prev,next', center: 'title', right: 'listMonth,dayGridMonth' }
              : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,listMonth' }}
            buttons={{ dayGridMonth: { text: 'Month' }, dayGridWeek: { text: 'Week' }, listMonth: { text: 'List' }, today: { text: 'Today' } }}
            height="auto"
            fixedWeekCount={false}
            dayMaxEvents={5}
            events={fcEvents}
            datesSet={onDatesSet}
            editable={isOps}
            selectable={isOps}
            select={(info) => openNew(info.startStr.slice(0, 10), addDays(info.endStr.slice(0, 10), -1))}
            eventClick={(info) => openEdit(info.event.extendedProps.raw)}
            eventDrop={onMove}
            eventResize={onMove}
          />
          {isOps && (
            <div className="cal-legend">
              {TYPES.map(t => <span key={t.key}><i style={{ background: t.color }} />{t.label}</span>)}
            </div>
          )}
        </div>
        <aside className="cal-side">
          {sideList('Out this week', thisWeek)}
          {sideList('Next week', nextWeek)}
        </aside>
      </div>

      {form && (
        <div className="cal-modal" onClick={() => !saving && setForm(null)}>
          <div className="cal-card" onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Edit absence' : 'Add absence'}</h3>
            {formError && <div className="cal-formerror">{formError}</div>}
            <label className="cal-fld"><span>Employee</span>
              <select value={form.person_id} onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))}>
                <option value="">Choose…</option>
                {people.filter(p => p.active !== false || p.id === Number(form.person_id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.department ? ` · ${p.department}` : ''}</option>
                ))}
              </select>
            </label>
            {active.length === 0 && <div className="cal-hint">No employees yet. Close this and add them under People.</div>}
            <div className="cal-two">
              <label className="cal-fld"><span>First day out</span>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date }))} />
              </label>
              <label className="cal-fld"><span>Last day out</span>
                <input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </label>
            </div>
            <div className="cal-fld"><span>Type</span>
              <div className="cal-chips">
                {TYPES.map(t => (
                  <button key={t.key} type="button" className={form.type === t.key ? 'on' : ''} style={form.type === t.key ? { background: t.color, borderColor: t.color } : undefined}
                    onClick={() => setForm(f => ({ ...f, type: t.key }))}>{t.label}</button>
                ))}
              </div>
            </div>
            {oneDay && (
              <div className="cal-fld"><span>Part of the day</span>
                <div className="cal-chips">
                  {PARTS.map(p => (
                    <button key={p.key} type="button" className={form.part === p.key ? 'on' : ''} onClick={() => setForm(f => ({ ...f, part: p.key }))}>{p.label}</button>
                  ))}
                </div>
              </div>
            )}
            <label className="cal-fld"><span>Note (office only)</span>
              <input value={form.note} maxLength={200} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </label>
            <div className="cal-actions">
              {form.id && <button className="cal-btn danger" onClick={remove} disabled={saving}>Remove</button>}
              <button className="cal-btn" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button className="cal-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {peopleOpen && <PeopleManager people={people} setPeople={setPeople} api={api} onClose={() => setPeopleOpen(false)} />}
    </div>
  );
}

// The employee list the calendar draws from. Separate from BOSS logins on purpose: several
// logins are shared, and most of the shop never signs in. People are switched off rather
// than deleted so their past absences keep a name.
function PeopleManager({ people, setPeople, api, onClose }) {
  const EMPTY = { id: null, name: '', department: '' };
  const [edit, setEdit] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hints = [...new Set([...DEPT_HINTS, ...people.map(p => p.department).filter(Boolean)])];

  const send = async (id, body) => {
    setBusy(true); setErr('');
    try {
      const r = await api.current(id ? `/api/calendar/people/${id}` : '/api/calendar/people', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      const d = await r.json().catch(() => ({}));
      const row = d && d.id ? d : { id: id || `tmp-${Date.now()}`, active: true, ...people.find(p => p.id === id), ...body };
      setPeople(list => (list.some(p => p.id === row.id) ? list.map(p => (p.id === row.id ? row : p)) : [...list, row]));
      setEdit(EMPTY);
    } catch { setErr('Could not save. Try again.'); }
    finally { setBusy(false); }
  };
  const submit = (e) => {
    e.preventDefault();
    const name = edit.name.trim(), department = edit.department.trim();
    if (!name) return setErr('A name is needed.');
    send(edit.id, { name, department });
  };
  const sorted = [...people].sort((a, b) => (a.active === false) - (b.active === false) || (a.department || '').localeCompare(b.department || '') || a.name.localeCompare(b.name));

  return (
    <div className="cal-modal" onClick={onClose}>
      <div className="cal-card wide" onClick={e => e.stopPropagation()}>
        <h3>People on the calendar</h3>
        {err && <div className="cal-formerror">{err}</div>}
        <form className="cal-people-form" onSubmit={submit}>
          <input placeholder="Name" value={edit.name} onChange={e => setEdit(v => ({ ...v, name: e.target.value }))} aria-label="Name" />
          <input placeholder="Department" list="cal-depts" value={edit.department} onChange={e => setEdit(v => ({ ...v, department: e.target.value }))} aria-label="Department" />
          <datalist id="cal-depts">{hints.map(h => <option key={h} value={h} />)}</datalist>
          <button className="cal-btn primary" disabled={busy}>{edit.id ? 'Save' : 'Add'}</button>
          {edit.id && <button type="button" className="cal-btn" onClick={() => setEdit(EMPTY)}>Cancel</button>}
        </form>
        <div className="cal-people">
          {sorted.length === 0 && <div className="cal-side-none">Nobody yet. Add the first person above.</div>}
          {sorted.map(p => (
            <div key={p.id} className={`cal-person ${p.active === false ? 'off' : ''}`}>
              <b>{p.name}</b>
              <span>{p.department || '—'}</span>
              <button className="cal-link" onClick={() => setEdit({ id: p.id, name: p.name, department: p.department || '' })}>Edit</button>
              <button className="cal-link" disabled={busy} onClick={() => send(p.id, { name: p.name, department: p.department || '', active: p.active === false })}>
                {p.active === false ? 'Put back' : 'Take off'}
              </button>
            </div>
          ))}
        </div>
        <div className="cal-actions"><button className="cal-btn" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

export default OfficeCalendar;
