# BACKEND_INTEGRATION.md — How the frontend talks to the backend

This document tells Claude Code **what the backend already provides** and **how the frontend
should connect to it**. It is reference/context only.

## ⛔ HARD RULE — read this first
- **You (Claude Code) must NOT touch, SSH into, modify, or run commands against the backend server
  or database.** The backend is already built, deployed, and working. It lives on a separate
  server that is intentionally out of scope for this repo.
- Your job is **frontend only**: build the React app in this repo so it correctly *calls* the
  backend's existing HTTP API.
- Do not attempt to add server code, database migrations, `.env` secrets for the server, or any
  deployment/infra steps for the backend. If something seems to require backend changes, STOP and
  tell Ken — do not do it yourself.

## The backend already exists and is done
The backend (Node/Express + PostgreSQL, behind Nginx with HTTPS) is live at:

```
https://tracker.bluewatersportfishingboats.com
```

That is the value of `VITE_API_URL` in production. All API calls go to that base URL.

## Authentication — already built and tested on the backend
The backend already implements auth. The frontend just needs to *use* it.

### Endpoints
- **`POST /api/auth/login`**
  - Body: `{ "username": "...", "password": "..." }`
  - Success → `200` with:
    `{ "token": "<JWT>", "user": { "id", "username", "role", "display_name" } }`
  - Failure → `401` with `{ "error": "Wrong username or password" }`
- **`GET /api/auth/me`**
  - Requires header `Authorization: Bearer <token>`
  - Success → `{ "user": { "id", "username", "role" } }`
  - Invalid/expired token → `401`
- **Ops-only user management** (build UI later, not now):
  `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`
  — all require a valid Ops token.

### Token details
- The token is a **JWT**, valid **30 days**.
- Send it on every authenticated request as an HTTP header:
  `Authorization: Bearer <token>`
- Store it so a page refresh doesn't log the user out (localStorage + in-memory, per the login plan).

### Roles
- `role` comes back on the user object. Possible values: **`ops`** (full access) and **`shop`**
  (restricted). A third role **`display`** = no-login read-only TV view (built much later).
- For the current login pass: read and expose `role` app-wide, but do NOT yet hide controls by role
  (both roles see the existing 3 tabs identically for now — this was Ken's explicit choice).

## IMPORTANT nuance: auth is not yet ENFORCED on data routes
- The backend has auth built, but the existing **data routes** (`/api/boats`, `/api/schedule/*`,
  `/api/parts/*`, etc.) are **not yet requiring** a token — they still respond without one.
- So: attaching the `Authorization: Bearer` header now is correct and forward-compatible, but the
  app will still work even before enforcement is switched on. Build the frontend to always send the
  token; enforcement on the backend will be turned on later (by Ken, on the server — not by you).

## Existing data API (already working — the 3 current tabs use these)
These already work and return real data from the live database:
- `GET /api/boats`, `GET /api/boats/:boat_id`, `POST /api/boats`, `PUT /api/boats/:boat_id`
- `GET /api/boats/:boat_id/history`
- `PUT /api/schedule/reorder`, `PUT /api/schedule/:boat_id`
- `GET /api/parts/standard`, `GET /api/parts/custom-names`, `GET /api/parts/:boat_id`,
  `GET /api/parts`, `PUT /api/parts/:boat_id/:part_name`
- `GET /api/health` (simple health check)

Route the existing tabs' calls through the shared `apiFetch` helper so they all carry the token.

## How the backend auth was built (context only — do NOT replicate or touch)
For your understanding only, so you know it's real and stable:
- Auth logic is in a separate `auth.js` on the server (bcryptjs for password hashing,
  jsonwebtoken for tokens).
- A `users` table exists: `id, username, password_hash, role, display_name, created_at`.
- One Ops account exists (username `ken`).
- This was all done manually and carefully on the server and is verified working over HTTPS.
- You do not need to know more than the endpoint contracts above. Do not attempt to recreate,
  migrate, or modify any of this.

## Design/look reference
- A standalone prototype of the intended Bluewater UI may be provided at
  `design-reference/BluewaterDemo.jsx`. Use it as a **visual and structural reference** for colors,
  layout, status colors, action menus, and component feel. Do NOT wire it into the app or copy it
  wholesale — it uses fake in-memory data. Match its *look*, applied to the real, backend-connected
  components.
- Brand: deep navy `#173A5E`, splash blue `#2E92D6`, light steel-blue `#A9C3D4`, white surfaces.
  Navy header bar. No purple.

## Summary of what to do
1. Build the frontend login flow and connect it to the endpoints above.
2. Always send `Authorization: Bearer <token>` on API calls.
3. Match the Bluewater look (use the demo as reference).
4. **Never touch the backend/server/database.** Frontend only.
