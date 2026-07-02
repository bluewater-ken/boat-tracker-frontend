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
