# Backend brief — CompanyCam integration (Assembly board + Shop Feed)

Paste into a Claude Code session **on the backend server** (`/var/www/boat-tracker`). **Back up
`server.js` and the database first. Additive only — do not touch existing tables or routes.**

Ken will paste his CompanyCam **access token** into this session when asked. Store it in `.env`
ONLY (never in code, never echo it back).

## What this builds
A read-only mirror of CompanyCam checklists into the tracker:
- Each boat ↔ one CompanyCam **project**; each **checklist** on a project = one work center.
- The frontend (already built) calls `GET /api/assembly` (grid of done/total counts) and
  `GET /api/assembly/feed` (activity stream). It polls every 60s — no WebSockets.
- CompanyCam pushes **webhooks** when crews check items; we also poll every 5 min as catch-up.
- We NEVER write to CompanyCam (read + webhook-subscribe only).

CompanyCam API docs: https://docs.companycam.com — REST, `Authorization: Bearer <token>`,
base `https://api.companycam.com/v2`. NOTE their naming: a checklist is a **todo_list**, a
checklist item is a **task** in webhook events; the REST resources are under `/checklists`.

## 1. `.env`
```
COMPANYCAM_TOKEN=<Ken pastes it>
```
Load via the existing dotenv setup (remember the ESM ordering fix — read it at call time or after
dotenv has run, not at import time).

## 2. Tables (additive)
```sql
CREATE TABLE IF NOT EXISTS cc_links (          -- boat <-> CompanyCam project
  boat_id     TEXT PRIMARY KEY,
  project_id  TEXT UNIQUE NOT NULL,
  project_name TEXT,
  linked_by   TEXT,                            -- 'auto' | username
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cc_work_centers (   -- columns of the Assembly grid
  id          TEXT PRIMARY KEY,                -- slug of the checklist name
  name        TEXT NOT NULL,
  sort_order  INT DEFAULT 999
);
CREATE TABLE IF NOT EXISTS cc_progress (       -- one row per boat x work center
  boat_id         TEXT NOT NULL,
  work_center_id  TEXT NOT NULL,
  checklist_id    TEXT,
  completed_items INT DEFAULT 0,
  total_items     INT DEFAULT 0,
  remaining       JSONB DEFAULT '[]',          -- titles of incomplete items, in order
  cc_url          TEXT,                        -- deep link to the project in CompanyCam
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (boat_id, work_center_id)
);
CREATE TABLE IF NOT EXISTS cc_feed (
  id          SERIAL PRIMARY KEY,
  event_id    TEXT UNIQUE,                     -- dedupe key from webhook payload (null for app events)
  boat_id     TEXT,
  work_center_name TEXT,
  type        TEXT,                            -- CHECKLIST_ITEM_COMPLETED | CHECKLIST_COMPLETED | CHECKLIST_CREATED | PHOTO_ADDED | COMMENT_ADDED | APP_TASK_UPDATED
  title       TEXT,
  actor_name  TEXT,                            -- ONLY for app events (tracker logins are per-user); leave NULL for CompanyCam events (shop shares one CC login)
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### App events too (our own tabs → Shop Feed)
The feed also mirrors the tracker's own tabs. Add feed inserts to these EXISTING handlers.
For all of them: wrap in try/catch so a feed insert error can never break the actual save,
set `actor_name` from the logged-in user (display_name or username — app logins ARE per-user,
unlike CompanyCam), and detect transitions by SELECTing the prior row BEFORE the update.
Feed types the frontend knows: `APP_TASK_UPDATED`, `PART_RECEIVED`, `PART_DELAYED`,
`PART_FLAGGED`, `STAGE_CHANGED`.

1. `PUT /api/lamination/:boatId/:taskName` and `PUT /api/finishing/:boatId/:taskName` —
   only when the body changes `status`:
   ```sql
   INSERT INTO cc_feed (boat_id, work_center_name, type, title, actor_name)
   VALUES ($boatId, 'Lamination' /* or 'Finishing' */, 'APP_TASK_UPDATED',
           $taskName || ' → ' || $newStatus, $actor);
   ```
   Do NOT log color/notes/flag-only changes (noise).

2. `PUT /api/parts/:boatId/:partName` (Key Parts) — exactly three transitions (per Ken):
   - **Received:** status changes TO `'Received'` → type `PART_RECEIVED`,
     work_center_name `'Key Parts'`, title `"<part> received"`.
   - **Delivery pushed:** `expected_delivery` changes from one non-null date to a DIFFERENT
     non-null date → type `PART_DELAYED`, title `"<part> delivery moved <old M/D> → <new M/D>"`.
     (First-time date entry — old value null — stays silent; "ordered" events were deliberately
     excluded by Ken.)
   - **Flag turned on:** any of `flag_late` / `flag_backordered` / `flag_unsatisfactory` goes
     false→true → type `PART_FLAGGED`, title `"<part> flagged <Late|Backordered|Unsatisfactory>"`.
     Turning a flag OFF stays silent.

3. `PUT /api/schedule/:boatId` — only when `global_status` changes:
   type `STAGE_CHANGED`, work_center_name `'Schedule'`, title `"Moved to <new status>"`.
   (Reorders and boat-level flag toggles stay silent.)

## 3. Sync logic (one function, reused by webhook + poller + manual refresh)
`syncBoat(boatId)`:
1. Look up `project_id` from `cc_links`.
2. `GET /v2/projects/{project_id}/checklists` — for each checklist:
   - work center id = slug(checklist name); upsert into `cc_work_centers` (first-seen order).
   - fetch its items; count completed vs total; collect incomplete item titles (in checklist order)
     into `remaining`.
   - upsert `cc_progress` with counts, remaining, and `cc_url` = the project's web URL.

`autoLink()`: `GET /v2/projects` (paginate). For each unlinked boat in `boat_information`, if a
project's name **contains the boat_id** (case-insensitive, ignore spaces/dashes), insert into
`cc_links` with linked_by='auto'. Never overwrite an existing link.

## 4. Routes
All under the existing auth EXCEPT the webhook (CompanyCam can't log in):

- `GET /api/assembly` (any logged-in user) →
  ```json
  { "work_centers": [{ "id": "...", "name": "...", "sort_order": 1 }],
    "rows": [{ "boat_id": "...", "work_center_id": "...", "completed_items": 41,
               "total_items": 42, "remaining": ["Steering install"], "cc_url": "https://..." }] }
  ```
- `GET /api/assembly/feed?limit=150` (any logged-in user) → newest-first rows of `cc_feed`
  joined with boat customer_name:
  `[{ id, boat_id, customer_name, work_center_name, type, title, actor_name, created_at }]`
- `GET /api/assembly/projects` (Ops) → CompanyCam projects not yet linked
  `[{ project_id, name }]` — for a future manual-link picker.
- `PUT /api/assembly/link` (Ops) → body `{ boat_id, project_id }` — manual link; then syncBoat.
- `POST /api/assembly/sync` (Ops) → run autoLink + syncBoat for all linked, undelivered boats.
- `POST /api/companycam/webhook` — **no auth**, but MUST verify the signature:
  HMAC-SHA1 of the raw request body, keyed with the webhook's token, base64 — compare to the
  `X-CompanyCam-Signature` header (use `crypto.timingSafeEqual`). Reject mismatches with 401.
  Needs the raw body — register this route with `express.raw()` BEFORE the JSON body parser, or
  capture rawBody via the json verify hook. Handle events:
  - `task.completed` → insert cc_feed (type CHECKLIST_ITEM_COMPLETED, title = task name), then
    syncBoat for that project's boat.
  - `todo_list.completed` → cc_feed (CHECKLIST_COMPLETED, title = "<name> complete") + syncBoat.
  - `todo_list.created` → cc_feed (CHECKLIST_CREATED, title = "Checklist created: <name>") + syncBoat.
  - `photo.created` → cc_feed (PHOTO_ADDED, title = "Photo added") — only if project is linked.
  - Dedupe on the payload's event id (`ON CONFLICT (event_id) DO NOTHING`).
  - Unknown project_id → log and ignore (200 OK so CompanyCam doesn't retry forever).

## 5. Webhook registration + poller
- Via the API (`POST /v2/webhooks`), register ONE webhook:
  url `https://tracker.bluewatersportfishingboats.com/api/companycam/webhook`,
  scopes: `task.completed`, `todo_list.created`, `todo_list.completed`, `photo.created`.
  Save the webhook's **token** (used for signature verification) in `.env` as
  `COMPANYCAM_WEBHOOK_TOKEN`.
- Poller: `setInterval` every 5 minutes → syncBoat for every linked boat whose
  `production_schedule.global_status != 'Delivered'` (webhook catch-up + count corrections).
  Also run `autoLink()` once per hour to pick up new projects.

## 6. Discovery (do this LIVE in the session, with Ken watching)
After the token is in `.env`:
1. List checklist **templates** (`GET /v2/checklists/templates` or per docs) and print their names.
2. Run `autoLink()` and print which boats matched which projects (and which didn't).
3. Run a full sync; print the resulting work centers + one boat's counts.
4. Show Ken; adjust `cc_work_centers.sort_order` so columns read in build order (ask him for the
   order — e.g. Backline before Front Line before Console before QC).

## 7. Verify
- `GET /api/assembly` returns real counts for at least one boat.
- Check an item off in CompanyCam on a phone → within seconds `cc_feed` has the row and the
  count moved; frontend picks it up on its next 60s refresh.
- `node --check server.js`, `pm2 restart boat-tracker`, logs clean.
- Confirm the webhook 401s a request with a bad signature.

Then tell Ken — he'll merge the `assembly-companycam` frontend branch.
