# Backend brief — per-task "who / when completed" for the kiosk drill-down

## Why
The shop-floor kiosk now drills down to a full-screen **task detail** overlay for each
section of a boat (Key Parts, Lamination, Finishing, and every Assembly work center),
listing every task done ✓ / not-done ○. The one high-value field the frontend can't show
today is **who completed a task and when** — that data isn't on the item payload.

## Ask
Add two fields to each checklist **item** already returned by `GET /api/assembly`
(the `rows[].items[]` objects) — and, if cheap, to the lamination/finishing task rows too:

```jsonc
{
  "item_id": 123,
  "name": "Install fuel tanks",
  "done": true,
  "description": "...",        // already sent
  "photo_count": 2,            // already sent
  "completed_by": "Jacob",     // NEW — display name of who marked it done (null if open)
  "completed_at": "2026-07-23T18:42:00Z"  // NEW — ISO timestamp it was marked done (null if open)
}
```

- `completed_by` = the actor's display name (fall back to username). Null/omitted when `done` is false.
- `completed_at` = when it flipped to done. Null/omitted when open.
- If this info already lives in the CompanyCam event log, joining the most-recent
  "item completed" event per `item_id` is fine — we only need the latest completer + time.

## Notes
- Read-only for the kiosk; no new write routes.
- Purely additive — existing consumers ignore the new fields, so this can't break the app.
- CompanyCam-backed work centers currently send only `remaining` (open names) with no
  per-item `items[]`. Whenever those gain a full `items[]` list, the same two fields on
  each item light up the kiosk overlay automatically — no frontend change needed.

## Frontend status
The overlay already renders name, ✓/◐/○ state, description, expected-delivery date (parts),
and 📷 photo count. It will render `completed_by` + `completed_at` as a muted sub-line on
done tasks as soon as they arrive.
