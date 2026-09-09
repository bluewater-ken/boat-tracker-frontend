// Read-only MCP connector for B.O.S.S — lets claude.ai ask live production questions
// ("where is the Landshark 36?"). Runs as a Vercel Function on the frontend app and
// calls the DigitalOcean backend server-to-server with a locked-down read-only account.
//
// Auth: holds the boss-reader CREDENTIALS in env (never a static token — BOSS tokens
// expire at 30 days), logs in on demand, caches the token, and re-logs-in on a 401.
// The credential is write-blocked server-side (readOnlyGuard); this connector can only read.
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

const BASE = 'https://tracker.bluewatersportfishingboats.com';
let cachedToken = null;

async function login() {
  const username = process.env.BOSS_READER_USERNAME;
  const password = process.env.BOSS_READER_PASSWORD;
  if (!username || !password) {
    throw new Error('Connector not configured — BOSS_READER_USERNAME / BOSS_READER_PASSWORD are not set.');
  }
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(`BOSS login failed (${r.status}).`);
  const data = await r.json();
  cachedToken = data.token;
  return cachedToken;
}

// Call the backend with the read-only token; refresh once on 401 (expired/rotated).
async function bossFetch(path, init = {}, retry = true) {
  if (!cachedToken) await login();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${cachedToken}` },
  });
  if (res.status === 401 && retry) {
    cachedToken = null;
    return bossFetch(path, init, false);
  }
  return res;
}

const handler = createMcpHandler((server) => {
  server.tool(
    'ask_boss',
    'Ask a natural-language question about Bluewater boat production — current status, schedule, which boats are behind, late parts, what was done. Read-only. Examples: "where is the Landshark 36?", "which boats are behind schedule?", "what parts are late?". Keep the question under 500 characters.',
    { question: z.string().max(500).describe('A short natural-language question about the boats or shop.') },
    async ({ question }) => {
      try {
        const r = await bossFetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        if (!r.ok) return { content: [{ type: 'text', text: `B.O.S.S returned ${r.status}.` }], isError: true };
        const data = await r.json();
        return { content: [{ type: 'text', text: String(data.answer ?? '(no answer)') }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Could not reach B.O.S.S: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'find_boat',
    'Find boats by hull number, customer, or model — every word in the query must match. Returns hull, customer, model, color, current stage, per-stage progress, ETA, target date, and days behind. Read-only. Example queries: "Landshark 36", "PCY 2850".',
    { query: z.string().min(1).describe('Words matched against hull id, customer, and model, e.g. "Landshark 36".') },
    async ({ query }) => {
      try {
        const r = await bossFetch(`/api/query/find?q=${encodeURIComponent(query)}`);
        if (!r.ok) return { content: [{ type: 'text', text: `B.O.S.S returned ${r.status}.` }], isError: true };
        const data = await r.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: `Could not reach B.O.S.S: ${e.message}` }], isError: true };
      }
    },
  );
});

// Gate the endpoint itself with a shared secret in the URL (?k=…), fail-closed.
// claude.ai custom connectors can't set custom headers, but they keep the URL you
// give them, so the secret rides in the query string. Read-only + no PII behind it,
// but this keeps the connector from being an open unauthenticated read path.
async function gated(request) {
  const secret = process.env.MCP_SECRET;
  const provided = new URL(request.url).searchParams.get('k');
  if (!secret || provided !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return handler(request);
}

export { gated as GET, gated as POST, gated as DELETE };

export const config = { runtime: 'nodejs', maxDuration: 30 };
