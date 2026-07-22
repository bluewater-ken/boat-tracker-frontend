# Backend brief: per-user, per-tab permissions

Decided with Ken 2026-07-22. Each user gets a per-tab permission: `hidden | view | edit`,
set on the Users screen (Admin → Users, Ops-only). Frontend is built and feature-detects
this — until it ships, users have no `permissions` and everything falls back to today's
role behavior, so nothing changes.

Tabs (keys): `schedule, parts, lamination, finishing, assembly, feed`.
(assembly is read-only source data — it has no write routes, so its level only affects
visibility.)

## Phase 1 — storage (small; unlocks the whole feature)
1. `ALTER TABLE users ADD COLUMN permissions JSONB NOT NULL DEFAULT '{}';`
   Shape: `{ "schedule": "edit", "parts": "view", "feed": "hidden", ... }`. Missing keys
   mean "use the role default" — do NOT need to store every tab.
2. **Return `permissions` on the user object** everywhere the frontend reads a user:
   - `GET /api/users` (the list — so the Users screen can edit them)
   - `GET /api/auth/me` and the login response (so the logged-in user's own permissions
     drive their UI). **This one is essential** — without it the acting user's gating
     can't work.
3. **Accept `permissions`** in `POST /api/users` and `PUT /api/users/:id`. Validate: an
   object whose values are one of `hidden|view|edit`; ignore/reject unknown tab keys and
   bad values (400). Absent = leave unchanged on PUT.

That alone makes the frontend fully functional (it hides tabs and disables edit UI).

## Phase 2 — ENFORCEMENT (the security part; do this too)
Frontend gating is not security. Enforce on every write route by mapping the route to a
tab and requiring the acting user's level to be `edit`:

| Route prefix | Tab |
|---|---|
| `PUT /api/schedule/*`, boat reorder, boat create/delete | schedule |
| `*/api/parts/*` (status, flags, custom names, specs) | parts |
| `PUT /api/lamination/*` | lamination |
| `PUT /api/finishing/*` | finishing |
| `POST/PUT /api/issues*` (post / resolve) | feed |

Helper (mirror the frontend's `permOf` fallback exactly so behavior matches):
```js
const LEGACY_SHOP = { schedule:'edit', lamination:'edit', finishing:'edit', parts:'view', assembly:'view', feed:'view' };
function levelFor(user, tab) {
  const p = user.permissions && user.permissions[tab];
  if (p) return p;
  return user.role === 'ops' ? 'edit' : (LEGACY_SHOP[tab] || 'view');
}
function requireEdit(tab) {
  return (req, res, next) => (levelFor(req.user, tab) === 'edit' ? next() : res.status(403).json({ error: 'No edit permission for ' + tab }));
}
```
Apply `requireEdit('<tab>')` to the write routes above. GET/read routes stay open (view is
read). Keep the fallback table IDENTICAL to src/permissions.js so a user with no explicit
permissions behaves the same on both sides.

## Phase 1b — lock user management to the owner allowlist (Ken + Kelly)
Since permissions ARE access, only owners may manage users — otherwise an Ops user could
grant themselves edit everywhere. Gate the user routes to the same allowlist as Payments
(`ken`, `kelly`), NOT just role `ops`:
- `GET/POST/PUT/DELETE /api/users` → require `username ∈ {ken, kelly}` (else 403).
The frontend already hides the Users screen from non-owners (Admin → Users shows only for
Ken/Kelly); this makes it real on the server.

## Verify
- Set a test user schedule=view, parts=edit: they can PUT a part but a schedule PUT → 403.
- Set a tab hidden: GET still works (frontend just hides it), writes 403.
- A user with empty permissions behaves exactly like today (ops edits all; shop edits
  lamination/finishing/schedule, views parts/feed).
- `GET /api/auth/me` returns `permissions`.

## Frontend already built (this commit)
`src/permissions.js` (permOf/canEdit/canView + the same LEGACY_SHOP fallback), the Users
screen per-tab grid (Hidden/View/Edit), tab hiding in App.jsx, and every board's edit UI +
status-advance gated on `canEdit`. It sends `permissions` in the user POST/PUT now; it just
won't persist or drive `/auth/me` until Phase 1 lands.

## Known limitation (told to Ken)
The model is two-level (view/edit); it can't express the old "Shop can advance status but
not manage boats" middle tier. A user with `edit` on Schedule also gets Manage Boats /
reorder. If that matters, a later 3rd level ("update") can split advance-status from
manage — flag it if Ken hits it.
