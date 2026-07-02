# Backend add-on — Lamination notes + start/end dates

Small additive follow-up to the lamination backend you just built. Paste into a Claude Code session on
the backend server (`/var/www/boat-tracker`). Back up `server.js` first, change nothing else.

Adds three columns to `lamination_status` and lets the existing `/api/lamination` endpoints read/write
them. The frontend now sends these; the server just stores them.

- `notes` — free text (Transducer Type = the transducer type; Other = a description). **Ops-only**,
  same as `color`.
- `start_date` — auto date the task started (the **frontend computes and sends** it on status change).
- `end_date` — auto date the task finished (frontend-computed and sent). Both are plain dates the
  server just stores — no server-side logic needed.

## 1. Migration
```sql
ALTER TABLE lamination_status ADD COLUMN IF NOT EXISTS notes      TEXT;
ALTER TABLE lamination_status ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE lamination_status ADD COLUMN IF NOT EXISTS end_date   DATE;
```

## 2. `GET /api/lamination`
Also return `notes, start_date, end_date` on each row (add them to the SELECT if columns are listed
explicitly; if it's `SELECT *`, no change).

## 3. `PUT /api/lamination/:boatId/:taskName`
In the existing handler:
- Add `notes` to the **Ops-only** drop (it's already dropping `na` and `color` for non-Ops):
  ```js
  if (!isOps) { delete b.na; delete b.color; delete b.notes; }
  ```
- Add the three keys to the list of columns it will update:
  ```js
  for (const k of ['na','color','notes','start_date','end_date','flag_issue','flag_rework','flag_unsatisfactory'])
    if (k in b) put(k, b[k] === '' ? null : b[k]);
  ```
  (`start_date` / `end_date` are set by any logged-in user, since they ride along with a normal status
  change; only `notes` is Ops-gated.)

## 4. Finish
`pm2 restart boat-tracker`. Verify: advance a lamination task and check `start_date` fills; take it to
the last stage and `end_date` fills; set a note on Transducer Type / Other as Ops — refresh, all stick.
