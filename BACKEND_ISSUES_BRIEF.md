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

## 2. Thresholds (one constants block at the top — Ken will tune these later)
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
