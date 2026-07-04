# Backend add-on — list resolved issues

Small follow-up to the Issues backend you already built. Paste into a Claude Code session on the
server (`/var/www/boat-tracker`). **Back up `server.js` first. One new read-only route, nothing else.**

The frontend now has a **Resolved** view on the Shop Feed's Issues list. It needs an endpoint to
fetch recently-resolved issues. The `issues` table already stores resolved rows (status='resolved',
`resolved_by`, `resolved_at`) — this just reads them back.

## Route: `GET /api/issues/resolved` (any logged-in user; requireAuth)
Query param `days` (default 30, cap at 365). Return issues where `status = 'resolved'` AND
`resolved_at >= now() - (days || 30) * interval '1 day'`, **newest resolved_at first**, limit ~200,
joined with `boat_information` for `customer_name`:

```json
[{ "id": ..., "kind": "...", "rule_key": "...", "boat_id": "...", "customer_name": "...",
   "source_tab": "...", "title": "...", "detail": "...",
   "resolved_by": "...", "resolved_at": "..." }]
```

Same row shape as `GET /api/issues`, just with `resolved_by` / `resolved_at` added and filtered to
resolved. (Register it BEFORE any `/api/issues/:id` param route so "resolved" isn't captured as an id.)

## Verify
- `GET /api/issues/resolved` returns the issues you've resolved (empty array is fine if none yet).
- Resolve an open issue on the site, then open the **Resolved** view → it appears with "resolved by
  <you> · just now".
- `node --check server.js`, `pm2 restart boat-tracker`, logs clean.

Then tell Ken — frontend is already merged/waiting.
