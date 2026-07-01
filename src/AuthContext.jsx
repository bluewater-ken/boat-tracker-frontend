// Holds the logged-in user for the whole app and decides whether to show
// the login screen or the app. Any component can read it with useAuth().
import { createContext, useContext, useEffect, useState } from 'react';
import {
  login as apiLogin,
  fetchMe,
  setToken,
  clearToken,
  getToken,
  setUnauthorizedHandler,
} from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'loading' = checking a saved token, 'authed' = logged in, 'anon' = show login.
  const [status, setStatus] = useState('loading');

  const signOut = () => {
    clearToken();
    setUser(null);
    setStatus('anon');
  };

  const signIn = async (username, password) => {
    const { token, user } = await apiLogin({ username, password });
    setToken(token);
    setUser(user);
    setStatus('authed');
  };

  // On first load: if we have a saved token, verify it with the backend.
  useEffect(() => {
    // Let a 401 from anywhere in the app bounce us back to login.
    setUnauthorizedHandler(signOut);

    if (!getToken()) {
      setStatus('anon');
      return;
    }
    fetchMe()
      .then((u) => {
        setUser(u);
        setStatus('authed');
      })
      .catch(() => {
        clearToken();
        setUser(null);
        setStatus('anon');
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
