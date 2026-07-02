import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import { useAuth } from './AuthContext';
import './UsersAdmin.css';

// Ops-only screen to manage logins. Talks to the existing backend user routes:
// GET/POST/PUT/DELETE /api/users (see CLAUDE.md / BRD §9c).
const EMPTY = { username: '', display_name: '', password: '', role: 'shop' };

function UsersAdmin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null); // null | 'new' | <user id being edited>
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/users');
      if (!res.ok) throw new Error();
      setUsers(await res.json());
    } catch (e) { setError('Failed to load users. (Are you signed in as Ops?)'); }
    finally { setLoading(false); }
  };

  const startNew = () => { setMode('new'); setForm(EMPTY); setError(''); };
  const startEdit = (u) => { setMode(u.id); setForm({ username: u.username, display_name: u.display_name || '', password: '', role: u.role }); setError(''); };
  const cancel = () => { setMode(null); setError(''); };
  const change = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const save = async () => {
    setError('');
    if (!form.username.trim()) { setError('Username is required.'); return; }
    if (mode === 'new' && !form.password) { setError('Set a password for the new user.'); return; }
    setSaving(true);
    try {
      let res;
      if (mode === 'new') {
        res = await apiFetch('/api/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: form.username.trim(), display_name: form.display_name.trim(), password: form.password, role: form.role }),
        });
      } else {
        const body = { display_name: form.display_name.trim(), role: form.role };
        if (form.password) body.password = form.password; // only reset if a new one was typed
        res = await apiFetch(`/api/users/${mode}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error(res.status === 409 ? 'That username is already taken.' : 'Save failed. Please try again.');
      setMode(null); setForm(EMPTY); fetchUsers();
    } catch (e) { setError(e.message || 'Save failed.'); }
    finally { setSaving(false); }
  };

  const remove = async (u) => {
    if (!u || u.id === user?.id) return; // never delete your own account
    if (!window.confirm(`Remove ${u.display_name || u.username}? They will no longer be able to log in.`)) return;
    try {
      const res = await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      if (mode === u.id) setMode(null);
      fetchUsers();
    } catch (e) { setError('Delete failed.'); }
  };

  if (loading) return <div className="loading">Loading users...</div>;

  const editingUser = typeof mode === 'number' ? users.find(u => u.id === mode) : null;

  return (
    <div className="users">
      <div className="users-list-panel">
        <div className="users-head">
          <h2>Users ({users.length})</h2>
          <button className="users-newbtn" onClick={startNew}>+ New User</button>
        </div>
        <div className="users-list">
          {users.map(u => (
            <div key={u.id} className={`user-row ${mode === u.id ? 'selected' : ''}`} onClick={() => startEdit(u)}>
              <div className="user-main">
                <div className="user-name">{u.display_name || u.username}{u.id === user?.id ? ' (you)' : ''}</div>
                <div className="user-username">@{u.username}</div>
              </div>
              <span className={`user-role role-${u.role}`}>{u.role === 'ops' ? 'Ops' : 'Shop'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="users-form-panel">
        {mode ? (
          <>
            <h2>{mode === 'new' ? 'New user' : `Edit ${form.display_name || form.username}`}</h2>
            {error && <div className="users-error">{error}</div>}
            <div className="form-group"><label>Display name</label>
              <input name="display_name" value={form.display_name} onChange={change} placeholder="e.g. Mike Torres" />
            </div>
            <div className="form-group"><label>Username</label>
              <input name="username" value={form.username} onChange={change} disabled={mode !== 'new'} placeholder="e.g. mike" autoComplete="off" />
            </div>
            <div className="form-group"><label>{mode === 'new' ? 'Password' : 'New password (leave blank to keep current)'}</label>
              <input name="password" type="password" value={form.password} onChange={change} placeholder={mode === 'new' ? 'Set a password' : '••••••••'} autoComplete="new-password" />
            </div>
            <div className="form-group"><label>Role</label>
              <select name="role" value={form.role} onChange={change}>
                <option value="shop">Shop — floor updates only</option>
                <option value="ops">Ops — full access</option>
              </select>
            </div>
            <div className="users-actions">
              <button className="users-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="users-cancel" onClick={cancel}>Cancel</button>
              {editingUser && editingUser.id !== user?.id && (
                <button className="users-delete" onClick={() => remove(editingUser)}>Delete</button>
              )}
            </div>
          </>
        ) : (
          <div className="users-empty">
            <p>Select a person to edit, or add a new one.</p>
            <p className="users-empty-hint"><b>Ops</b> = full access (everything). <b>Shop</b> = floor updates only — advance status, step back, and set flags.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default UsersAdmin;
