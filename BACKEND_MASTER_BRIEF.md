# MASTER BACKEND BRIEF — Bluewater B.O.S.S (run in order)

**To the Claude session on the server (`/var/www/boat-tracker`):** this file contains FOUR
separate tasks. Do them **one at a time, in order**. For EACH task:

1. **Back up first** — copy `server.js` to `backups/server.js.<timestamp>`, and note the DB is
   about to change (dump it if a table is being created).
2. Do ONLY what that task's section says. Change nothing else.
3. `node --check server.js`, then `pm2 restart boat-tracker`, then run that task's Verify steps.
4. Print a short summary of what you did and the verify result.
5. **Stop and wait** for the operator (Ken) to say "next" before starting the following task.

Do not batch the tasks together. Do not invent work not written here. If something looks like it
needs more than the brief describes, STOP and ask Ken rather than guessing.

Order: (1) CompanyCam diagnosis [read-only], (2) Issues/Rules, (3) Partial flag, (4) Custom-part delete.

---



<!-- ================================================================= -->
# ===== TASK 1 of 4 =====

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


<!-- ================================================================= -->
# ===== TASK 2 of 4 =====

# Backend brief — Issues/Questions (auto-flag rules + posted questions)

Paste into a Claude Code session **on the backend server** (`/var/www/boat-tracker`).
**Back up `server.js` and the database first. Additive only — do not modify existing tables/routes.**

Powers the new **Issues** view on the Shop Feed tab. Two kinds of issues:
- **auto** — flagged by rules over data we already store (rules below). They also
  **auto-close** the moment their condition stops being true.
- **question** — typed by any logged-in user from the app.

Resolving NEVER changes tracker data — it only hides the issue (snooze).

## 1. Table
```sql
CREATE TABLE IF NOT EXISTS issues (
  id           SERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,            -- 'auto' | 'question'
  rule_key     TEXT,                     -- one of the rule keys below; 'question' for posts
  target_key   TEXT UNIQUE,              -- dedupe key e.g. 'part_overdue:28224:Motors' (null for questions)
  boat_id      TEXT,
  source_tab   TEXT,                     -- 'Key Parts' | 'Schedule' | 'Lamination' | 'Finishing' | 'Assembly' | null
  title        TEXT NOT NULL,
  detail       TEXT,
  actor_name   TEXT,                     -- who posted (questions only)
  status       TEXT DEFAULT 'open',      -- 'open' | 'resolved'
  resolved_by  TEXT,                     -- username or 'auto' (condition cleared)
  resolved_at  TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ,              -- set on manual resolve of an auto issue
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

## 1b. Rule settings table (powers the Admin → Issue Rules screen)
Ken tunes rules from the app — each rule has an on/off switch and one number. Store:
```sql
CREATE TABLE IF NOT EXISTS issue_rule_settings (
  rule_key TEXT PRIMARY KEY,   -- part_overdue, parts_unordered, backorder_stale, stage_stuck,
                               -- flag_stale, lam_stalled, ugly_part, asap_idle, wc_quiet,
                               -- build_improvement, resolve_snooze
  enabled  BOOLEAN DEFAULT true,
  value    INT                 -- the rule's number (days/hours); NULL for toggle-only rules
);
```
Routes:
- `GET /api/issue-rules` (any logged-in) → all rows merged over the defaults below:
  `[{ rule_key, enabled, value }]` (return every known rule_key even if no row exists yet).
- `PUT /api/issue-rules/:key` (**Ops only**) → body `{ enabled, value }`, upsert.

The rule runner MUST read these settings on every pass: skip disabled rules, and use
`value` (falling back to the defaults below) as the threshold. `resolve_snooze.value`
(hours) replaces the RESOLVE_SNOOZE_HOURS constant.

## 2. Threshold DEFAULTS (used when issue_rule_settings has no row)
```js
const ISSUE_RULES = {
  OVERDUE_MIN_DAYS: 1,      // rule 1: days past expected_delivery
  UNORDERED_STAGE: 'Glass Shop', // rule 2: fires ONLY while the boat is exactly in this stage
  BACKORDER_STALE_DAYS: 7,  // rule 3
  STAGE_STUCK_DAYS: 14,     // rule 4 (ignore Backlog + Delivered)
  FLAG_STALE_DAYS: 7,       // rule 5
  LAM_STALL_DAYS: 7,        // rule 6
  UGLY_IDLE_DAYS: 3,        // rule 7
  ASAP_IDLE_DAYS: 3,        // rule 8
  WC_QUIET_DAYS: 4,         // rule 9
  RESOLVE_SNOOZE_HOURS: 24, // manual resolve hides an auto issue this long (comes back if still true)
};
```

## 3. Rule runner — `runIssueRules()`
Run on a 15-minute `setInterval` AND once at startup. For each rule, compute the set of
current violations, each with a stable `target_key`. Then:
- **Upsert**: violation with no open issue → INSERT (unless an issue with that target_key
  is resolved with `snooze_until > now()` — then skip).
- **Auto-close**: open auto issue whose target_key is NO LONGER violated → set
  status='resolved', resolved_by='auto', resolved_at=now().

The 9 rules (adapt table/column names to the real schema — verify with \d first):

1. `part_overdue` — part_status row: status='Ordered', expected_delivery not null,
   `now() - expected_delivery >= OVERDUE_MIN_DAYS`.
   target `part_overdue:<boat>:<part>`; title `"<part> overdue"`;
   detail `"expected <M/D>, N days past"`; tab Key Parts.
2. `parts_unordered` — boat whose production_schedule.global_status is EXACTLY
   UNORDERED_STAGE ('Glass Shop') having ≥1 STANDARD part with status 'Not Ordered'
   (or no row). ONE issue per boat: title `"N key parts not ordered"`, detail lists up
   to 5 part names. target `parts_unordered:<boat>`. (Advancing out of Glass Shop
   auto-closes it — per Ken, this alert is a Glass-Shop-stage check only.)
3. `backorder_stale` — flag_backordered=true AND expected_delivery IS NULL AND the flag has
   been on ≥ BACKORDER_STALE_DAYS. If there's no per-flag timestamp, use the row's
   updated_at as an approximation (note this in a comment).
   title `"<part> backordered, no new date"`; tab Key Parts.
4. `stage_stuck` — boat in the same global_status ≥ STAGE_STUCK_DAYS (status not Backlog /
   Delivered). Use the existing status-history table for "entered current stage at" (fall
   back to production_schedule.updated_at if needed). title `"Stuck in <stage> for N days"`;
   tab Schedule. target `stage_stuck:<boat>` — include the stage in target_key so
   advancing the boat auto-closes and a new stall in the next stage re-opens fresh:
   `stage_stuck:<boat>:<stage>`.
5. `flag_stale` — any production_schedule boat flag (flag_issue, flag_rework,
   flag_unsatisfactory, flag_missing_parts, flag_late_parts) true for ≥ FLAG_STALE_DAYS
   (updated_at approximation OK). One issue per boat+flag:
   `flag_stale:<boat>:<flag>`; title `"'<Flag label>' flag on for N days"`; tab Schedule.
6. `lam_stalled` — lamination_status: not na, start_date ≥ LAM_STALL_DAYS ago, end_date
   null, status not final ('Pulled', or 'Complete' for Glass Kit/Transducer Type).
   title `"<task> in lamination N days"`; tab Lamination. target `lam_stalled:<boat>:<task>`.
7. `ugly_part` — finishing_status: grade='ugly' AND status NOT IN ('In Progress','Complete')
   AND updated_at ≥ UGLY_IDLE_DAYS ago. title `"<task> arrived Ugly — needs decision"`;
   tab Finishing. target `ugly_part:<boat>:<task>`.
8. `asap_idle` — finishing_status: asap=true AND status != 'Complete' AND updated_at ≥
   ASAP_IDLE_DAYS ago. title `"ASAP: <task> not moving"`; tab Finishing.
   target `asap_idle:<boat>:<task>`.
9. `wc_quiet` — cc_progress: 0 < completed_items < total_items AND updated_at ≥
   WC_QUIET_DAYS ago (boat not Delivered). title `"<work center> quiet for N days"`;
   detail `"X / Y done, no activity"`; tab Assembly. target `wc_quiet:<boat>:<wc>`.
   Skip this rule gracefully if the CompanyCam tables don't exist yet.
   **EXCLUDE the "Build Improvements" work center** — it's a punch list, always partially
   done; rule 10 handles it instead.

10. `build_improvement` — the CompanyCam **"Build Improvements"** checklist is a punch
    list, so every INCOMPLETE item on it becomes its own issue. Use the cc_progress row
    whose work center name matches /build\s*improvement/i: for each title in its
    `remaining` array (boat not Delivered) → issue with
    target `build_improvement:<boat>:<slug(title)>`, title = the item text,
    source_tab `'Build Improvements'`. Auto-closes when the item is checked off in
    CompanyCam (its title leaves `remaining`). Skip gracefully if CompanyCam tables absent.
    (The frontend hides this work center from the Assembly grid — Issues is its home.)

Exclude boats with global_status='Delivered' from ALL rules.

## 4. Routes (existing auth; all logged-in users can read/post, resolve is Ops-only)
- `GET /api/issues` → open issues (status='open'), newest first, joined with
  boat_information for customer_name:
  `[{ id, kind, rule_key, boat_id, customer_name, source_tab, title, detail, actor_name, created_at }]`
- `POST /api/issues` (any logged-in user) → body `{ title, boat_id? }`. Insert kind='question',
  rule_key='question', actor_name = user display_name/username, source_tab null.
  Also (if cc_feed exists) insert a feed row: type `QUESTION_POSTED`,
  title `"Question: <first 80 chars>"`, actor_name — non-fatal try/catch.
- `PUT /api/issues/:id/resolve` (**Ops only**) → status='resolved', resolved_by=username,
  resolved_at=now(); if kind='auto', also snooze_until = now() + RESOLVE_SNOOZE_HOURS hours.

## 5. Finish
`node --check server.js`, `pm2 restart boat-tracker`. Verify:
- `runIssueRules()` ran at startup and `GET /api/issues` returns rows (there should be at
  least a few `part_overdue` from real data).
- POST a question as a non-Ops user → appears in GET; resolve as non-Ops → 403; as Ops → gone.
- Mark an overdue part Received on the site → within one rule-run its issue auto-closes.

Then tell Ken — he'll merge the `shop-feed-issues` frontend branch.

## Future (do NOT build now — context for design choices)
The mobile employee app will make posting issues/questions (with photos) a primary
feature; photos will likely ride via CompanyCam. The `issues` table above is intentionally
the foundation for that.


<!-- ================================================================= -->
# ===== TASK 3 of 4 =====

# Backend brief — Key Parts "Partial" flag

Tiny additive change. Paste into a Claude Code session **on the backend server**
(`/var/www/boat-tracker`). **Back up `server.js` first. Change nothing else.**

Adds one boolean flag column to the parts table so the new **Partial** flag (some of a
multi-item order has arrived) persists — exactly like the existing `flag_backordered` /
`flag_unsatisfactory` flags.

## 1. Migration
```sql
ALTER TABLE part_status ADD COLUMN IF NOT EXISTS flag_partial BOOLEAN DEFAULT false;
```

## 2. `GET /api/parts`
Return `flag_partial` on each part row (add it to the SELECT if columns are listed
explicitly; if it's `SELECT *`, no change needed).

## 3. `PUT /api/parts/:boatId/:partName`
Add `flag_partial` to the list of columns the handler will write — right alongside the
existing `flag_late` / `flag_backordered` / `flag_unsatisfactory`. For example, if there's a
loop over allowed keys:
```js
for (const k of ['status','is_custom','description','expected_delivery','actual_delivery',
                 'flag_late','flag_backordered','flag_partial','flag_unsatisfactory'])
  if (k in b) put(k, b[k] === '' ? null : b[k]);
```
(Match whatever the existing flags do — same permission gate, same write path.)

### Optional: Shop Feed
If the CompanyCam/feed work is in place, you can also log it: when `flag_partial` goes
false→true, insert a `cc_feed` row (type `PART_FLAGGED`, title `"<part> flagged Partial"`),
same as the other Key Parts flags. Skip if the feed isn't built yet.

## 4. Finish
`pm2 restart boat-tracker`. Verify: toggle **Partial** on a part in Key Parts → refresh →
the half-circle icon persists.

## Note
The frontend degrades gracefully — if this ships before the column exists, the Partial flag
just won't "stick" on refresh. Nothing breaks. So run this whenever; then tell Ken and he
merges the `keyparts-partial-flag` frontend branch.


<!-- ================================================================= -->
# ===== TASK 4 of 4 =====

# Backend add-on — DELETE a custom part from a boat

Paste this into a Claude Code session running **on the backend server** (`/var/www/boat-tracker`),
the same way you ran the last one. It's small, additive, and safe.

## What to add
A new **`DELETE /api/parts/:boatId/:partName`** route (Ops-only). The frontend calls it when you use
the **←** arrow to take a custom part off a boat.

## Rules
- Ops-only (`requireRole('ops')`).
- It deletes **only that boat's part row** (from the `part_status` table).
- Do **NOT** touch `custom_part_names` — the name stays in the master history so it can be re-added
  to another boat later.
- Back up `server.js` first; keep existing code style; change nothing else.

## Implementation (adapt to your existing style)
```js
app.delete('/api/parts/:boatId/:partName', requireRole('ops'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM part_status WHERE boat_id = $1 AND part_name = $2',
      [req.params.boatId, req.params.partName]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'delete failed' }); }
});
```

## Finish
- `pm2 restart boat-tracker`
- Verify: on the live site, add a custom part to a boat, then use ← to remove it and refresh — it
  should stay gone.

Until this is added, everything else in the custom-parts feature works; only the **← remove** won't
persist (it'll show a heads-up message).
