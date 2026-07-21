// Accounts with full "owner-level" access — the Timeline (Gantt) tab and the
// Payments tracker. Kept as an explicit allowlist rather than a role, because
// ryan/jacob/demo also carry the `ops` role and must NOT see financials.
// NOTE: the Payments API is independently gated on the SERVER to this same list;
// keep the two in sync (BACKEND_PAYMENTS_BRIEF / _ALLOWLIST).
export const FULL_ACCESS_USERS = ['ken', 'kelly'];

export const hasFullAccess = (user) =>
  FULL_ACCESS_USERS.includes((user?.username || '').toLowerCase());
