# Backend implementation guide — make the tested features save

**Goal:** add the small server-side pieces so the frontend features we built (Key Parts delivery
dates, flags, part specs, custom parts; Production Schedule flags) actually **persist**. Hull color
and status changes already work and need nothing here.

**Where to run this:** on the server (the DigitalOcean droplet) where `server.js` and PostgreSQL
live — **not** in the frontend repo. If you build the backend by running a Claude session on the
server (the way the login/auth system was built), paste this whole file to it as the spec. Everything
here is additive; nothing removes existing behavior.

**Assumed schema** (adjust names if yours differ):
- `parts` table, one row per boat+part, columns include `boat_id`, `part_name`, `is_custom`,
  `status`, `ordered_at`, `received_at`. Assumed unique key on `(boat_id, part_name)`.
- `boats` table keyed by `boat_id`, columns include `hull_color`, `global_status`, `sequence_number`.
- Express app using a `pg` pool (`pool.query`), with existing `requireAuth` / `requireRole('ops')`
  middleware (from `auth.js`).

---

## 0. Back up first (2 minutes)

```bash
cd /var/www/boat-tracker          # or wherever server.js lives
cp server.js server.js.pre-parts-backup
# DB backup (adjust DB name/user):
pg_dump -U <dbuser> <dbname> > ~/boat-tracker-backup-$(date +%F).sql
```

---

## 1. Database migrations (PostgreSQL)

Run in `psql` (safe to re-run — each guard is `IF NOT EXISTS`):

```sql
-- Key Parts: delivery dates, three flags, and the spec/description
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

-- Needed for the parts upsert below (skip if the constraint already exists):
-- ALTER TABLE parts ADD CONSTRAINT parts_boat_part_uniq UNIQUE (boat_id, part_name);
```

---

## 2. API route changes (Express)

These **merge into existing handlers** — keep your current code style. If a handler uses
`SELECT * FROM ...`, the new columns come back automatically and that GET needs no change.

### 2a. `GET /api/parts` — return the new columns
If it selects columns explicitly, add: `expected_delivery, actual_delivery, flag_late,
flag_backordered, flag_unsatisfactory, description`. (With `SELECT *`, no change.)

### 2b. `PUT /api/parts/:boatId/:partName` — accept the new fields (partial update)
Accept any subset of: `status, is_custom, expected_delivery, actual_delivery, flag_late,
flag_backordered, flag_unsatisfactory, description`. Update only the keys that are present. When
`status` becomes `Received` and no `actual_delivery` was sent, default it to today.

A safe drop-in (ensure row exists, then update only provided columns):

```js
app.put('/api/parts/:boatId/:partName', requireRole('ops'), async (req, res) => {
  try {
    const { boatId, partName } = req.params;
    const body = { ...req.body };
    if (body.status === 'Received' && body.actual_delivery === undefined) {
      body.actual_delivery = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }
    // make sure the row exists (requires the UNIQUE(boat_id, part_name) constraint)
    await pool.query(
      `INSERT INTO parts (boat_id, part_name) VALUES ($1, $2)
       ON CONFLICT (boat_id, part_name) DO NOTHING`, [boatId, partName]);

    const allowed = ['status','is_custom','expected_delivery','actual_delivery',
                     'flag_late','flag_backordered','flag_unsatisfactory','description'];
    const sets = [], vals = [];
    for (const k of allowed) {
      if (k in body) { vals.push(body[k] === '' ? null : body[k]); sets.push(`${k} = $${vals.length}`); }
    }
    if (sets.length) {
      vals.push(boatId, partName);
      await pool.query(
        `UPDATE parts SET ${sets.join(', ')}
         WHERE boat_id = $${vals.length - 1} AND part_name = $${vals.length}`, vals);
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'update failed' }); }
});
```

### 2c. `GET /api/parts/custom-names` — make sure it returns saved custom names
Should be roughly:
```js
app.get('/api/parts/custom-names', requireAuth, async (req, res) => {
  const r = await pool.query(
    `SELECT DISTINCT part_name FROM parts WHERE is_custom = true ORDER BY part_name`);
  res.json(r.rows.map(x => x.part_name));
});
```

### 2d. `GET /api/parts/spec-options` — NEW (optional but recommended)
Feeds the "remembered spec" dropdown per part type:
```js
app.get('/api/parts/spec-options', requireAuth, async (req, res) => {
  const r = await pool.query(
    `SELECT part_name, description FROM parts
     WHERE description IS NOT NULL AND description <> ''
     GROUP BY part_name, description`);
  const map = {};
  for (const row of r.rows) { (map[row.part_name] ||= []).push(row.description); }
  res.json(map);
});
```
(If you skip this, the frontend still shows specs saved on currently-loaded boats.)

### 2e. `GET /api/boats` — return the new flag columns
`SELECT *` → no change. Otherwise add: `flag_issue, flag_rework, flag_unsatisfactory,
flag_missing_parts, flag_late_parts`.

### 2f. `PUT /api/schedule/:boatId` — accept the flags (partial update)
Accept `global_status` plus the five flags. **Both Ops and Shop** may call this (use `requireAuth`,
not `requireRole('ops')`). Reorder (`PUT /api/schedule/reorder`) stays Ops-only.

```js
app.put('/api/schedule/:boatId', requireAuth, async (req, res) => {
  try {
    const { boatId } = req.params;
    const allowed = ['global_status','flag_issue','flag_rework','flag_unsatisfactory',
                     'flag_missing_parts','flag_late_parts'];
    const sets = [], vals = [];
    for (const k of allowed) {
      if (k in req.body) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) return res.json({ ok: true });
    vals.push(boatId);
    await pool.query(
      `UPDATE boats SET ${sets.join(', ')} WHERE boat_id = $${vals.length}`, vals);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'update failed' }); }
});
```
> If your current schedule PUT also writes to STATUS_HISTORY on status change, keep that logic and
> just add the flag columns to the update.

---

## 3. Restart and verify

```bash
pm2 restart boat-tracker          # use your actual PM2 app name (pm2 list)
```

Verify (replace TOKEN with a valid Ops login token; get one from POST /api/auth/login):

```bash
TOKEN="<paste a Bearer token>"
BASE="https://tracker.bluewatersportfishingboats.com"

# 1) parts now include the new fields:
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/parts | head -c 600; echo

# 2) save a description + expected date on a part, then confirm it persisted:
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Ordered","expected_delivery":"2026-08-01","description":"Triple Suzuki 350"}' \
  "$BASE/api/parts/<A_REAL_BOAT_ID>/Motors"; echo

# 3) boats include the flag columns:
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/boats | head -c 600; echo
```

Then open the live site, log in, set a delivery date / flag / spec, **refresh the page** — it should
now stick.

---

## 4. Checklist
- [ ] Backed up `server.js` and the database
- [ ] Ran the SQL migrations (parts + boats columns; unique constraint if needed)
- [ ] `GET /api/parts` returns new fields; `PUT /api/parts/...` accepts them
- [ ] `GET /api/parts/custom-names` returns saved custom names
- [ ] (optional) `GET /api/parts/spec-options` added
- [ ] `GET /api/boats` returns flag columns; `PUT /api/schedule/:boatId` accepts flags (Ops+Shop)
- [ ] `pm2 restart`, verified with curl + a page refresh

---

## Notes
- **Hull color** already persists via the existing `PUT /api/boats` — nothing to do.
- **Step-back date memory** (restoring a status's original timestamp on a backward move) is an
  optional polish; the app works fine without it.
- The frontend currently seeds a few **dummy** custom parts + spec options so the UI is clickable.
  Once real data flows, tell the frontend side and that seed gets removed (one small change in
  `src/KeyPartsTracker.jsx`).
- Full field-by-field reference lives in `API_CONTRACT.md` in the frontend repo.
