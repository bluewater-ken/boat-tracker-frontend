import { useState } from 'react';
import ProductionSchedule from './ProductionSchedule';
import BoatInformation from './BoatInformation';
import KeyPartsTracker from './KeyPartsTracker';
import Login from './Login';
import Logo from './Logo';
import { useAuth } from './AuthContext';
import './App.css';

const TABS = [
  { key: 'schedule', label: 'Production Schedule' },
  { key: 'boats', label: 'Boat Information' },
  { key: 'parts', label: 'Key Parts' },
];

function App() {
  const { user, status, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('schedule');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const handleRefresh = () => setRefreshTrigger(p => p + 1);

  // Gate the whole app behind login.
  if (status === 'loading') return <div className="loading">Loading…</div>;
  if (status === 'anon') return <Login />;

  const roleLabel = user?.role === 'ops' ? 'Ops' : user?.role === 'shop' ? 'Shop' : '';

  return (
    <div className="app">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-left">
            <Logo size={19} />
            <span className="app-header-context">Production Tracker</span>
          </div>
          <div className="app-header-user">
            <span className="app-header-name">{user?.display_name || user?.username}{roleLabel ? ` · ${roleLabel}` : ''}</span>
            <button className="btn-logout" onClick={signOut}>Log Out</button>
          </div>
        </header>
        <nav className="tab-navigation">
          {TABS.map(t => (
            <button key={t.key} className={`tab-button ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
          ))}
        </nav>
        <main className="app-content">
          {activeTab === 'schedule' && <ProductionSchedule refreshTrigger={refreshTrigger} onRefresh={handleRefresh} />}
          {activeTab === 'boats' && <BoatInformation refreshTrigger={refreshTrigger} onRefresh={handleRefresh} />}
          {activeTab === 'parts' && <KeyPartsTracker />}
        </main>
      </div>
    </div>
  );
}

export default App;
