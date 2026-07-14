# Backend brief — daily completions metric (throughput chart)

**For:** Claude Code session on the backend server (`/var/www/boat-tracker`).
**One new read-only route over the existing `cc_feed` event log. Back up `server.js` first.**

Powers Admin → Throughput: a stacked bar chart of jobs completed per day, by department.
The frontend already works from a shallow feed fallback; this gives it real, deep history.

## Route
`GET /api/metrics/completions?days=N` (Ops-only, `requireRole('ops')`)
- `days`: default 30, cap 365.
- Returns one row per day in the range (zero-filled — include days with no completions):
```json
[ { "date": "2026-07-13", "glass": 12, "finishing": 5, "assembly": 28 }, ... ]
```
(The chart tracks shop-build completions only — Glass Shop / Finishing / Assembly. Key Parts
was dropped from the chart, so no `parts` bucket is needed; ignore PART_RECEIVED events.)

## What counts, per department (all from `cc_feed`)
Bucket each completion event by `created_at::date` (shop timezone — America/New_York) and by
department:

- **assembly** — `type = 'CHECKLIST_ITEM_COMPLETED'` (CompanyCam checkoffs). (Include
  `CHECKLIST_COMPLETED` too if you want whole-list completions counted — your call; the
  frontend fallback counts item-completions only, so item-only keeps them consistent.)
- **glass** — `type = 'APP_TASK_UPDATED'` AND `work_center_name = 'Lamination'` AND the event
  is a completion, i.e. the new status is one of **`Complete/On Mold`**, **`Pulled`**, or
  **`Complete`** (Glass Kit). The title is stored as `"<task> → <status>"`, so match
  `title ~ '→ (Complete/On Mold|Pulled|Complete)$'` — or if you store the new status in a
  column, test that directly (cleaner).
- **finishing** — `type = 'APP_TASK_UPDATED'` AND `work_center_name = 'Finishing'` AND new
  status = **`Complete`** (`title ~ '→ Complete$'`).

Everything else in `cc_feed` (photos, comments, questions, stage changes, part flags,
non-completion status moves like "→ In Progress") is **not** a completion — ignore it.

Note the "glass = on mold or pulled" rule matches the app's lamination "done" definition
(see BACKEND_GLASS_ONMOLD_BRIEF.md) — keep them the same.

## Implementation sketch
One grouped query, or fetch the window and bucket in JS:
```sql
SELECT created_at::date AS date,
  COUNT(*) FILTER (WHERE type='CHECKLIST_ITEM_COMPLETED')                          AS assembly,
  COUNT(*) FILTER (WHERE type='APP_TASK_UPDATED' AND work_center_name='Lamination'
                   AND title ~ '→ (Complete/On Mold|Pulled|Complete)$')            AS glass,
  COUNT(*) FILTER (WHERE type='APP_TASK_UPDATED' AND work_center_name='Finishing'
                   AND title ~ '→ Complete$')                                      AS finishing
FROM cc_feed
WHERE created_at >= now() - ($1::int || ' days')::interval
GROUP BY 1 ORDER BY 1;
```
Then zero-fill missing days in JS before responding (the frontend also tolerates gaps, but
zero-filled is cleaner). Adapt column/table names to the real schema — verify with `\d cc_feed`.

## Verify
- `node --check server.js`, `pm2 restart boat-tracker`, logs clean.
- `GET /api/metrics/completions?days=14` returns 14 rows, newest-inclusive, numbers that look
  right vs the Shop Feed activity for those days.
- Non-ops → 403.
- Open Admin → Throughput on the site: the "recent activity (connect the metrics endpoint)"
  note disappears and the chart fills with real history.

## Note on history depth
`cc_feed` only goes back to when the CompanyCam/feed logging started (~2026-07-04), so early
ranges will be short until more history accrues. That's expected — nothing to backfill.

Then tell Ken it's live.
