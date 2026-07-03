# Bluewater Production Tracker — Business Requirements Document (BRD)

_Reconstructed and updated: June 29, 2026 (rev. 2 — adds Bluewater brand/UI direction, three view types, user roles, TV rotation + announcements, and mobile Shop view)_

> Note: This BRD was rebuilt from the current working context because the original could not be retrieved via search. Please review each section and flag anything inaccurate — corrections will be folded in.

---

## 1. Purpose & Background

Bluewater Sportfish builds custom sportfishing boats. Production was tracked across a multi-tab Excel spreadsheet ("Key_Parts_Order_Tracker.xlsx"). The core problem: a status change required manually editing multiple spreadsheets, which was error-prone and went stale. This app replaces that with one shared database so a status updates once and is reflected everywhere.

**Business facts:** ~7 boats in active production, ~20 in backlog, 4 users, build cycle 12–20 weeks. Boat models: 2850, 25T, 23T, 36.

---

## 2. Users

Approximately 4 internal users (production/shop staff). Plus a planned future audience: **shop-floor TV displays** showing read-only production status (see Section 9).

---

## 3. Scope — Tabs Overview

| Tab | Name | Status |
|-----|------|--------|
| 1 | Production Schedule | Built & live |
| 2 | Boat Information | Built & live |
| 3 | Key Parts Tracker | Built; redesigned this session (view-only except Ops, delivery dates, 3 flags) — to rebuild |
| 4 | Lamination Tracker | Design locked, not built |
| 5 | Finishing Tracker | Design locked, not built |

Cross-cutting feature: **Flag system** (designed on Lamination, to be replicated). See Section 8.

---

## 4. Tab 1 — Production Schedule (BUILT)

- Drag-and-drop ordering of the build sequence (sequential build order).
- Global status cycle: **Backlog → Pre-Production → Glass Shop → Back Line → Front Line → QC → Delivered.**
- Every status change auto-timestamps; STATUS_HISTORY tracks predicted vs. actual.
- Estimated completion date = manual entry.
- Hull color used as the floor identifier.
- List shows boat_id, customer, model, hull color, current status.

---

## 5. Tab 2 — Boat Information (BUILT)

- Searchable list of boats (by id, customer, model).
- Fields: boat_id (manual, primary key), customer name/phone/email/address, boat_model (2850/25T/23T/36), up to 3 engines (brand + model; at least 1 required), hull_color.
- Save / New Boat; engine and color values auto-suggest from prior entries.

---

## 6. Tab 3 — Key Parts Tracker (BUILT; REDESIGNED THIS SESSION — to update)

- **16 standard parts** (same for every boat): Coosa Kit, Gelcoat, Motors, Ride, Bracket, New Wire, Upholstery, Wallabys Tanks, Wallabys Other, Poly Parts Teak, Poly Parts Premium, Rigging, Steering, Wind Shield, Helm Pad Kit, Trailer.
- **Custom "Extras"** per boat; custom names remembered for future suggestions.
- **3 statuses:** Not Ordered (gray) → Ordered (amber) → Received (green). Full status names.
- Two views: by boat, and by part-type table (boats = rows, parts = columns).

### Permissions (LOCKED)
- **View-only on the TV AND in the mobile app.** **Only Ops can change** Key Parts (status, dates, flags) — purchasing is an office function. Shop users can see Key Parts (read-only) via the mobile tracker switcher but cannot edit it.

### Dates = DELIVERY dates, not order dates (LOCKED)
- **Ordered** → cell shows the **expected delivery date**. Ops enters it via a **date picker in the Key Parts action menu** when marking the part Ordered (editable later if the supplier changes the promised date). **Can be left blank if unknown** → shows "exp —".
- **Received** → cell shows the **actual delivery date**, **auto-stamped to today** when Ops marks it Received, but **editable / back-datable** (e.g. arrived Friday, logged Monday).
- Date entry lives in the **Key Parts Ops action menu** (NOT the boat setup page) — parts are ordered gradually through the build, so the date is known/entered in context at order time.

### Flags (LOCKED) — three, specific to purchased parts
1. **Late** — part is overdue. **Hybrid:** Ops can flag it manually when a delay is known (even before the due date); the system also **auto-flags Late** once today passes the expected delivery date and the part is still not Received. (Blank-date Ordered parts can't auto-flag — manual only.)
2. **Backordered** — supplier-delayed.
3. **Unsatisfactory** — arrived wrong / damaged.
- (The Lamination "Required Rework" flag does not apply to purchased parts.)

### Reporting (data requirement)
- All order/delivery events, expected-vs-actual dates, and flag history (manual + auto Late, backorders) are **timestamped and stored** for future reporting (e.g. supplier punctuality, average delay, parts that held up production). Ken to define reports later.

- Hull color shows in the boat column (as on all boards).

---

## 7. Tab 4 — Lamination Tracker (DESIGN LOCKED, NOT BUILT)

- **13 tasks:** Glass, Hull, Transducer, T Top, Liner, Ring, Baitwell, Leaning Post, Console, Console Face, Hatches, Boxes, Grid.
- **5-status cycle, STOPS at Pulled** (the mold is then freed for the next boat — no loop):
  **Mold Unavailable → Mold Open → In Progress → Complete/On Mold → Pulled.**
- Colors: Mold Unavailable = light gray (no date), Mold Open = darker gray, In Progress = red, Complete/On Mold = orange, Pulled = green.
- **No date stamped on the first state** (Mold Unavailable); all other states timestamped.
- **Step-back control** (not a reset): steps back one state and restores that state's original date (date memory), so an accidental click doesn't lose earlier dates. Stepping forward again re-stamps with today.
- **No dashes** — every cell shows its real status text, including "Mold Unavailable."
- **Table view:** gridlines on all cells (including boat column and headers); headers frozen both ways (header row frozen on vertical scroll, boat column frozen on horizontal scroll, corner pinned).
- Two views: by boat, and by task (table).

### 7a. Action menu (tap-to-open) — touchscreen-ready
Replaces hidden click-modifiers. Tapping a task (boat view) or a cell (table view) opens one labeled menu containing:
- **Advance ›** (next status; disabled at Pulled)
- **‹ Step Back** (restores the earlier state's original date; disabled at the start)
- **Set Not Applicable / Clear N/A**
- **Color** (type-ahead picker — see 7c)
- **Flags** (the three toggles — see Section 8)

This single tap-menu is the interaction model for both desktop and the future shop touchscreen.

### 7b. "Not Applicable" (N/A) state
- Some boats don't need certain tasks (e.g., not every boat has a Ring).
- N/A is a distinct state: **neutral gray** (#E4E4E7), **no date**, does not cycle.
- Shown in the **table** to keep columns aligned across boats (every boat keeps all 13 columns).
- Set/cleared from the action menu.
- (Three grayish states now exist — Mold Unavailable, Mold Open, N/A. Confirm they're visually distinct enough during build; adjust N/A shade if needed.)

### 7c. Per-part color
- **Color is a per-part attribute** (not boat-level). ~99% of parts are White.
- Defaults: every part = **White**; **Hull auto-fills from the boat's hull color** (overridable); **Baitwell (= Livewell) defaults to Ice Blue**.
- Colors are **custom-ordered and specific** → shown as **text (color name)**, never a swatch.
- **Only non-white colors display** (white shows nothing, so exceptions stand out). Shown in the **table** under the status, and in the boat view next to the task name.
- Set via the action menu using a **type-ahead picker**: filter the existing list or type a new color to add it.
- **One shared, growing master color list** used app-wide (same list everywhere a color is set).
- **Display order: White pinned at top, all other colors alphabetical (A→Z) below it.**

### 7d. Open build decision (revisit later)
- Non-hull part colors are set **on the Lamination screen** for now (decided). **Revisit later:** optionally also allow setting them up front on the **Boat Setup screen**, since they're custom-ordered and often known at order time. Lam-screen setting remains regardless.

---

## 8. Cross-Cutting — Flag System (DESIGNED ON LAMINATION; TO REPLICATE)

Independent, persistent, timestamped flags layered on top of any status cell.

- **Three flags**, fully independent (a cell can have all three at once):
  1. **Issue / Delay** — warning-triangle icon, amber (#BA7517)
  2. **Required Rework** — refresh/loop icon, blue (#185FA5)
  3. **Unsatisfactory** — flag icon, red (#A32D2D)
- Flags **persist through all status changes**, including Pulled. Only an explicit clear removes them.
- **Cell** shows bare icons (no text) in the corner; the **selection screen** (popup) shows full labels; the **legend** shows status colors plus flag icons + labels.
- **Flag history is saved with timestamps** (every raise/clear dated) for future reporting (to be built later by Ken).
- Touchscreen note: shop displays will need a tap-based flag menu (right-click won't work on touch).

### OPEN DECISIONS (flags on other tabs)
1. ~~Same three flags on Key Parts?~~ RESOLVED — Key Parts has its own three: **Late / Backordered / Unsatisfactory** (Late is hybrid manual+auto). See Section 6.
2. ~~Does Finishing get a 4th ASAP flag?~~ RESOLVED — Finishing uses its own model (ASAP toggle + Good/Bad/Ugly grade), not the standard three. See Section 9.
3. Does the Production Schedule get flags at all (at the **boat level**, since it's one row per boat, not a task grid)? — STILL OPEN (only remaining flag decision).

Note: each tab has its own flag set — Lamination (Issue/Delay, Required Rework, Unsatisfactory), Finishing (ASAP + Good/Bad/Ugly grade), Key Parts (Late, Backordered, Unsatisfactory). Not assumed uniform.

---

## 9. Tab 5 — Finishing Tracker (DESIGN LOCKED, NOT BUILT)

Finishing is post-lamination work — **no molds involved**. It has its own status set and its own flag model (different from Lamination).

- **10 tasks:** Hull, Liner, Ring, Hard Top, Console, Console Face, Hatches, Leaning Post, Buckets, Other.
- **4 statuses, stops at Complete** (no loop): **Not Available (gray) → Not Started (red) → In Progress (amber) → Complete (green).**
  - "Not Available" = the part hasn't arrived from the lamination shop yet.
- **Action menu** (same pattern as Lamination): Advance / Step Back for both roles; **N/A and Color are Ops-only.**
- Per-part color, gridlines, frozen headers, two views (boat / table) — all as Lamination.

### Finishing flag model (TWO systems — NOT the standard three)
Finishing does **not** use the Lamination flags (Issue/Delay, Required Rework, Unsatisfactory). Instead:
1. **ASAP** — a single priority toggle (on/off). Shown as a red "ASAP" corner tag. **Set by Shop or Ops.**
2. **Part grade — Good / Bad / Ugly** — a **pick-one** quality grade for how the part arrived from lamination (assessed before finishing starts). Shown as a face icon: Good = happy (green), Bad = neutral (amber), Ugly = sad (red). Sits in the cell corner, distinct from status color. **Set by Shop or Ops** (whoever inspects the incoming part).

Both ASAP and grade carry timestamped history for future reporting, same principle as Lamination flags.

---

## 9a. Brand & Visual Direction (LOCKED)

Design anchored to the Bluewater Sportfishing Boats brand (from logos + website).
- **Palette:** deep navy `#173A5E` (primary/structure), splash blue `#2E92D6` (accent/action/active state), light steel-blue `#A9C3D4`, white surfaces. Replaces the old purple-gradient starter look.
- **Header:** navy bar with the **real white Bluewater logo** top-left (white version on navy), plus a context label (e.g. "Production Tracker" / "Lamination").
- Clean, sturdy, utilitarian-but-polished. Flat (no gradients). Tighter density for ops; bold/high-contrast for the TV.
- Logo files provided by Ken (white version for navy backgrounds; dark-navy version available for white backgrounds).

## 9b. Three View Types (LOCKED)

The same data/system is presented three ways for three contexts:

1. **Computer / Ops view** — full interactive interface. Information-dense, all tabs, full editing, both boat and table views, the tap-to-open action menu. The "command center."
2. **TV / Shop-floor view** — read-only wall display. Big bold type, full-cell status color fills, large flag icons, navy header with logo + live clock + rotation indicator, legend bar.
   - **Active-production boats only** — a boat drops off the TV automatically once it reaches **Delivered**.
   - **Auto-rotates** through boards, **30 seconds each**, looping. Rotation: **Schedule → Key Parts → Lamination → Finishing → Announcements (if any) → loop.** (Boat Information is NOT on the TV.)
   - **Wide task grids (Lamination, Finishing) auto-scroll**: boat column frozen, task columns pan in one slow there-and-back sweep per slot (pan clamps exactly to the last column — no empty space). **Sweep speed = tunable setting, dial in on real TV hardware.** Narrow boards (Schedule, Key Parts) stay **static** (no scroll).
   - **Announcements screen:** freeform text typed by Ops, with controls for **font size, alignment, bold**; an **on/off toggle** AND an optional **auto-expire date**; navy background, logo. Appears in rotation only when on, not expired, and non-empty — otherwise skipped. One page (Ops can type multiple announcements as freeform text).
   - Physical control buttons (pause/forward/back/jump) — designed later; display built to accept those actions.
3. **Mobile / Shop view** — restricted floor-update tool (Shop role only). **Boat-first** flow: active boats list (with hull color) → tap a boat → tracker switcher (Lamination / Finishing / Key Parts) → vertical tappable task list → bottom-sheet action menu. **Boat view only (no table view on mobile).** Big thumb targets for dirty/gloved hands.

**Hull color in the boat column:** every board (computer, TV, mobile) shows the boat's hull color in the boat/left column alongside id + customer + model, applied uniformly.

## 9c. User Roles & Access (LOCKED — to build)

Light-but-real auth. Goal: right screens for right people, prevent accidental data changes (not high-security).

- **Ops** — full access: all tabs, editing, boat setup, **set color, set N/A**, announcements, settings.
- **Shop** — restricted floor updating via mobile: **Advance status, Step Back, set Flags** only. Cannot edit boat info, set color, set N/A, delete, or change settings.
- **Display** — read-only TV mode, no login at the screen; shows rotating boards, changes nothing.

The action menu is **role-aware**: Ops sees Advance / Step Back / N/A / Color / Flags; Shop sees Advance / Step Back / Flags.

Requires a **login system** (username + password) + roles + permission checks. **Depends on HTTPS** (done). The TV "Display" mode is handled as a no-login kiosk link/account (ties to the Raspberry Pi setup).

### Auth implementation decisions (LOCKED — build next)
- **~10 user accounts** to start (mix of Ops office staff + Shop floor).
- **Login = simple username + password** (NOT email) — e.g. `ken`, `mike`; easier on a phone with gloved hands.
- **TVs = no-login "display" URL** — a special read-only route the kiosk loads directly; nobody signs in at the screen.
- **Ops manages users:** a "Users" screen (Ops-only) to add a person, set username/password, and assign role (Ops or Shop). Ops can add/edit/remove accounts and reset passwords.
- Security posture: light-but-real (prevent accidental changes, not high-security). Passwords stored hashed; sessions over HTTPS.

---

## 10. Parked / Future Scope

- **HTTPS / custom domain** — prerequisite for multi-user reliability and for shop TVs (removes the per-browser "insecure content" toggle). Uses a subdomain of bluewatersportfishingboats.com pointing to the server. Ken has DNS access.
- **Shop-floor TV displays** — app-driven read-only `/display` view (big, readable from 20+ ft, auto-refresh, auto-rotate between boards; auto-pause/emphasis on flagged items). Driven by **Raspberry Pi in kiosk mode** (one-time ~$80–100/screen, no subscription; clone SD card for additional screens). Rejected OptiSigns (per-screen subscription too costly).
  - **TV on/off automation:** prefer HDMI-CEC (the Pi powers the TV on/off on a schedule). **CEC is off by default on most TVs and must be enabled in the TV's settings menu first** — look under the manufacturer's name for it: Samsung = Anynet+, LG = SimpLink, Sony = Bravia Sync, Vizio = CEC, TCL/others = CEC. **Test on the actual factory TV brand before rollout** (CEC behavior varies). Fallbacks if CEC doesn't cooperate: scheduled screen-blanking, or a smart plug / timer on the TV's power.
  - **Ops schedule screen (to build):** a settings screen in the Ops/computer view where Ops sets the TV on/off schedule — on-time, off-time, and which days (e.g. on 6:00 AM, off 6:00 PM, Mon–Sat; off Sundays). The Pi reads this schedule and powers the TV via CEC accordingly. Should support a simple per-day or weekday/weekend schedule, plus a manual "TVs on now / off now" override. One schedule applies to all TVs for now (per the "all TVs the same" decision).
  - **Manual control in a dirty shop:** display supports pause/resume, forward/back, and jump-to-board. Preferred input = rugged sealed physical switches wired to the Pi's GPIO; avoid shop-floor touchscreens (overspray/dust). See physical-controls spec below.

  - **Physical controls — momentary switches via GPIO (LOCKED):**
    - **Switches:** Carling-style (or similar) **momentary** rocker switches — no latching, no illumination. Wired **only to the CanaKit/Pi GPIO header**, nothing else (no 12V / boat electrical). Must use the Pi's **3.3V logic** (switch bridges a GPIO pin to ground; internal pull-up does the rest). Feeding higher voltage to GPIO will destroy the Pi — switch contacts only, at logic level.
    - **Count: 8 total** — one per current board (Schedule, Key Parts, Lamination, Finishing, Announcements) = 5, plus **1 Resume**, plus **2 spares** wired/reserved for future boards (e.g. Assembly, flagged-items) so no rewiring is needed later.
    - **Behavior on pressing a board button:** TV jumps to that board and **parks** there — stops the 30-second rotation (won't advance to the next board), **but the board still scrolls internally** (wide grids keep their slow side-to-side sweep so all columns are viewable). It simply won't rotate away to another board.
    - **Auto-resume after 5 minutes:** if Resume is not pressed within 5 minutes of parking, the TV automatically returns to normal rotation on its own (self-healing — covers the case where someone studies a board then walks away).
    - **Resume button:** immediately returns to normal auto-rotation (no need to wait out the 5 minutes).
    - Wiring note: land switch wires on the GPIO header directly or via a screw-terminal HAT for a more rugged shop install.
    - **Verified pin map (Pi 5 has a 40-pin header: 28 usable GPIO + 8 ground pins — 8 switches uses ~1/3, lots of headroom):**
      - Each switch = its own signal GPIO pin + shared ground. Suggested safe, plain general-purpose pins (avoid the I²C/SPI/UART special-function pins): **GPIO 17, 27, 22, 23, 24, 25, 5, 6** (BCM numbering) for the 8 switches.
      - Suggested assignment: 17 = Schedule, 27 = Key Parts, 22 = Lamination, 23 = Finishing, 24 = Announcements, 25 = Resume, 5 = Spare 1, 6 = Spare 2. (Final mapping set in the Pi script during the build.)
      - **Shared common ground:** all switches do NOT need separate ground pins — daisy-chain every switch's ground together and run one wire to a single GND pin (e.g. physical pin 6, 9, 14, 20, 25, 30, 34, or 39). Momentary switches draw negligible current, so one shared ground is fine.
      - Each switch is just two wires (signal + ground), no resistor and no power feed needed — the Pi's internal pull-up (enabled in software) holds the pin high until pressed.
    - **Prep / shopping for the button box:** 8 momentary switches (Carling-style), hookup wire, a screw-terminal HAT (a.k.a. GPIO terminal block) for clean rugged connections, and an enclosure to mount the switches.
- **Gantt chart** with baseline (predicted vs. actual) tracking.
- **Date estimation methodology** (auto-estimate start/finish).
- **"Waiting" sub-states** between production stages.
- **Assembly Shop Tracker** tab (possible future).
- **Reporting** off the flag history (Ken to define later).
- **Part colors on Boat Setup screen** — revisit allowing non-hull part colors to be set up front at boat creation (currently set on the Lamination screen).

---

## 11. Current Known Issues / Build Sequence

**STATUS (last session): Backend confirmed ONLINE and healthy** — `pm2 status` shows boat-tracker online; `curl http://localhost:5000/api/health` returns `{"status":"OK","message":"Backend is running"}`. Live site loads all 3 tabs with data. The old "app is down" note was stale — the app is working. Step 1 is effectively done.

**HTTPS approach decided:** Ken doesn't want to use the real domain yet (temporary — will move to a subdomain of bluewatersportfishingboats.com later). Plan = use a **free DuckDNS subdomain** as a bridge now, swap to the real subdomain later. Next action when resuming: create a DuckDNS subdomain (e.g. bluewater-tracker.duckdns.org) pointed at 68.183.28.211, then Nginx reverse proxy + Let's Encrypt/Certbot cert, then point the frontend's VITE_API_URL at the new https backend. (Paused before completing DuckDNS signup.)

**Recommended order (auth + HTTPS now on the critical path):**
1. ~~Backend back up~~ DONE — confirmed online and healthy.
2. ~~HTTPS / domain~~ **DONE.** Used the REAL subdomain (not DuckDNS after all): **tracker.bluewatersportfishingboats.com** (A record → 68.183.28.211, added in Bluehost DNS). Nginx installed as a reverse proxy (config at /etc/nginx/sites-available/tracker → proxy_pass to localhost:5000). Let's Encrypt cert via Certbot (auto-renews; expires 2026-09-29). Frontend updated: Vercel env var **VITE_API_URL = https://tracker.bluewatersportfishingboats.com** and redeployed. Verified: live site loads all 3 tabs cleanly in incognito, no mixed-content errors. Mixed-content problem permanently solved.
   - NOTE: server has a pending kernel reboot ("System restart required"). Do a clean `sudo reboot` at a safe moment; confirm backend (PM2) and Nginx auto-start after.
3. **Login + 3 roles** (Ops / Shop / Display) — **BACKEND DONE.** Auth logic in a separate `/var/www/boat-tracker/auth.js` (kept out of server.js to minimize risk). Uses bcryptjs (password hashing) + jsonwebtoken (30-day tokens). `users` table created (id, username, password_hash, role, display_name, created_at). server.js hooked up: imports auth.js, calls `await initAuth(pool)` in initializeDatabase, and `registerAuthRoutes(app, pool)` before startup. JWT_SECRET set in .env (single clean line, duplicate removed). Endpoints live: POST /api/auth/login, GET /api/auth/me, and Ops-only GET/POST/PUT/DELETE /api/users. Middleware: requireAuth + requireRole. First Ops account created (username `ken`, role ops) and login TESTED working over HTTPS (returns token + user).
   - Backend backup before auth: `server.js.pre-auth-backup`.
   - STILL TO DO for auth: (a) frontend login screen + store token + send it on API calls; (b) protect the existing data-changing routes with requireAuth/requireRole (currently the boat/schedule/parts routes are still open — auth exists but isn't enforced on them yet); (c) Users management screen in the frontend (Ops); (d) no-login TV `/display` route; (e) create the other ~9 accounts.
4. **Finalize Finishing Tracker design** — DONE (Section 9).
5. **Build + deploy Lamination + Finishing** for real, role-aware.
6. **Rebuild Key Parts** with the redesign (delivery dates, 3 flags, view-only-except-Ops, auto-late).
7. **TV `/display` view** + rotation + announcements + TV schedule screen.
8. **Mobile Shop view.**
9. **Raspberry Pi** kiosk rollout (CEC scheduling + 8 momentary switches).

Infra facts for resuming: Nginx reverse proxy in front of Node backend (port 5000); subdomain tracker.bluewatersportfishingboats.com is HTTPS. Bluehost manages DNS (also has Outlook email + Webflow/Lovable records for the main site — don't touch those).

---

## 12. Technical Architecture (for reference)

- **Frontend:** React + Vite, hosted on Vercel (auto-deploys on GitHub push).
- **Backend:** Node.js + Express on a DigitalOcean droplet, kept alive by PM2.
- **Database:** PostgreSQL on the same droplet.
- **Repo:** github.com/bluewater-ken/boat-tracker-frontend.
- Full credentials and server commands live in the separate Project Handoff Doc (not duplicated here).

---

_End of BRD. Please review and mark corrections; they'll be incorporated._
