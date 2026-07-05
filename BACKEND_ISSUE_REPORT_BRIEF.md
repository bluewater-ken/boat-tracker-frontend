# Backend add — issue reporting with type, area, and photos

Extends the existing `POST /api/issues` route and the issues list on the server (`/var/www/boat-tracker`).
Paste into a Claude Code session on the server. **Back up the files first.** This adds file uploads, so
it's a bit bigger than the other briefs — go step by step and test after each part.

## What the frontend now sends
The "Report issue" form posts to `POST /api/issues` in one of two ways:

1. **No photos** → JSON (as before, plus two new fields):
   ```json
   { "title": "Gelcoat crack on port side", "boat_id": "25T047", "source_tab": "Finishing", "problem_type": "Damage" }
   ```
2. **With photos** → `multipart/form-data` with the same text fields plus one or more `photos` file parts.
   Field names: `title`, `boat_id`, `source_tab`, `problem_type`, and repeated `photos`.

`source_tab` = the area (Key Parts / Schedule / Lamination / Finishing / Assembly) — it already drives the
issue's color/category, so storing it in the existing `source_tab` column is all that's needed.
`problem_type` = the kind (Damage / Missing / Short / Rework / Safety / Other) — a new column.

## Backend changes
1. **Accept multipart on `POST /api/issues`.** Use a multipart middleware (e.g. `multer` — `npm i multer`).
   Accept up to ~6 `photos`, images only, cap each at ~10 MB. Keep the existing JSON path working for the
   no-photo case (multer only parses multipart; JSON bodies still hit `express.json()`).
2. **Store the files.** Save uploads under `/var/www/boat-tracker/uploads/issues/` (create it, and make sure
   it's writable by the pm2 user). Give each a unique name (e.g. `<issueId>-<index>-<timestamp>.<ext>`).
   Serve the folder statically, e.g. `app.use('/uploads', express.static(path.join(__dirname, 'uploads')))`.
3. **Save the issue** with the new fields: `problem_type` (text, nullable) and a list of photo URLs.
   Add columns if needed — e.g. `ALTER TABLE issues ADD COLUMN problem_type TEXT;` and a `photo_urls`
   text/JSON column (or a related `issue_photos` table). Photo URL = `/uploads/issues/<filename>` (the
   frontend prefixes it with the API host automatically via how it loads images, or store the full URL).
4. **Return photos on reads.** In `GET /api/issues` (and the resolved list), include `problem_type` and
   `photo_urls` (an array of URLs) on each issue. The frontend already renders a type badge and photo
   thumbnails when those fields are present; it ignores them when absent.

## Verify
`node --check <files>`, `pm2 restart boat-tracker`. Then in B.O.S.S → Shop Feed → Issues → **+ Post issue**:
- Post text only with a Type + Area → issue appears with the right color and a type badge.
- Post one with a photo (on a phone, the camera opens) → after posting, the issue card shows the thumbnail;
  tapping it opens the full image.
- Confirm the file actually landed in `/uploads/issues/` and the URL loads in a browser.

Security notes: only accept image mimetypes, cap file size/count, and keep the uploads dir outside anything
executable. Photos are visible to any logged-in user (same as issues).
