// Shared API layer for the Bluewater tracker frontend.
// One place for: the backend base URL, the login token, and a fetch wrapper
// that attaches the token to every request and handles expired sessions.

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const TOKEN_KEY = 'bw_token';

// In-memory copy so we don't hit localStorage on every request.
let token = localStorage.getItem(TOKEN_KEY) || null;

export function getToken() {
  return token;
}

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  setToken(null);
}

// The AuthContext registers a callback here so a 401 anywhere in the app
// (e.g. an expired/invalid token) can force a logout back to the login screen.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// --- Demo mode ---
// A demo account reads all live data but can never save: every write is intercepted
// here and faked as a success, so the UI updates optimistically but nothing is sent
// to the server. A refresh reloads real data and wipes the demo's local changes.
let demoMode = false;
export function setDemoMode(v) { demoMode = !!v; }
export function isDemoUser(user) {
  if (!user) return false;
  return user.role === 'demo' || (user.username || '').toLowerCase().startsWith('demo');
}

// Central fetch wrapper. Call it with a path like '/api/boats' (no host).
// It prefixes the API base URL and adds the Authorization header when logged in.
export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Demo accounts never write: short-circuit any mutating request with a fake OK
  // response so the UI stays optimistic and nothing reaches the server.
  const method = (options.method || 'GET').toUpperCase();
  if (demoMode && method !== 'GET' && method !== 'HEAD') {
    return new Response(JSON.stringify({ demo: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // A 401 means the token is missing/expired/invalid -> log the user out.
  if (res.status === 401) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
  }
  return res;
}

// POST /api/auth/login -> { token, user }. Throws on bad credentials.
export async function login({ username, password }) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'Incorrect username or password.' : 'Login failed. Please try again.';
    throw new Error(msg);
  }
  return res.json(); // { token, user: { id, username, role, display_name } }
}

// GET /api/auth/me -> current user. Uses apiFetch so the token is attached.
export async function fetchMe() {
  const res = await apiFetch('/api/auth/me');
  if (!res.ok) throw new Error('Not authenticated');
  return res.json();
}
