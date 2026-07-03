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
