# Backend tweak — let everyone use "Ask the B.O.S.S"

One-line change to the `/api/ask` route on the server (`/var/www/boat-tracker`). Paste into a Claude Code
session on the server. **Back up the file first.** Ask is read-only (it reads data and answers, never
writes), so opening it to all logged-in users is safe.

## Why
The Ask button now shows for every role in the app (including shop managers on mobile). But the
`/api/ask` route currently requires the **Ops** role, so a Shop/display user's question is rejected.

## The change
Find the `/api/ask` route. It currently gates on Ops — something like:

```js
app.post('/api/ask', requireAuth, requireRole('ops'), async (req, res) => { ... })
```

Change it so it only requires a **logged-in user**, not the Ops role — remove the role gate, keep auth:

```js
app.post('/api/ask', requireAuth, async (req, res) => { ... })
```

(If the role check is done *inside* the handler instead of as middleware — e.g. `if (req.user.role !== 'ops') return res.status(403)...` — just delete that check. Leave the login/auth check in place.)

Don't change anything else — the model, max_tokens, the 500-char input cap, the data gathering, and the
guardrail prompt (if `BACKEND_ASK_GUARDRAIL_BRIEF.md` was run) all stay as-is.

## Verify
`node --check <file>`, `pm2 restart boat-tracker`. Then log in as a **Shop** (non-Ops) user and ask a
question in B.O.S.S — it should now answer instead of erroring. Cost is unchanged (~1¢/question, capped
by the API spend limit).
