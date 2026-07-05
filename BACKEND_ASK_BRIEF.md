# Backend brief — "Ask B.O.S.S" (AI questions over tracker data)

Paste into a Claude Code session **on the backend server** (`/var/www/boat-tracker`).
**Back up `server.js` first. Additive only.**

Adds one endpoint: `POST /api/ask`. It gathers the production data from Postgres, sends it
with the user's question to the Claude API, and returns a plain-English answer. Read-only —
it never writes to any table.

Ken will paste an **Anthropic API key** into this session when asked. It goes in `.env`
ONLY (never in code, never echo it back).

## 1. Install + config
```
npm install @anthropic-ai/sdk
```
`.env` additions:
```
ANTHROPIC_API_KEY=<Ken pastes it>
ASK_MODEL=claude-haiku-4-5
```
(`ASK_MODEL` is the one-line upgrade knob — e.g. change to `claude-sonnet-5` later if
answers feel thin. Default is Haiku: cheapest, fast, plenty for data-grounded Q&A.)

⚠️ **Same ESM ordering pitfall as the old JWT bug:** do NOT read `process.env.ANTHROPIC_API_KEY`
at module import time. Construct the client lazily inside the request handler (or after
dotenv has definitely run):
```js
import Anthropic from '@anthropic-ai/sdk';
let anthropic = null;
const getClaude = () => (anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
```

## 2. `POST /api/ask` (**Ops only** for now — requireAuth + requireRole('ops'))
> Ken's call: Ops-only to start, Shop crews later. To open it to everyone, just drop the
> `requireRole('ops')` (keep `requireAuth`) — one-line change, no other edits.

Body: `{ question }`. Validate: non-empty string, max 500 chars (413/400 otherwise).

### Gather the data (read-only queries)
Build one compact JS object covering ACTIVE boats (global_status != 'Delivered'):
- `boats`: boat_id, customer_name, boat_model, hull_color, global_status, sequence_number
- `key_parts`: per boat — part_name, status, description, expected_delivery, actual_delivery,
  flags (only include fields that are set; skip Not Ordered rows with no other data to keep it small)
- `lamination` and `finishing`: per boat — task_name, status, color, na, dates/asap/grade where set
- `assembly` (if cc_progress exists): work center name, completed/total
- `open_issues` (if issues table exists): title, boat_id, source_tab, created_at
- `recent_activity` (if cc_feed exists): last 40 rows — title, boat_id, type, created_at
- `today`: the current date string (so "overdue"/"today" questions work)

Wrap each optional table in try/catch — missing tables just mean that section is omitted.
Keep it compact (short keys are fine); typical size should be a few thousand tokens.

### Call Claude
```js
const msg = await getClaude().messages.create({
  model: process.env.ASK_MODEL || 'claude-haiku-4-5',
  max_tokens: 1024,
  system:
    "You are the assistant inside B.O.S.S (Bluewater Operations and Shop System), a boat-production " +
    "tracker for Bluewater Sportfishing Boats. Answer the user's question using ONLY the JSON data " +
    "provided. Be concise and plain-spoken — these are busy shop and office staff. Use short " +
    "paragraphs or dashes, not markdown headers. If the data doesn't contain the answer, say so " +
    "plainly — never guess or invent. Dates: compare against the provided 'today' value.",
  messages: [{
    role: 'user',
    content: `PRODUCTION DATA (JSON):\n${JSON.stringify(data)}\n\nQUESTION: ${question}`,
  }],
});
const answer = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
res.json({ answer, model: msg.model });
```
No `temperature`, no `thinking` config — defaults are correct for this.

### Error handling
- Missing/blank ANTHROPIC_API_KEY → 503 `{ error: 'Ask is not configured yet' }`.
- Claude API errors: catch by type — rate limit (429) → 503 `{ error: 'Busy, try again in a minute' }`;
  anything else → 500 `{ error: 'Ask failed' }` and log the real error server-side.
- Log one line per ask: username, question length, msg.usage.input_tokens/output_tokens
  (handy for watching cost — do NOT log the question text itself).

## 3. Finish
`node --check server.js`, `pm2 restart boat-tracker`. Verify:
- POST /api/ask without a token → 401.
- As a logged-in user, ask "Which parts are overdue?" → sensible answer grounded in real data.
- Ask about a boat that doesn't exist → it says it can't find it (no inventing).
- Check the pm2 log line shows token usage (should be a few thousand in, a few hundred out).

Then tell Ken — the frontend `ask-ai` branch merges with the rest of the batch.
