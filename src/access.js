// Accounts with full "owner-level" access — the Timeline (Gantt) tab and the
// Payments tracker. Kept as an explicit allowlist rather than a role, because
// ryan/jacob/demo also carry the `ops` role and must NOT see financials.
// NOTE: the Payments API is independently gated on the SERVER to this same list;
// keep the two in sync (BACKEND_PAYMENTS_BRIEF / _ALLOWLIST).
export const FULL_ACCESS_USERS = ['ken', 'kelly'];

export const hasFullAccess = (user) =>
  FULL_ACCESS_USERS.includes((user?.username || '').toLowerCase());

// Mold Planner (Project 27 glass shop planner). Its own list on purpose: ryan and jacob
// get this tab WITHOUT joining FULL_ACCESS_USERS, so Payments and Timeline editing stay
// exactly as they were.
export const MOLD_PLANNER_USERS = [...FULL_ACCESS_USERS, 'ryan', 'jacob'];

export const canSeeMoldPlanner = (user) =>
  MOLD_PLANNER_USERS.includes((user?.username || '').toLowerCase());
