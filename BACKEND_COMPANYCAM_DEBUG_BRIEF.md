# Backend brief — debug CompanyCam webhooks not reaching Shop Feed

Paste into a Claude Code session **on the backend server** (`/var/www/boat-tracker`).
**Read-only diagnosis first — change nothing until we know the cause. Back up server.js before any fix.**

**Symptom:** checking a checklist item off in CompanyCam does NOT show up on the Shop Feed
(no `cc_feed` row is created). The Assembly board counts may or may not update.

Work through these in order and report what you find at each step.

## 1. Was the webhook ever registered?
CompanyCam only pushes events if we registered a webhook subscription with it.
- Check `.env` for `COMPANYCAM_WEBHOOK_TOKEN` — if it's missing/blank, registration never
  completed. That's very likely the root cause (the column-order session was interrupted).
- Ask CompanyCam what webhooks exist for our account:
  ```
  curl -s https://api.companycam.com/v2/webhooks \
    -H "Authorization: Bearer $COMPANYCAM_TOKEN" | jq
  ```
  (load COMPANYCAM_TOKEN from .env first). Report the JSON.
  - Expect ONE webhook with `url` = `https://tracker.bluewatersportfishingboats.com/api/companycam/webhook`
    and scopes including `task.completed`, `todo_list.created`, `todo_list.completed`, `photo.created`,
    and `enabled: true`.
  - If the list is EMPTY or the url is wrong or `enabled` is false → that's the problem.

## 2. Is CompanyCam actually calling us?
```
pm2 logs boat-tracker --lines 200 --nostream | grep -i "companycam/webhook"
```
- No hits at all after you check items off → CompanyCam isn't sending (webhook missing/disabled —
  see step 1) OR can't reach us.
- Hits present but followed by 401 / signature errors → signature verification is rejecting real
  events (secret mismatch between what's registered and `COMPANYCAM_WEBHOOK_TOKEN` in .env).
- Hits present, 200, but "unknown project" logged → the item's project isn't linked (step 3).

## 3. Is that boat linked to its CompanyCam project?
```
psql "$DATABASE_URL" -c "SELECT boat_id, project_name, linked_by FROM cc_links ORDER BY boat_id;"
```
(or the project's env creds). Confirm the boat you tested has a row. If not, run the autoLink /
manual-link path so its `project_id` is recorded — unlinked projects' events are ignored by design.

## 4. Reachability sanity check (from your laptop, not the server)
```
curl -i -X POST https://tracker.bluewatersportfishingboats.com/api/companycam/webhook -d '{}'
```
Expect a fast response (401/400 is fine — it means the route is live and reachable). A timeout or
connection error means Nginx/HTTPS isn't routing to the app — different problem.

## The likely fix
If step 1 shows no webhook (or no `COMPANYCAM_WEBHOOK_TOKEN`): **register it now.** Call the same
`POST /v2/webhooks` the integration already has code for (companycam.js registration function) with:
- url `https://tracker.bluewatersportfishingboats.com/api/companycam/webhook`
- scopes: `task.completed`, `todo_list.created`, `todo_list.completed`, `photo.created`
Save the returned webhook **token** to `.env` as `COMPANYCAM_WEBHOOK_TOKEN`, `pm2 restart boat-tracker`.

## Verify the fix
Check an item off on a phone in CompanyCam → within a few seconds a `cc_feed` row appears:
```
psql "$DATABASE_URL" -c "SELECT type, title, boat_id, created_at FROM cc_feed ORDER BY created_at DESC LIMIT 5;"
```
→ it shows on the Shop Feed on its next 60-second refresh. Report back to Ken.
