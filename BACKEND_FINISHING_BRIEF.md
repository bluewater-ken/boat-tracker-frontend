# Backend brief — Finishing tracker (Tab 5)

Paste this into a Claude Code session **on the backend server** (`/var/www/boat-tracker`). It adds the
Finishing tracker's storage + API. **Back up `server.js` and the database first. Change nothing else.**

This is the direct sibling of the Lamination tracker you already built — same shape (one row per
boat × task), so **model it on the existing `lamination_status` table and `/api/lamination` routes.**
Finishing just has a different task list, status set, and flag model.

## What Finishing is
- **10 tasks** (fixed): Hull, Liner, Ring, Hard Top, Console, Console Face, Hatches, Leaning Post,
  Buckets, Other.
- **4 statuses**, stops at Complete (no loop): `Not Available` → `Not Started` → `In Progress` → `Complete`.
- Per-task **color** (like Lamination).
- **Flags — different from Lamination.** Two things instead of the three standard flags:
  - `asap` — a boolean priority toggle.
  - `grade` — a single pick-one quality grade of how the part arrived: `'good' | 'bad' | 'ugly'` (or null).

## 1. Table
```sql
CREATE TABLE IF NOT EXISTS finishing_status (
  boat_id     TEXT NOT NULL,
  task_name   TEXT NOT NULL,
  status      TEXT,
  color       TEXT,
  na          BOOLEAN DEFAULT false,
  asap        BOOLEAN DEFAULT false,
  grade       TEXT,               -- 'good' | 'bad' | 'ugly' | null
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (boat_id, task_name)
);
```
(If you keep a `status_dates`/history jsonb on `lamination_status` for reporting, add the same here —
optional, the frontend doesn't read it.)

## 2. `GET /api/finishing`
Return all rows: `boat_id, task_name, status, color, na, asap, grade`. Any logged-in user may read.
(Rows that don't exist yet simply aren't returned — the frontend defaults them to `Not Available`.)

## 3. `PUT /api/finishing/:boatId/:taskName`
Upsert (same pattern as `PUT /api/lamination/:boatId/:taskName`). Body is a **partial** patch — only
the keys present should be written.

**Permissions (important):**
- `color` and `na` are **Ops-only** — drop them for non-Ops, exactly like Lamination:
  ```js
  if (!isOps) { delete b.na; delete b.color; }
  ```
- `status`, `asap`, `grade` may be set by **any logged-in user** (Shop or Ops) — Shop does floor updates.

Columns to write:
```js
for (const k of ['status','color','na','asap','grade'])
  if (k in b) put(k, b[k] === '' ? null : b[k]);
```

## 4. Finish
`pm2 restart boat-tracker`. Verify: a PUT with `status` persists for Shop and Ops; a PUT with `color`
or `na` is **ignored for Shop** but saved for Ops; `asap`/`grade` save for both; `GET /api/finishing`
returns them. Then tell Ken and he'll merge the frontend `finishing` branch.

## Note
Frontend degrades gracefully if the tab ships before this: the Finishing tab shows all tasks as
`Not Available` and edits will fail to save (an alert appears). So **run this brief first**, then merge.
