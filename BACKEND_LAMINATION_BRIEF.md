# Backend add-on — Lamination tracker

Paste into a Claude Code session running **on the backend server** (`/var/www/boat-tracker`), same as
the last ones. Additive and safe — back up `server.js` and the DB first, change nothing existing.

The frontend's new **Lamination** tab calls the endpoints below. 13 tasks, a 5-status mold cycle that
stops at Pulled, an N/A state, a per-task color, and 3 flags.

## 1. New table
```sql
CREATE TABLE IF NOT EXISTS lamination_status (
  boat_id             TEXT NOT NULL,
  task_name           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'Mold Unavailable',
  status_date         DATE,
  status_dates        JSONB NOT NULL DEFAULT '{}',   -- remembers each status's original date (step-back memory)
  na                  BOOLEAN NOT NULL DEFAULT false,
  color               TEXT,
  flag_issue          BOOLEAN NOT NULL DEFAULT false,
  flag_rework         BOOLEAN NOT NULL DEFAULT false,
  flag_unsatisfactory BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (boat_id, task_name)
);
```

## 2. `GET /api/lamination` (requireAuth)
Return all rows: `boat_id, task_name, status, status_date, na, color, flag_issue, flag_rework,
flag_unsatisfactory`. (Rows may not exist for every boat/task — the frontend defaults missing ones to
"Mold Unavailable".)

## 3. `PUT /api/lamination/:boatId/:taskName` (requireAuth)
Accept a **partial** body with any of: `status, na, color, flag_issue, flag_rework,
flag_unsatisfactory`. Upsert the row (create if missing), updating only keys present.

**Date memory** — when `status` changes:
- If the new status is `Mold Unavailable` → `status_date = NULL`.
- Else if `status_dates` already has a date for that status → `status_date` = that remembered date
  (this is the step-back restoring the original date).
- Else → `status_date` = today, and record it: `status_dates[status] = today`.

**Permissions:** status / flags may be set by **Ops and Shop**. `na` and `color` are **Ops-only** —
if the body includes `na` or `color` and the user isn't Ops, reject with 403 (or ignore those keys).

Upsert sketch:
```js
app.put('/api/lamination/:boatId/:taskName', requireAuth, async (req, res) => {
  try {
    const { boatId, taskName } = req.params;
    const isOps = req.user?.role === 'ops';               // however you read the role
    const b = { ...req.body };
    if (!isOps) { delete b.na; delete b.color; }          // Ops-only fields
    await pool.query(
      `INSERT INTO lamination_status (boat_id, task_name) VALUES ($1,$2)
       ON CONFLICT (boat_id, task_name) DO NOTHING`, [boatId, taskName]);
    const { rows } = await pool.query(
      'SELECT status_dates FROM lamination_status WHERE boat_id=$1 AND task_name=$2', [boatId, taskName]);
    const memory = rows[0]?.status_dates || {};
    const sets = [], vals = [];
    const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    for (const k of ['na','color','flag_issue','flag_rework','flag_unsatisfactory']) if (k in b) put(k, b[k] === '' ? null : b[k]);
    if ('status' in b) {
      put('status', b.status);
      const today = new Date().toISOString().slice(0,10);
      let date = null;
      if (b.status !== 'Mold Unavailable') { date = memory[b.status] || today; memory[b.status] = memory[b.status] || today; }
      put('status_date', date);
      put('status_dates', JSON.stringify(memory));
    }
    if (sets.length) { vals.push(boatId, taskName); await pool.query(
      `UPDATE lamination_status SET ${sets.join(', ')} WHERE boat_id=$${vals.length-1} AND task_name=$${vals.length}`, vals); }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'update failed' }); }
});
```

## 4. Finish
`pm2 restart boat-tracker`. Verify: open the Lamination tab, advance a task (date stamps), step back
(date returns), set a color / N/A as Ops — refresh and confirm it persists.

Until this runs, the Lamination tab shows but nothing saves (build-to-contract, like the others did).
