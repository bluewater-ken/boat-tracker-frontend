# BACKEND_SESSION_BRIEF.md — Instructions for a Claude Code session running ON the Bluewater backend server

Paste this whole file into a Claude Code session that is running **on the backend server** (the
DigitalOcean droplet), in the backend project folder. It is the mirror of the frontend's
`BACKEND_INTEGRATION.md`: that doc told the *frontend* session to never touch the backend; **this** doc
tells the *backend* session exactly what small, additive changes to make so new frontend features save.

---

## ✅ What you MAY do here (you are on the backend server)
- Read and edit `server.js` (and related backend files) in this folder.
- Run PostgreSQL migrations via `psql`.
- Restart the app with PM2.
- **Back up before changing anything.**

## ⛔ What you must NOT do
- Do **not** touch the frontend repo or Vercel (that is a separate project on a different machine).
- Do **not** change or break existing auth (`auth.js`, `/api/auth/*`, the `users` table). Only ADD.
- Do **not** remove or rename existing columns or routes. **Every change here is additive.**
- Do **not** print or expose secrets from `.env`.
- If anything is ambiguous or looks risky, STOP and ask Ken before proceeding.

## Environment (orientation only — verify against what you actually find)
- Node/Express app kept alive by PM2 (app name likely **`boat-tracker`** — check `pm2 list`).
- Folder: typically **`/var/www/boat-tracker`** (you are probably already here).
- PostgreSQL on this same server; the app connects via a `pg` `Pool` already configured from `.env`.
  Reuse that existing connection/config — do not hardcode credentials.
- Nginx reverse-proxies HTTPS (`tracker.bluewatersportfishingboats.com`) → this Node app.
- Auth is already built and working (`requireAuth`, `requireRole('ops')`). Reuse that middleware.

**Assumed schema** (confirm; adjust names if different): `parts` table one row per boat+part with
`boat_id, part_name, is_custom, status, ordered_at, received_at` and a unique key on
`(boat_id, part_name)`; `boats` table keyed by `boat_id`.

---

## Step 0 — Back up first (do this before anything else)
```bash
cd /var/www/boat-tracker            # adjust if your path differs
cp server.js server.js.pre-parts-backup
pg_dump -U <dbuser> <dbname> > ~/boat-tracker-backup-$(date +%F).sql
```

## Step 1 — Database migrations
Run in `psql`. Safe to re-run (each is `IF NOT EXISTS`):
```sql
-- Key Parts: delivery dates, three flags, spec/description
ALTER TABLE parts ADD COLUMN IF NOT EXISTS expected_delivery   DATE;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS actual_delivery     DATE;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS flag_late           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS flag_backordered    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS flag_unsatisfactory BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS description         TEXT;

-- Production Schedule: five boat-level flags
ALTER TABLE boats ADD COLUMN IF NOT EXISTS flag_issue          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS flag_rework         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS flag_unsatisfactory BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS flag_missing_parts  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boats ADD COLUMN IF NOT EXISTS flag_late_parts     BOOLEAN NOT NULL DEFAULT false;

-- Needed for the parts upsert below (skip if it already exists):
-- ALTER TABLE parts ADD CONSTRAINT parts_boat_part_uniq UNIQUE (boat_id, part_name);
```

## Step 2 — Route changes (merge into the existing handlers; keep the current code style)

**2a. `GET /api/parts`** — if it uses `SELECT *`, no change. If columns are listed explicitly, add:
`expected_delivery, actual_delivery, flag_late, flag_backordered, flag_unsatisfactory, description`.

**2b. `PUT /api/parts/:boatId/:partName`** — accept any subset of `status, is_custom,
expected_delivery, actual_delivery, flag_late, flag_backordered, flag_unsatisfactory, description`.
Update only keys present. Default `actual_delivery` to today when `status` becomes `Received` and it
wasn't supplied. Safe drop-in:
```js
app.put('/api/parts/:boatId/:partName', requireRole('ops'), async (req, res) => {
  try {
    const { boatId, partName } = req.params;
    const body = { ...req.body };
    if (body.status === 'Received' && body.actual_delivery === undefined) {
      body.actual_delivery = new Date().toISOString().slice(0, 10);
    }
    await pool.query(
      `INSERT INTO parts (boat_id, part_name) VALUES ($1,$2)
       ON CONFLICT (boat_id, part_name) DO NOTHING`, [boatId, partName]);
    const allowed = ['status','is_custom','expected_delivery','actual_delivery',
                     'flag_late','flag_backordered','flag_unsatisfactory','description'];
    const sets = [], vals = [];
    for (const k of allowed) if (k in body) { vals.push(body[k] === '' ? null : body[k]); sets.push(`${k} = $${vals.length}`); }
    if (sets.length) {
      vals.push(boatId, partName);
      await pool.query(`UPDATE parts SET ${sets.join(', ')} WHERE boat_id = $${vals.length-1} AND part_name = $${vals.length}`, vals);
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'update failed' }); }
});
```

**2c. `GET /api/parts/custom-names`** — should return every custom part name ever used:
```js
const r = await pool.query(`SELECT DISTINCT part_name FROM parts WHERE is_custom = true ORDER BY part_name`);
res.json(r.rows.map(x => x.part_name));
```

**2d. NEW `GET /api/parts/spec-options`** (optional but recommended) — remembered specs per part:
```js
app.get('/api/parts/spec-options', requireAuth, async (req, res) => {
  const r = await pool.query(`SELECT part_name, description FROM parts WHERE description IS NOT NULL AND description <> '' GROUP BY part_name, description`);
  const map = {};
  for (const row of r.rows) { (map[row.part_name] ||= []).push(row.description); }
  res.json(map);
});
```

**2e. `GET /api/boats`** — `SELECT *` → no change; else add the five `flag_*` columns above.

**2f. `PUT /api/schedule/:boatId`** — accept `global_status` plus the five flags; **both Ops and Shop**
may call this (use `requireAuth`, not `requireRole('ops')`). Keep any existing STATUS_HISTORY logic.
```js
app.put('/api/schedule/:boatId', requireAuth, async (req, res) => {
  try {
    const { boatId } = req.params;
    const allowed = ['global_status','flag_issue','flag_rework','flag_unsatisfactory','flag_missing_parts','flag_late_parts'];
    const sets = [], vals = [];
    for (const k of allowed) if (k in req.body) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(boatId);
    await pool.query(`UPDATE boats SET ${sets.join(', ')} WHERE boat_id = $${vals.length}`, vals);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'update failed' }); }
});
```

## Step 3 — Restart and verify
```bash
pm2 restart boat-tracker            # use the real app name from `pm2 list`
```
Verify (get a token from POST /api/auth/login as ken):
```bash
TOKEN="<Bearer token>"; BASE="https://tracker.bluewatersportfishingboats.com"
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/parts | head -c 500; echo
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Ordered","expected_delivery":"2026-08-01","description":"Triple Suzuki 350"}' \
  "$BASE/api/parts/<A_REAL_BOAT_ID>/Motors"; echo
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/boats | head -c 500; echo
```
Then tell Ken: open the live site, set a delivery date / flag / spec on Key Parts, **refresh** — it
should now persist.

## Rollback if anything goes wrong
```bash
cp server.js.pre-parts-backup server.js && pm2 restart boat-tracker
# if a migration caused trouble, restore the DB dump from Step 0
```

## When done
Summarize exactly what you changed (columns added, handlers edited). Do not touch anything else.
The matching field-by-field reference is `API_CONTRACT.md` in the frontend repo.
