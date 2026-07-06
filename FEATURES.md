# B.O.S.S — Feature Tree

Running backlog so Ken can queue ideas without waiting. Drop anything here (or just tell Claude);
each item moves down the columns as it goes. **Plain-English is fine — no need to be technical.**

Status key: 💡 idea · 🔨 building · 🧪 ready to test/ship · ✅ shipped · ⏸ parked · 🖥 needs server session

---

## 🔨 Building now
_(nothing in progress)_

## 🧪 Ready to test / ship
_(nothing waiting)_

## 🖥 Needs a server session (Ken runs these on the droplet)
- **Ask emoji style** — one-line tweak to `ask.js` system prompt (decide: emojis on/off/light).

## ✅ Recently shipped (live front + back)
- **Ask for everyone + on-topic guardrail** — all roles can use Ask; declines off-topic prompts.
- **Resolved-issues view** — Shop Feed "Resolved" list populates.
- **Assembly full checklist** — CompanyCam columns send every item; popup All/To-do/Done all work.
  _(Hit CompanyCam "Sync" once to populate the new checklist items immediately.)_
- **Issue reporting w/ type, area & photos** — full report form; photos upload + store server-side.
- **Mobile shop view** — Lamination/Finishing phone-first, bottom-sheet menus, in-production filter.

## ⏸ Parked (built or half-built, waiting on your go)
- **Boats command center** — built on branch `boat-command-center`, not merged yet. Per-boat overview
  page (stage strip, summary cards, needs-attention, recent activity). Say the word to ship.

## 💡 Ideas (not started)
- **Scheduling Gantt chart** _(discuss after current mobile batch)_ — Ken currently does his production
  scheduling as a Gantt chart in **Monday.com**. Goal: bring that into B.O.S.S. Open questions for the
  talk: pull from the Monday.com API vs. build a native Gantt in B.O.S.S; how it relates to the existing
  Production Schedule tab; whether Monday stays the source of truth or B.O.S.S takes over.
- **Reporting / analytics** — 📊 dashboards and printable reports once there's real history to chart.
  Wait until we've collected live data so the numbers are meaningful. Likely candidates:
  on-time delivery rate, parts overdue trends, avg days per stage (cycle time), boats behind
  schedule, issues by category/boat, throughput per month. _Parked until we have real data._
- **TV shop-floor display** — big read-only screen for the shop wall.
- **Mobile app (PWA)** — installable phone version; command center is its foundation.
- **Assembly charts** — progress donuts (per cell vs per boat — undecided).
- **New-activity ticker** — scrolling "just happened" strip on the Feed.
- **CompanyCam integration — approach locked (not built):**
  - **No modular/auto-applied templates.** Checklist items are in strict do-next order; adding a
    separate checklist breaks the sequence. Templates stay whole and human-edited in CompanyCam.
  - **AI build-sheet gap report (advisory).** AI reads a boat's build-sheet XLS, compares it to that
    model's current checklist (can be pulled from CompanyCam via API), and outputs what's
    missing/different + roughly where it belongs. A person then edits the checklist in CompanyCam by
    hand so the order stays right.
  - **B.O.S.S's role = status updates + directives** — mirror checklist progress, show what needs to
    get done when. B.O.S.S does not run the checklist; CompanyCam stays the crew's QC/work tool.
  - **Boat ↔ project deep-link** both directions (small, do first — one project per boat by hull #).
  - _Open Q:_ how does the build-sheet XLS get into B.O.S.S — upload per boat, or already stored?
- **CompanyCam extras** — show job photos on the boat page; auto-create CompanyCam projects.
- **CompanyCam popup on Assembly — decide what data it shows** _(come back to)_ — revisit what the
  CompanyCam popup surfaces on the Assembly tab (which photos/checklist/QC info is most useful there).
- **Repo CLAUDE.md** — short house-rules doc (your brother's suggestion).

---

### How to use this
- **Add anything, anytime** — tell Claude "add X to the feature tree" or just describe it.
- **Queue freely** — list several at once; Claude ships them one by one and updates this file.
- **Say "ship it"** to move a 🧪 item live; say "hold" to park it.
- Claude keeps the columns current so you always see what's in flight.
