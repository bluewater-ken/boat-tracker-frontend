# CLAUDE.md — Bluewater Sportfish Production Tracker (Frontend)

This file orients Claude Code on this project. Read it fully before doing anything.

## What this project is
A web app that replaces an Excel spreadsheet for **Bluewater Sportfish**, a custom sportfishing boat manufacturer in Fort Pierce, FL. It tracks boats through production. Owner/user: **Ken Goldfarb** (not a professional developer — explain choices in plain language, keep changes reviewable, never make sweeping unexplained edits).

**This repo is the FRONTEND only** (React + Vite, deployed to Vercel). The backend + database live on a separate server and are NOT in this repo — do not attempt to modify backend or server infrastructure from here.

## Tech stack
- React + Vite
- Deploys to **Vercel** automatically on push to the `main` branch on GitHub (`bluewater-ken/boat-tracker-frontend`).
- Talks to the backend via the env var `VITE_API_URL`.
- **Backend API base URL (production, HTTPS):** `https://tracker.bluewatersportfishingboats.com`
- Backend is Node/Express + PostgreSQL on a DigitalOcean droplet, fronted by Nginx with a valid Let's Encrypt cert. (Context only — not in this repo.)

## CRITICAL SAFETY RULES
- **Never** touch or attempt to connect to the production server, database, or `.env` secrets. This repo is frontend code only.
- Make changes in small, reviewable commits. Explain what each change does in plain English.
- Do not run destructive git commands (no force-push, no history rewrite) without explicit confirmation.
- When in doubt, ask Ken before doing something irreversible.
- Assume everything committed to `main` auto-deploys to the live site — so keep `main` working. Prefer building/testing before pushing.

## Current state (as of this writing)
The live app already has **3 working tabs**: Production Schedule, Boat Information, Key Parts. These are deployed and working over HTTPS.

**Backend authentication is DONE and tested** (built directly on the server, not in this repo):
- `POST /api/auth/login` — takes `{username, password}`, returns `{token, user:{id,username,role,display_name}}`. Token is a JWT (Bearer), valid 30 days.
- `GET /api/auth/me` — returns current user; requires `Authorization: Bearer <token>` header.
- Ops-only user management: `GET/POST/PUT/DELETE /api/users`.
- Roles: **ops** (full access), **shop** (restricted floor updates). A third conceptual role **display** = no-login read-only TV view.
- First account exists: username `ken`, role `ops`.
- IMPORTANT: auth exists on the backend but is **NOT yet enforced** on the existing data routes (boats/schedule/parts are still open). Enforcement + frontend login is the current work.

## THE IMMEDIATE TASK (what to build first)
Build the **frontend login flow** and wire it to the existing backend auth:
1. A **login screen** (username + password) in the Bluewater brand. On submit, call `POST {VITE_API_URL}/api/auth/login`, store the returned token (in memory + localStorage so it survives refresh), and store the user object.
2. **Send the token** as `Authorization: Bearer <token>` on all API requests to the backend.
3. **Gate the app**: if no valid token, show the login screen; otherwise show the app. On load, verify the token via `GET /api/auth/me`; if it fails, log out and show login.
4. **Role-awareness**: read `user.role`. Ops sees everything. Shop sees a restricted experience (details below). Provide a clean `logout` that clears the token.
5. Keep it simple and robust — this is a small internal tool, ~10 users, light security (prevent accidental changes, not high-security).

Do this FIRST, get it working and deployed, before building new tabs.

## Bluewater brand (use throughout)
- **Deep navy** `#173A5E` (primary/structure, headers), **splash blue** `#2E92D6` (accent/action/active), **light steel-blue** `#A9C3D4`, white surfaces. Navy header bar with the Bluewater logo top-left. Flat, sturdy, utilitarian-but-polished. No purple (old starter look — replace if seen).
- There is a real logo PNG (white version for the navy header). Ken can provide the file; use a placeholder if not present and leave a clear TODO.

## Roles & permissions (locked design)
- **Ops** — full: all tabs, editing, boat setup, set color, set N/A, announcements, settings, user management.
- **Shop** — restricted (mobile floor tool): can Advance status, Step Back, set Flags. CANNOT edit boat info, set color, set N/A, delete, or change settings. Key Parts is view-only for Shop.
- **Display** — no-login read-only TV view (built later).
Action menus are **role-aware** (hide controls the role can't use).

## Tabs / trackers (full designs live in the BRD — ask Ken for Bluewater_Tracker_BRD.md)
Beyond the 3 existing tabs, these are designed and need building (AFTER login works):
- **Lamination**: 13 tasks; 5 statuses Mold Unavailable→Mold Open→In Progress→Complete/On Mold→Pulled (stops at Pulled); N/A state; per-part color; 3 flags (Issue/Delay, Required Rework, Unsatisfactory); step-back restores prior date.
- **Finishing**: 10 tasks; 4 statuses Not Available→Not Started→In Progress→Complete (stops at Complete); NO molds; two flag systems: ASAP toggle + Good/Bad/Ugly grade (face icons); per-part color; N/A.
- **Key Parts** (rebuild of existing): 16 parts; 3 statuses Not Ordered→Ordered→Received; **view-only except Ops**; dates = DELIVERY dates (expected when Ordered, actual when Received, can be blank); 3 flags Late/Backordered/Unsatisfactory; Late is hybrid manual + auto (auto-flag once past expected date & not received).
- **Views**: computer/Ops (dense, full edit), TV/shop-floor (read-only, auto-rotating boards, auto-scroll wide grids), mobile/Shop (boat-first, restricted). Build computer/Ops first.

## Working style with Ken
- Ken is capable and willing but not a developer. Favor clear plain-English explanations.
- Use Plan Mode for anything spanning multiple files; show the plan before executing.
- Small commits, test before pushing to `main` (since main auto-deploys live).
- The authoritative design doc is **Bluewater_Tracker_BRD.md** — Ken has it; ask him to add it to the project if deeper detail is needed.
