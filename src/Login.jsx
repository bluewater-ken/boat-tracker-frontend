import { useState } from 'react';
import { useAuth } from './AuthContext';
import Logo from './Logo';
import './Login.css';

function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
      setSubmitting(false);
    }
    // On success the app re-renders to the tracker, so no need to reset state.
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo"><Logo size={30} light={false} /></div>
        <div className="login-subtitle">Production Tracker</div>

        <label className="login-field">
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="login-button" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

export default Login;
