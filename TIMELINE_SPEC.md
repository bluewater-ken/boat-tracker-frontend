# B.O.S.S Timeline — Spec v2 (decisions locked with Ken, 2026-07-05)

## What it is
A monday.com-style production Gantt that **maintains itself**. B.O.S.S learns how long each stage
really takes (per model), projects every boat's remaining schedule from *today's actual state*, and
cascades the future pipeline automatically through the shop's real constraints (molds, the 36
effect). Ken adjusts only where he knows better — pins, holds, targets — and the forecast re-flows
around him. Replaces monday.com after a one-time import.

---

## 1. The prediction engine ("how long does a stage take?")

Per **model** (23T, 25T, 2850, 36) × **stage** (Glass Shop, Back Line, Front Line, QC), duration
comes from the best available source:

1. **Actual history** — median of real stage durations from the history table (most recent 8
   completions per model+stage). Recomputed on every request; self-improving.
2. **Seeded norms** — until ≥3 real samples exist: durations from Ken's monday plan (median of
   planned lengths per model). **36 exception: seeded flat at 21 days per stage** (new model, no
   trustworthy data; Ken can pin per boat; history takes over as real 36s complete).
3. **Global default** — 14 calendar days.

Calendar days (weekends absorb naturally). Medians, not averages. The live norms are visible in
**Admin → Timeline** ("2850 · Glass Shop · 12 days · from 5 boats") so Ken can sanity-check the
machine's beliefs.

### Workload adjustment (Ken's add — v1)
A boat with a bigger-than-normal CompanyCam checklist gets more time. Per stage with a mapped
work center: compare the boat's **total item count** vs the model's typical count (median across
boats of that model) → **±1 day per 5 items difference, capped at ±10 days** (both knobs editable
in Admin, same pattern as Issue Rules). Symmetric (lighter boats project faster), skipped when the
boat isn't linked to CompanyCam. Always explainable: the bar popup shows
"Back Line: 19d norm **+2d for 10 extra checklist items**".
This requires the **work-center → stage mapping** (Backline–Hull / Backline–Deck&Ring → Back Line;
Front Line → Front Line; QC → QC; Console → TBD with Ken) — so the mapping moves into **v1**;
the %-fill visuals and sub-views built on it stay v2.

## 2. The projector ("where will every boat be, and when?")

Server-side, computed fresh on GET /api/timeline; one shared projection feeds the Gantt, command
center, Issues, and Ask the B.O.S.S.

**Per active boat (in build order):**
- **Past stages** = actual dates from history → SOLID bars. Never predicted.
- **Current stage** = actual start; projected end = start + norm. If already past the norm:
  projected end = today + 2 days, and the boat flags (see §5).
- **Future stages** = chained using norms, subject to capacity, holds, and pins → LIGHT bars.

**Queued boats & placeholder slots** ("28229 - Open", boat-show slots): enter Glass Shop at the
earliest legal slot, in build order. Slots are plan-only groups until linked to a real boat.

### Capacity rules (the shop's physics — per Ken)
- **Glass Shop = one boat per model at a time** (one mold set per model). A 23T and a 2850 can
  run simultaneously; two 25Ts cannot.
- **THE 36 RULE: a 36 in the Glass Shop is exclusive** — it takes the whole crew, so no other
  boat may *start* Glass Shop while a 36 occupies it. (Boats already mid-glass aren't artificially
  extended in v1 — the projector re-anchors to actuals daily, so reality self-corrects.)
- **Back Line / Front Line / QC: no hard limit** (the one-piece-flow rhythm keeps them naturally
  spaced). If WIP ever piles up in practice, capacity numbers can be added later — the engine
  supports them; they're just set to "unlimited" per Ken.
- Goal-state note (context, not a rule): all molds filled + 1–2 boats out of the mold queued for
  Back Line.

## 3. Gaps (Ken asked for ideas — this is the proposal)

Gaps between a boat's stages are real life. Four mechanisms:

1. **Automatic gaps** — the projector creates them naturally when a mold is busy or a 36 has the
   glass shop locked. Drawn as a thin connector line between bars with a "waits N days" label so
   the *reason* the boat sits is visible.
2. **Blackout dates** — an Admin list of shop-closed ranges (Christmas week, FLIB boat-show week).
   The projector schedules nothing inside them, and stage norms ignore them when learning. Cheap
   to build, big accuracy win. (v1)
3. **Manual hold** — a pin variant: "hold this boat until <date>" (customer payment, parts,
   whatever). Shows as a hatched gray gap with a 📌. (v1 — it's the same pin machinery)
4. **Bottleneck analytics** — where boats wait longest, by stage/model. (v2; the data accrues
   from day one.)

## 4. Ken's controls
- **Pin a stage** (dates fixed, forecast flows around it) · **pin a start** · **hold until date**.
  Pinned/held bars: darker + 📌. Unpin = back to auto.
- **Reorder — from EITHER tab, with a DRAFT mode (v1, per Ken):** the Timeline's row order IS
  the build order. Vertical ⠿ row-drag re-cascades the forecast **as a draft**: a banner appears
  ("Draft — changes not saved · Save order / Discard") and every drag recomputes the projection
  via a preview endpoint that persists NOTHING. Ken can shuffle boats to think, compare, and walk
  away — the database only changes when he clicks **Save order** (real boats → the same
  Production Schedule reorder endpoint, so the two tabs can never disagree; slots → slot queue).
  Discard snaps back to the saved order. Placeholder slots interleave and drag the same way.
  (Horizontal bar-drag to change dates stays v2 — pins cover it meanwhile.)
- **Target delivery date** per boat = the customer promise → diamond on the chart.
  **Ops-only at launch; pushed to Shop view later once the estimates prove out** (one-line flip).
- All editing Ops-only; Shop read-only; demo mode blocked as usual.

## 5. Gantt view (Timeline tab)
- Weeks/Months zoom, month+week headers, today line, auto-scroll to now.
- Boat rows: collapsed = summary bar + diamond; expanded = stage bars in stage colors
  (solid actual / light projected / darker 📌 pinned / gray hold gaps, "waits N days" connectors).
- **Live progress fill (v1, per Ken):** the CURRENT stage's bar shades by real work completed —
  length = projected time, fill = checklist completion (21/42 items → 50% shaded). Sources:
  Glass Shop ← the Lamination tab's tasks; Back Line / Front Line / QC ← their mapped CompanyCam
  work centers. Past stages 100%, future 0%. Fill vs the today line = at-a-glance pace check
  (today line at 80% of the bar, fill at 50% → visibly behind before any rule fires).
  v1 fill is visual only — it never moves dates (that's the v2 completion-rate refinement).
- **Behind target** = red gap between projected end and diamond + "▲ 9 days behind" label.
- Editing v1 = click a bar → date popup. Drag-to-move = v2.
- Standard "Show delivered" toggle.

## 6. Integrations
- **Issues**: replace flat "stuck 14 days" with **"stage ≥ X days over its model norm"**
  (default 3); add **"projected delivery ≥ X days past target"** (default 5). Both editable in
  Admin → Issue Rules like everything else.
- **Command center**: "Projected delivery: Aug 14 (▲ 9 behind target)".
- **Ask the B.O.S.S**: projection + targets in its data bundle ("when will Oksas deliver?").
- **Shop Feed**: TARGET_CHANGED events — promises get a paper trail.

## 7. v2 — CompanyCam sub-views (Ken's idea; explicitly NOT day-one)
Map each CompanyCam work center to its timeline stage (Backline–Hull / Backline–Deck&Ring →
Back Line; Front Line → Front Line; QC → QC; Console → concurrent, mapping TBD). Then:
- The **current stage bar fills with live % complete** from its CompanyCam checklists
  (24/31 done → bar 77% filled) — progress from the floor, not just elapsed time.
- **Click a stage → sub-view** of its checklist items (done/remaining), reusing the Assembly
  popup pattern.
- Later, checklist completion % can sharpen the projected stage end (finishing faster than the
  clock suggests → pull the date in).

## 8. Data & backend (one brief)
Tables: `timeline_pins` (incl. holds), `timeline_slots` (+plan rows; slots carry a queue
position that interleaves with production_schedule.sequence_number — the projector consumes one
merged build order), `timeline_targets`, `stage_norm_seeds`, `timeline_blackouts`; capacity/rule
settings ride the existing issue-rule-settings pattern. Computed live: durations, norms, projection.
Endpoints: `GET /api/timeline` (computed result, everyone) · pins/slots/targets/blackouts CRUD
(Ops) · norms list for Admin.
**Import (one-time):** monday export → duration seeds per model (36→flat 21d), placeholder
slots (+ their rows as pins), each real boat's monday end date → target (Ken reviews after).

## 9. Build phases
- **v1:** engine (norms, molds-per-model, 36-exclusive rule, workload adjustment + work-center→
  stage mapping, blackouts, holds, pins, targets) + Gantt + import + the two Issue-rule changes +
  command-center/Ask integration.
- **v2:** CompanyCam stage sub-views + live % fill, drag-to-move, bottleneck analytics,
  TV timeline board, Shop-visible targets.

## Resolved decisions (for the record)
1. Glass Shop = 1 per model (mold sets); 36 = exclusive shutdown; downstream unlimited. ✔
2. 36s predict on the standard stages, seeded 21 days/stage; pins for the weird stuff. ✔
3. Gaps: auto from constraints + blackout dates + manual holds, with visible "waits N days". ✔
4. Targets Ops-only now, Shop later when estimates prove out. ✔
5. Start dates auto-cascaded but pinnable. ✔ · Overrides per boat/stage. ✔ · Target vs projected. ✔
6. monday.com: import once, then retire. ✔
