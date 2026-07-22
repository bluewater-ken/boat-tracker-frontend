// Per-user, per-tab permissions: 'hidden' | 'view' | 'edit'.
// Stored as user.permissions = { schedule:'edit', parts:'view', ... } on the user
// record (see BACKEND_PERMISSIONS_BRIEF). Until that ships, users have no
// permissions map and we fall back to the legacy role behavior, so nothing changes.

import { hasFullAccess } from './access';

export const PERM_TABS = [
  { key: 'schedule', label: 'Production Schedule' },
  { key: 'parts', label: 'Key Parts' },
  { key: 'lamination', label: 'Lamination' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'assembly', label: 'Assembly (read-only)' },
  { key: 'feed', label: 'Shop Feed' },
  { key: 'gantt', label: 'Timeline' },
];
export const PERM_KEYS = new Set(PERM_TABS.map(t => t.key));
export const PERM_LEVELS = ['hidden', 'view', 'edit'];

// Legacy fallback that reproduces today's behavior when no permissions are set:
// Ops edits everything; Shop works the boards it always has and views the rest.
const LEGACY_SHOP = { schedule: 'edit', lamination: 'edit', finishing: 'edit', parts: 'view', assembly: 'view', feed: 'view' };

export function permOf(user, tab) {
  const p = user?.permissions?.[tab];
  if (p) return p;
  // Timeline: everyone can see it read-only by default; only the owner allowlist
  // (Ken + Kelly) can edit (drag/pin/hold/slots). Ken can override per user on the
  // Users screen — grant Edit, or set Hidden to take the tab away entirely.
  if (tab === 'gantt') return hasFullAccess(user) ? 'edit' : 'view';
  if (user?.role === 'ops') return 'edit';
  return LEGACY_SHOP[tab] || 'view';
}
export const canEdit = (user, tab) => permOf(user, tab) === 'edit';
export const canView = (user, tab) => permOf(user, tab) !== 'hidden';
