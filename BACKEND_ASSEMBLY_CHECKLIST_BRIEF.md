# Backend add — send the FULL CompanyCam checklist to the Assembly board

Small change to the `/api/assembly` endpoint on the server (`/var/www/boat-tracker`). Paste into a
Claude Code session on the server. **Back up the file you edit first. Read-only data change — no writes.**

## Why
The Assembly popup in B.O.S.S now shows a full checklist with an **All / To do / Done** toggle. For our
own Lamination & Finishing columns it already lists every item. For the **CompanyCam** work-center
columns, the API currently returns only the *unfinished* items (`remaining`) plus the counts — so the
popup can show "To do" but not the names of completed items, and "All" looks short (e.g. shows 3 of 15).

## The change
In the handler that builds the `/api/assembly` response, for **each row** (one per boat × work center),
add an `items` array listing **every** checklist item with its done state — in the checklist's own order:

```json
{
  "boat_id": "25T047",
  "work_center_id": "wc2",
  "completed_items": 12,
  "total_items": 15,
  "remaining": ["Install Trolling Motor Plate and/or Seaswivel", "..."],
  "items": [
    { "name": "Install Ring", "done": false },
    { "name": "Install rub rail", "done": true },
    { "name": "...", "done": true }
  ]
}
```

- `items` = the complete list for that work center on that boat, **in CompanyCam's sequence** (top to bottom).
- `name` = the checklist item text; `done` = true if checked off in CompanyCam, false if not.
- Keep `remaining`, `completed_items`, `total_items` as they are (still used).
- This data already exists wherever `remaining`/`completed_items` are computed — you're just emitting the
  whole list with a `done` flag instead of only the unfinished names.

## Verify
`node --check <file>`, `pm2 restart boat-tracker`. Then in B.O.S.S → Assembly, tap a CompanyCam cell:
- **All** now lists every item (done ones checked/greyed, to-do ones empty) — count matches the header.
- **Done** lists the completed item names (no more "tracked in CompanyCam" note).
- **To do** unchanged.

No frontend change needed — B.O.S.S already uses `items` when present and falls back gracefully when absent.
