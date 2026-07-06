# Backend brief — B.O.S.S Timeline (self-maintaining production Gantt)

Paste into a Claude Code session **on the backend server** (`/var/www/boat-tracker`).
**Back up `server.js` AND dump the database first. Additive only — do not modify existing tables.**
This is the biggest brief so far — work through it top to bottom; verify each numbered part
before moving on. Full design rationale lives in TIMELINE_SPEC.md in the frontend repo; this
brief is self-contained.

## What it builds
A projection engine: learns how long each production stage really takes (per model) from the
existing stage-history data, projects every boat's remaining schedule from today's actual state,
and cascades the future queue through the shop's real constraints. The frontend Gantt just draws
what this engine serves. Also: a one-time import of Ken's monday.com plan (JSON embedded at the
bottom), two Issue-rule changes, and target-delivery dates.

## 1. Tables (additive)
```sql
CREATE TABLE IF NOT EXISTS timeline_targets (   -- customer-promise delivery date per boat
  boat_id TEXT PRIMARY KEY,
  target_date DATE NOT NULL,
  set_by TEXT, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS timeline_pins (      -- Ken's manual overrides
  id SERIAL PRIMARY KEY,
  group_key TEXT NOT NULL,       -- boat_id, or 'slot:<id>' for placeholder slots
  stage TEXT NOT NULL,           -- 'Glass Shop' | 'Back Line' | 'Front Line' | 'QC' | custom label
  kind TEXT NOT NULL DEFAULT 'pin',  -- 'pin' (fixed dates) | 'hold' (boat waits until end_date)
  start_date DATE, end_date DATE NOT NULL,
  created_by TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS timeline_slots (     -- placeholder plan groups (future boats)
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,           -- e.g. '28229 - Open'
  model TEXT,                    -- 23T | 25T | 2850 | 36 (nullable)
  queue_pos REAL NOT NULL DEFAULT 999,  -- interleaves with production_schedule.sequence_number
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stage_norm_seeds (   -- fallback durations until history exists
  model TEXT NOT NULL, stage TEXT NOT NULL, days INT NOT NULL,
  PRIMARY KEY (model, stage)
);
CREATE TABLE IF NOT EXISTS timeline_blackouts ( -- shop-closed ranges (holidays, boat shows)
  id SERIAL PRIMARY KEY,
  start_date DATE NOT NULL, end_date DATE NOT NULL, label TEXT
);
```
Settings (reuse the existing `issue_rule_settings` table, new keys):
`tl_workload_per_items` (default 5 — one day per this many extra checklist items),
`tl_workload_cap` (default 10 — max ± days from workload).

## 2. The canonical stages + work-center mapping
Stages, in order: **Glass Shop → Back Line → Front Line → QC**. (Backlog/Pre-Production are
"not started yet"; Delivered is terminal.) Map production_schedule.global_status:
Backlog/Pre-Production = queued; Glass Shop/Back Line/Front Line/QC = that stage; Delivered = done.

CompanyCam work-center → stage mapping (name regex, case-insensitive):
`/backline/` → Back Line · `/front/` → Front Line · `/qc|quality/` → QC ·
`/console/` → Front Line · ignore `/build improvement/`. Glass Shop has no CompanyCam checklist —
its progress source is the app's own `lamination_status` (done = tasks at final status
'Pulled'/'Complete', excluding na, same rollup the Assembly board uses).

## 3. Norms (how long a stage takes, per model)
For each model × stage, in priority order:
1. **History**: median duration in calendar days over the most recent ≤8 completed instances of
   that stage for that model, from the existing stage-history table (the one that records when
   each boat entered each status — inspect the schema first; durations = next-stage entry minus
   this-stage entry, using the LATEST entry per stage if a boat bounced back and forth).
   Subtract any blackout days that fell inside each sample. Require ≥3 samples.
2. **Seeds** from `stage_norm_seeds` (populated by the import, §8).
3. Default 14 days.
Expose all norms (+ source + sample count) in the GET payload.

## 4. Workload adjustment
For each boat × stage with a mapped progress source: `total_items` for that boat/stage vs the
**median total_items for its model** at that stage (across boats that have the checklist).
`adjust_days = round((boat_items − model_median) / tl_workload_per_items)`, clamped to
±tl_workload_cap. Applied to projected durations only (never to actuals). If the boat isn't
linked to CompanyCam (or Glass Shop: has no lamination rows), adjustment = 0.
Produce a human note when nonzero: `"+2d (10 extra checklist items)"`.

## 5. The projector
A pure function `project(queueOrder) → payload` (queueOrder = merged list of boat_ids and
'slot:<id>' keys). Used by GET (saved order), POST preview (draft order), and the Issues rule run.

Merged build order (saved) = production_schedule.sequence_number for boats, `queue_pos` for
slots, interleaved numerically (slots imported with fractional positions between boats).

Walk boats/slots in queue order through a day-by-day greedy simulation:
- **Actual segments**: for stages the boat already completed — real dates from history (kind
  'actual'). Current stage: started at its real date; projected end = start + norm + workload
  adjustment − already-elapsed protection: if that end is already past, use today + 2 days
  (kind 'current', include fill_pct + fill_note from §2 sources, e.g. 21/42 → 50).
- **Future segments** (kind 'projected'): chained after the previous segment, subject to:
  - **Glass Shop capacity: one boat per model at a time** (one mold set per model).
  - **THE 36 RULE**: while a 36 occupies Glass Shop (actual or projected), NO other boat may
    START Glass Shop. (Don't artificially extend in-progress boats — re-anchoring to actuals
    self-corrects.)
  - Back Line / Front Line / QC: no capacity limit.
  - **Blackouts**: no stage may start inside one, and any segment spanning one is extended by
    the blackout's length.
  - **Pins** (kind 'pinned'): fixed dates; everything else flows around them. **Holds** (kind
    'hold'): the boat's next stage cannot start before the hold's end_date; render the hold as
    its own segment.
- **Gaps**: when a segment starts later than the previous one ended, set the next segment's
  `wait_before_days` + `wait_reason` ('mold busy' | '36 in glass shop' | 'blackout' | 'hold').
- **Slots**: project the standard 4 stages using their model's norms (model null → global
  default); they respect the same capacity rules. All segments 'projected'.
- Per group: `projected_end` (last segment end) and `behind_days` = projected_end − target_date
  (positive = behind; null without a target).
- Skip Delivered boats entirely.

## 6. Endpoints
- `GET /api/timeline` (any logged-in) → the computed payload:
```json
{ "today": "YYYY-MM-DD",
  "settings": { "tl_workload_per_items": 5, "tl_workload_cap": 10 },
  "norms": [ { "model": "...", "stage": "...", "days": 12, "source": "history|seed|default", "samples": 5 } ],
  "blackouts": [ { "id": 1, "start_date": "...", "end_date": "...", "label": "..." } ],
  "groups": [ {
      "key": "28224" , "kind": "boat", "title": "28224 · Morgigno",
      "model": "2850", "hull_color": "...", "customer_name": "...",
      "queue_pos": 3, "status": "Back Line",
      "target_date": "2026-09-05", "projected_end": "2026-09-11", "behind_days": 6,
      "segments": [ {
          "name": "Glass Shop", "start": "...", "end": "...",
          "kind": "actual|current|projected|pinned|hold",
          "fill_pct": 50, "fill_note": "21/42 items",
          "duration_note": "19d norm +2d (10 extra items)",
          "wait_before_days": 3, "wait_reason": "mold busy", "pin_id": 4 } ] } ] }
```
- `POST /api/timeline/preview` (any logged-in) body `{ order: ["28224", "slot:2", ...] }` →
  same payload computed under that order. **Persists nothing.**
- `PUT /api/timeline/order` (**Ops**) body `{ order: [...] }` → boats: renumber
  production_schedule.sequence_number in the given relative order (delivered boats keep their
  positions at the end, same as the schedule tab's reorder); slots: renumber queue_pos
  interleaved to match.
- `PUT /api/timeline/target/:boatId` (**Ops**) `{ target_date }` (null clears) → upsert/delete;
  also insert a cc_feed row (type `TARGET_CHANGED`, title `"Target delivery → <M/D> "` or
  `"Target delivery cleared"`, actor_name) — non-fatal try/catch.
- `POST /api/timeline/pins` (**Ops**) `{ group_key, stage, kind, start_date, end_date }` /
  `DELETE /api/timeline/pins/:id`.
- `POST /api/timeline/slots` (**Ops**) `{ title, model }` (queue_pos = end) /
  `DELETE /api/timeline/slots/:id` (also deletes its pins).
- `POST /api/timeline/blackouts` (**Ops**) `{ start_date, end_date, label }` /
  `DELETE /api/timeline/blackouts/:id`.
- `PUT /api/timeline/settings` (**Ops**) `{ tl_workload_per_items?, tl_workload_cap? }`.

## 7. Issue-rule changes (in the existing rule runner)
- **REPLACE** `stage_stuck` with **`stage_over_norm`** (default value 3): flag when a boat's
  current stage has run ≥ (its model norm + workload adjustment + X) days. Migrate the old
  setting row: `UPDATE issue_rule_settings SET rule_key='stage_over_norm', value=3 WHERE
  rule_key='stage_stuck';` (keep enabled state), and auto-resolve any still-open issues with
  rule_key='stage_stuck' (resolved_by='auto', the new rule re-raises them if warranted).
  Title: `"<stage> N days over normal"`, source_tab 'Schedule'.
- **NEW** `behind_target` (default 5): projected_end ≥ target_date + X days. Title:
  `"Projected N days past target delivery"`, source_tab 'Schedule',
  target `behind_target:<boat>`. Auto-closes when back within X.
- Both use the projector — compute once per rule run with the saved order.

## 8. One-time import (Ken's monday.com plan — JSON at the bottom of this file)
1. **Seeds**: for each model (23T, 25T, 2850 — from group titles), median planned duration per
   mapped stage across its groups' tasks (map task names with the same regexes as §2; 'Glass
   Shop'→Glass Shop etc.; ignore unmapped custom tasks). Insert into stage_norm_seeds.
   **36 override: insert flat 21 days for all four stages** (Ken's call — new model, custom
   monday tasks unreliable).
2. **Real-boat matching**: a group matches a boat if the title's leading token equals a
   boat_id, OR the title contains the boat_id, OR the part after " - " matches customer_name
   (case-insensitive contains). For matched ACTIVE boats: set `timeline_targets` = the group's
   latest task end date. Do NOT import their stage dates (projection uses reality).
3. **Slots**: unmatched groups (the `*0XX`/Open/future ones) → timeline_slots (guess model from
   the title's leading digits/letters: 23T/25T/2850(28xxx)/36), queue_pos = fractional positions
   after the last real boat in the order they appear; their mapped tasks → timeline_pins
   (kind 'pin') so the imported plan draws until Ken re-drags.
4. Print a report: seeds computed, boats matched (+targets set), slots created, anything
   unmatched/skipped — for Ken to review.

## 9. Ask the B.O.S.S integration
In the /api/ask data gather, add per active boat: current stage, projected_end, target_date,
behind_days (from the projector). Keep it compact.

## 10. Verify
- `node --check server.js`, `pm2 restart boat-tracker`, logs clean.
- GET /api/timeline returns groups for every active boat + imported slots; a boat mid-stage has
  kind 'current' with a plausible fill_pct; norms list shows seed values (history until enough
  samples accrue will mostly be seeds — fine).
- POST preview with two boats swapped → different projected dates, database unchanged.
- PUT order swaps sequence_numbers (check the Production Schedule tab agrees).
- Set a target in the past → behind_days positive; run the rules → a `behind_target` issue.
- Blackout spanning next week → projected segments jump over it.
- Then tell Ken — the frontend Timeline tab lights up on its own.

## MONDAY IMPORT DATA (parsed from Ken's export — 25 groups, 116 tasks)
```json
[
 {
  "title": "36010 - Parbhoo",
  "tasks": [
   {
    "name": "Glass Shop - Stringers",
    "start": "2025-05-15",
    "end": "2025-05-19"
   },
   {
    "name": "Backline - Stringers",
    "start": "2025-05-19",
    "end": "2026-01-12"
   },
   {
    "name": "Liner",
    "start": "2026-01-13",
    "end": "2026-02-06"
   },
   {
    "name": "Ring",
    "start": "2026-02-09",
    "end": "2026-04-22"
   }
  ]
 },
 {
  "title": "DZV5T043C626 - Svoboda",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-03-30",
    "end": "2026-04-07"
   },
   {
    "name": "Backline",
    "start": "2026-04-13",
    "end": "2026-05-04"
   },
   {
    "name": "Front Line",
    "start": "2026-05-05",
    "end": "2026-05-18"
   },
   {
    "name": "QC",
    "start": "2026-05-19",
    "end": "2026-07-10"
   }
  ]
 },
 {
  "title": "DZV5T046E626 - Aloha/Monahans",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-04-14",
    "end": "2026-04-22"
   },
   {
    "name": "Sitting",
    "start": "2026-05-04",
    "end": "2026-05-04"
   },
   {
    "name": "Backline",
    "start": "2026-05-05",
    "end": "2026-05-15"
   },
   {
    "name": "Front Line",
    "start": "2026-05-19",
    "end": "2026-06-01"
   },
   {
    "name": "QC",
    "start": "2026-06-02",
    "end": "2026-06-09"
   }
  ]
 },
 {
  "title": "28224 - Morgigno",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-04-27",
    "end": "2026-05-11"
   },
   {
    "name": "Backline",
    "start": "2026-05-18",
    "end": "2026-06-08"
   },
   {
    "name": "Front Line",
    "start": "2026-06-09",
    "end": "2026-06-19"
   },
   {
    "name": "QC",
    "start": "2026-06-22",
    "end": "2026-07-07"
   }
  ]
 },
 {
  "title": "23T098 - Hasaotes",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-05-19",
    "end": "2026-05-25"
   },
   {
    "name": "Backline",
    "start": "2026-06-08",
    "end": "2026-06-23"
   },
   {
    "name": "Front Line",
    "start": "2026-06-24",
    "end": "2026-07-07"
   },
   {
    "name": "QC",
    "start": "2026-07-08",
    "end": "2026-07-21"
   }
  ]
 },
 {
  "title": "25T047 - Oksas",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-05-25",
    "end": "2026-06-09"
   },
   {
    "name": "Backline",
    "start": "2026-06-18",
    "end": "2026-07-03"
   },
   {
    "name": "Front Line",
    "start": "2026-07-06",
    "end": "2026-07-17"
   },
   {
    "name": "QC",
    "start": "2026-07-20",
    "end": "2026-07-24"
   }
  ]
 },
 {
  "title": "28225 - Trey (7 Sports)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-06-24",
    "end": "2026-07-02"
   },
   {
    "name": "Backline",
    "start": "2026-07-03",
    "end": "2026-07-23"
   },
   {
    "name": "Front Line",
    "start": "2026-07-24",
    "end": "2026-08-13"
   },
   {
    "name": "QC",
    "start": "2026-08-14",
    "end": "2026-08-27"
   }
  ]
 },
 {
  "title": "36011 - Landshark",
  "tasks": [
   {
    "name": "Rig Stringer Grid",
    "start": "2026-07-06",
    "end": "2026-07-17"
   },
   {
    "name": "Plexus Grid To Hull",
    "start": "2026-07-20",
    "end": "2026-07-24"
   },
   {
    "name": "Rig Hull",
    "start": "2026-08-17",
    "end": "2026-09-04"
   },
   {
    "name": "Build Stringer Grid for new boat (LAM)",
    "start": "2026-07-13",
    "end": "2026-07-17"
   },
   {
    "name": "Build Liner (LAM)",
    "start": "2026-07-27",
    "end": "2026-07-31"
   },
   {
    "name": "Build Ring (LAM)",
    "start": "2026-07-27",
    "end": "2026-07-31"
   },
   {
    "name": "Build Small Parts (LAM)",
    "start": "2026-07-20",
    "end": "2026-07-24"
   },
   {
    "name": "Build Hull (LAM)",
    "start": "2026-06-29",
    "end": "2026-07-03"
   },
   {
    "name": "Wire Console Face",
    "start": "2026-07-27",
    "end": "2026-07-31"
   },
   {
    "name": "Prep and Install Liner",
    "start": "2026-08-03",
    "end": "2026-08-14"
   },
   {
    "name": "Prep and Install Ring",
    "start": "2026-08-31",
    "end": "2026-09-04"
   },
   {
    "name": "Install Motors",
    "start": "2026-08-31",
    "end": "2026-09-02"
   },
   {
    "name": "Rig Console",
    "start": "2026-08-31",
    "end": "2026-09-11"
   },
   {
    "name": "Rig Hard Top",
    "start": "2026-08-31",
    "end": "2026-09-11"
   },
   {
    "name": "Install Legset",
    "start": "2026-09-14",
    "end": "2026-09-18"
   },
   {
    "name": "Final Assembly / Quality Control",
    "start": "2026-09-14",
    "end": "2026-09-25"
   }
  ]
 },
 {
  "title": "25T048 - Stanyek (Moriches)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-06-22",
    "end": "2026-07-03"
   },
   {
    "name": "Backline",
    "start": "2026-07-08",
    "end": "2026-07-21"
   },
   {
    "name": "Front Line",
    "start": "2026-07-22",
    "end": "2026-08-04"
   },
   {
    "name": "QC",
    "start": "2026-08-05",
    "end": "2026-08-18"
   }
  ]
 },
 {
  "title": "25T049 - PCY (FLIB 10.15)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-07-13",
    "end": "2026-07-17"
   },
   {
    "name": "Backline",
    "start": "2026-07-22",
    "end": "2026-08-04"
   },
   {
    "name": "Front Line",
    "start": "2026-08-05",
    "end": "2026-08-18"
   },
   {
    "name": "QC",
    "start": "2026-08-19",
    "end": "2026-09-01"
   }
  ]
 },
 {
  "title": "28226 - PCY (FLIB 10.15)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-07-06",
    "end": "2026-07-10"
   },
   {
    "name": "Backline",
    "start": "2026-08-03",
    "end": "2026-08-14"
   },
   {
    "name": "Front Line",
    "start": "2026-08-17",
    "end": "2026-09-04"
   },
   {
    "name": "QC",
    "start": "2026-09-07",
    "end": "2026-09-18"
   }
  ]
 },
 {
  "title": "23T097 - PCY (FLIB 10.15)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-07-06",
    "end": "2026-07-13"
   },
   {
    "name": "Backline",
    "start": "2026-08-17",
    "end": "2026-08-28"
   },
   {
    "name": "Front Line",
    "start": "2026-08-31",
    "end": "2026-09-11"
   },
   {
    "name": "QC",
    "start": "2026-09-14",
    "end": "2026-09-25"
   }
  ]
 },
 {
  "title": "28227 - 7 Sports (stock order)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-08-17",
    "end": "2026-08-28"
   },
   {
    "name": "Backline",
    "start": "2026-08-31",
    "end": "2026-09-18"
   },
   {
    "name": "Front Line",
    "start": "2026-09-21",
    "end": "2026-10-09"
   },
   {
    "name": "QC",
    "start": "2026-10-12",
    "end": "2026-10-23"
   }
  ]
 },
 {
  "title": "23T0XX - Monahans (Newport 9.3)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-08-31",
    "end": "2026-09-11"
   },
   {
    "name": "Backline",
    "start": "2026-09-14",
    "end": "2026-09-25"
   },
   {
    "name": "Front Line",
    "start": "2026-09-28",
    "end": "2026-10-09"
   },
   {
    "name": "QC",
    "start": "2026-10-12",
    "end": "2026-10-23"
   }
  ]
 },
 {
  "title": "28228 - Monahan",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-09-14",
    "end": "2026-09-25"
   },
   {
    "name": "Backline",
    "start": "2026-09-28",
    "end": "2026-10-16"
   },
   {
    "name": "Front Line",
    "start": "2026-10-19",
    "end": "2026-11-06"
   },
   {
    "name": "QC",
    "start": "2026-11-09",
    "end": "2026-11-20"
   }
  ]
 },
 {
  "title": "25T0XX - Open (Shlomi)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-09-28",
    "end": "2026-10-09"
   },
   {
    "name": "Backline",
    "start": "2026-10-12",
    "end": "2026-10-23"
   },
   {
    "name": "Front Line",
    "start": "2026-10-26",
    "end": "2026-11-06"
   },
   {
    "name": "QC",
    "start": "2026-11-09",
    "end": "2026-11-20"
   }
  ]
 },
 {
  "title": "23T098 - PCY (Re-Stock)",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-10-12",
    "end": "2026-10-23"
   },
   {
    "name": "Backline",
    "start": "2026-11-09",
    "end": "2026-11-20"
   },
   {
    "name": "Front Line",
    "start": "2026-11-23",
    "end": "2026-12-04"
   },
   {
    "name": "QC",
    "start": "2026-12-07",
    "end": "2026-12-18"
   }
  ]
 },
 {
  "title": "25T053 - Margieux",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-10-26",
    "end": "2026-11-06"
   },
   {
    "name": "Backline",
    "start": "2026-11-09",
    "end": "2026-11-20"
   },
   {
    "name": "Front Line",
    "start": "2026-11-23",
    "end": "2026-12-04"
   },
   {
    "name": "QC",
    "start": "2026-12-07",
    "end": "2026-12-18"
   }
  ]
 },
 {
  "title": "25T0XX - AC Boat Show - Feb 10",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-11-09",
    "end": "2026-11-20"
   },
   {
    "name": "Backline",
    "start": "2026-11-23",
    "end": "2026-12-04"
   },
   {
    "name": "Front Line",
    "start": "2026-12-07",
    "end": "2026-12-18"
   },
   {
    "name": "QC",
    "start": "2026-12-21",
    "end": "2027-01-01"
   }
  ]
 },
 {
  "title": "25T0XX - Open",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-11-23",
    "end": "2026-12-04"
   },
   {
    "name": "Backline",
    "start": "2026-12-07",
    "end": "2026-12-18"
   },
   {
    "name": "Front Line",
    "start": "2026-12-21",
    "end": "2027-01-01"
   },
   {
    "name": "QC",
    "start": "2027-01-04",
    "end": "2027-01-15"
   }
  ]
 },
 {
  "title": "28229 - Open",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-12-07",
    "end": "2026-12-18"
   },
   {
    "name": "Backline",
    "start": "2026-12-21",
    "end": "2027-01-08"
   },
   {
    "name": "Front Line",
    "start": "2027-01-11",
    "end": "2027-01-29"
   },
   {
    "name": "QC",
    "start": "2027-02-01",
    "end": "2027-02-12"
   }
  ]
 },
 {
  "title": "25T0XX - Open",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2026-12-21",
    "end": "2027-01-01"
   },
   {
    "name": "Backline",
    "start": "2027-01-04",
    "end": "2027-01-15"
   },
   {
    "name": "Front Line",
    "start": "2027-01-18",
    "end": "2027-01-29"
   },
   {
    "name": "QC",
    "start": "2027-02-01",
    "end": "2027-02-12"
   }
  ]
 },
 {
  "title": "36012 - PCY/7sports or Customer",
  "tasks": [
   {
    "name": "Glass Shop - Liner / Ring",
    "start": "2026-10-23",
    "end": "2026-10-29"
   },
   {
    "name": "Lamination - Stringers",
    "start": "2026-09-09",
    "end": "2026-09-15"
   },
   {
    "name": "Backline - Stringers",
    "start": "2026-09-16",
    "end": "2026-10-14"
   },
   {
    "name": "Lamination - Hull / Console",
    "start": "2026-10-12",
    "end": "2026-10-16"
   },
   {
    "name": "Final Assembly",
    "start": "2026-10-30",
    "end": "2026-12-10"
   },
   {
    "name": "Lamination - Liner / Hard Top",
    "start": "2026-10-16",
    "end": "2026-10-22"
   },
   {
    "name": "QC",
    "start": "2026-12-16",
    "end": "2026-12-29"
   }
  ]
 },
 {
  "title": "23T099 - PCY (Re-Stock) / Open",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2027-01-04",
    "end": "2027-01-15"
   },
   {
    "name": "Backline",
    "start": "2027-01-18",
    "end": "2027-01-29"
   },
   {
    "name": "Front Line",
    "start": "2027-02-01",
    "end": "2027-02-12"
   },
   {
    "name": "QC",
    "start": "2027-02-15",
    "end": "2027-02-26"
   }
  ]
 },
 {
  "title": "282XX - Tackle2ThePeople",
  "tasks": [
   {
    "name": "Glass Shop",
    "start": "2027-01-18",
    "end": "2027-01-29"
   },
   {
    "name": "Backline",
    "start": "2027-02-01",
    "end": "2027-02-19"
   },
   {
    "name": "Front Line",
    "start": "2027-02-22",
    "end": "2027-03-12"
   },
   {
    "name": "QC",
    "start": "2027-03-15",
    "end": "2027-03-26"
   }
  ]
 }
]```
