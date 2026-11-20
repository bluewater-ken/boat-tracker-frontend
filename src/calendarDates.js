// Calendar days travel as plain 'YYYY-MM-DD' strings end to end — never as Date objects
// through JSON — so an absence on the 12th can't slide to the 11th across a timezone.
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Noon keeps the arithmetic clear of daylight-saving edges.
export const parseDay = (s) => new Date(`${s}T12:00:00`);
export const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); };
export const todayStr = () => ymd(new Date());
export const fmtDay = (s) => parseDay(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
