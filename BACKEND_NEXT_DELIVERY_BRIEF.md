# Backend brief (small): "Next build slot" dates for the online configurator

Ken sets the estimated delivery a NEW order would get, by hand, on the Timeline tab
(he adjusts the schedule almost daily, so this is the live number). The online boat
builder (https://bluewater-configurator.vercel.app) shows it to buyers as
"Estimated delivery". Two dates:

| group   | covers              |
|---------|---------------------|
| `small` | 23T, 25T and 2850   |
| `36`    | 36                  |

Frontend is done: `src/NextDeliveryRow.jsx`, shown at the top of the Timeline tab.

Back up server.js first, restart pm2, confirm `/api/health` 200.

## Storage
One small table (create it the same way the other timeline tables are created):

```sql
CREATE TABLE IF NOT EXISTS next_delivery (
  grp        TEXT PRIMARY KEY CHECK (grp IN ('small', '36')),
  date       DATE,                -- null = not set
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
```

## Routes

### `GET /api/public/next-delivery`, NO auth
The only thing it returns is the two dates. This is deliberate: the configurator is a
public page with no login.

```json
{ "small": "2027-03-15", "36": null, "updatedAt": "2026-09-28T13:02:11Z" }
```

- Dates as `YYYY-MM-DD` strings (no time zone shifting), `null` when unset.
- `updatedAt` = the latest `updated_at` of the two rows.
- **CORS for this route only:** allow `GET` from
  `https://bluewater-configurator.vercel.app` and `http://localhost:3100`. Do NOT use
  `*`, and do not widen CORS for any other route (the 2026-09-21 security audit flagged
  the `|| '*'` fallback).
- `Cache-Control: public, max-age=300` is fine; a 5-minute lag is acceptable.
- Return nothing else: no boat names, hulls or customers.

### `PUT /api/timeline/next-delivery`, `requireEdit('gantt')`
Body: `{ "group": "small" | "36", "date": "YYYY-MM-DD" | null }`
- Validate `group`, and `date` as a real calendar date or null → 400 otherwise.
- Upsert the row, set `updated_at = now()`, `updated_by` = the user.
- Return the same shape as the GET.
- Gate on `requireEdit('gantt')`, same as the other Timeline writes (see
  BACKEND_TIMELINE_PERM_BRIEF.md).

## Verify
- `curl https://tracker.bluewatersportfishingboats.com/api/public/next-delivery` with no
  token returns 200 and the JSON above.
- The same request with `Origin: https://bluewater-configurator.vercel.app` returns
  `Access-Control-Allow-Origin` set to that origin. With any other origin, no CORS header.
- PUT as a gantt=edit user returns 200. As gantt=view it returns 403. With no token it
  returns 401.
- On the Timeline tab the row loads, and changing a date survives a page reload.

## Report back
The table was created, both routes are live, and the CORS header appears only on the
public GET.
