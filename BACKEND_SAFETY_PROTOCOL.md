# BACKEND_SAFETY_PROTOCOL.md — Rules for when Claude Code does backend/server work

Give this file to the Claude Code session that will do backend work **on the server**
(`/var/www/boat-tracker` on the DigitalOcean droplet). It exists because the backend touches a
**live PostgreSQL database with real data and irreversible actions**. Frontend mistakes are
recoverable via GitHub; database mistakes may NOT be. These rules make backend work recoverable.

Ken is not a developer. Move carefully, explain in plain English, and never move fast on
irreversible actions.

---

## RULE 0 — Confirm you're in the right place
Before anything, confirm:
- You are working in `/var/www/boat-tracker` on the server (not the frontend repo).
- The app runs under PM2 as process name `boat-tracker`.
- The database is PostgreSQL, database name `boat_tracker`, user `boat_admin`.
State what you see and wait for Ken's confirmation before proceeding.

## RULE 1 — BACK UP BEFORE YOU TOUCH ANYTHING (mandatory, no exceptions)
Do these three backups and confirm each succeeded before making ANY change:

1. **Full database dump** (the critical one — this is the data safety net):
   ```
   pg_dump -U boat_admin -h localhost boat_tracker > ~/boat_tracker_backup_$(date +%Y%m%d_%H%M%S).sql
   ```
   Then verify the file exists and is non-empty (`ls -lh ~/boat_tracker_backup_*.sql`). If it's
   0 bytes or errored, STOP — do not proceed without a good backup.

2. **Backup the code file(s)** you're about to edit, timestamped:
   ```
   cp server.js server.js.backup_$(date +%Y%m%d_%H%M%S)
   ```
   (and any other file being changed, e.g. auth.js)

3. **Note the current state**: run `pm2 status` and confirm `boat-tracker` is `online` before you
   start, so you know the baseline.

Show Ken the backup filenames and confirm all three are done before continuing.

## RULE 2 — Show the plan, wait for approval
- Before editing anything, describe in plain English exactly what you will change (which columns,
  which routes) and why. Wait for Ken to say go.
- Keep permission prompts ON. Do not batch many irreversible actions together.

## RULE 3 — Database changes must be ADDITIVE only
- Only **add** columns/tables (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`).
- **NEVER** run `DROP`, `DELETE`, `TRUNCATE`, or destructive `UPDATE` against real data without
  explicit, specific, per-command approval from Ken — and even then, only after confirming the
  backup from Rule 1 exists.
- New columns should be nullable or have safe defaults so existing rows/routes keep working.
- Prefer `ADD COLUMN IF NOT EXISTS` so re-runs are safe.

## RULE 4 — Preserve the working app
- The existing routes and the 3 live tabs must keep working. Changes are additive; don't remove or
  rename existing columns, routes, or response fields that the frontend already uses.
- Keep auth in its separate `auth.js`; don't entangle it with new feature code.

## RULE 5 — Validate before restart
- After editing `server.js` (or any `.js`), run `node --check server.js` (and `node --check` on any
  other edited file) and confirm it passes BEFORE restarting.
- Only then: `pm2 restart boat-tracker`.
- After restart: `pm2 logs boat-tracker --lines 20 --nostream` and confirm you see
  "Database initialized" / "Server running on port 5000" and NO error stack traces.
- Hit the health check: `curl https://tracker.bluewatersportfishingboats.com/api/health` → expect
  `{"status":"OK",...}`.

## RULE 6 — Verify the actual change worked
- Test the new endpoint/field with a real `curl` (Ken can watch the result), e.g. set a value and
  read it back. Confirm data persists.
- If anything looks wrong, STOP and tell Ken. Do not "try to fix it fast" with more changes.

## RULE 7 — If something breaks, ROLL BACK, don't improvise
- Code broke the app? Restore the code backup: `cp server.js.backup_<timestamp> server.js`, then
  `pm2 restart boat-tracker`, confirm health.
- Data got damaged? STOP immediately, do not run more commands, tell Ken. Restoring the DB dump is
  possible but should be done carefully together, not autonomously in a panic.
- Never respond to a failure by running more destructive commands to "clean up."

## RULE 8 — Leave a record
- When done, summarize for Ken in plain English: what columns/routes were added, the backup
  filenames, and what to tell the frontend (any new fields/endpoints) so it can be wired up.
- Ken should relay these changes so the BRD (Bluewater_Tracker_BRD.md) and
  BACKEND_INTEGRATION.md get updated.

---

## Quick reference — the non-negotiables
1. **Database dump BEFORE touching anything.** Verify it's non-empty.
2. **Additive changes only.** No DROP/DELETE/TRUNCATE on real data.
3. **`node --check` before every restart.**
4. **Verify health + the actual change after.**
5. **On any breakage: roll back or stop — never improvise with more commands.**
6. **Ken watches and approves. Explain everything in plain English.**
