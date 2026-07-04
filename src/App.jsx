import { useState, useEffect } from 'react';
import ProductionSchedule from './ProductionSchedule';
import BoatCommandCenter from './BoatCommandCenter';
import BoatInformation from './BoatInformation';
import KeyPartsTracker from './KeyPartsTracker';
import LaminationTracker from './LaminationTracker';
import FinishingTracker from './FinishingTracker';
import AssemblyTracker from './AssemblyTracker';
import ShopFeed from './ShopFeed';
import AdminPanel from './AdminPanel';
import Login from './Login';
import Logo from './Logo';
import { useAuth } from './AuthContext';
import './App.css';

const BASE_TABS = [
  { key: 'schedule', label: 'Production Schedule' },
  { key: 'boats', label: 'Boats' },
  { key: 'parts', label: 'Key Parts' },
  { key: 'lamination', label: 'Lamination' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'assembly', label: 'Assembly' },
  { key: 'feed', label: 'Shop Feed' },
];

function App() {
  const { user, status, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('schedule');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [manageBoats, setManageBoats] = useState(false);
  const handleRefresh = () => setRefreshTrigger(p => p + 1);

  // Close the Manage Boats drawer with Esc.
  useEffect(() => {
    if (!manageBoats) return;
    const onKey = (e) => { if (e.key === 'Escape') setManageBoats(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manageBoats]);

  // Gate the whole app behind login.
  if (status === 'loading') return <div className="loading">Loading…</div>;
  if (status === 'anon') return <Login />;

  const roleLabel = user?.role === 'ops' ? 'Ops' : user?.role === 'shop' ? 'Shop' : '';
  const isOps = user?.role === 'ops';
  const tabs = isOps ? [...BASE_TABS, { key: 'admin', label: 'Admin' }] : BASE_TABS;

  return (
    <div className="app">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-left">
            <Logo size={19} />
            <span className="app-header-boss">
              <span className="boss-name">B.O.S.S</span>
              <span className="boss-sub">Bluewater Operations and Shop System</span>
            </span>
          </div>
          <div className="app-header-user">
            <span className="app-header-name">{user?.display_name || user?.username}{roleLabel ? ` · ${roleLabel}` : ''}</span>
            <button className="btn-logout" onClick={signOut}>Log Out</button>
          </div>
        </header>
        <nav className="tab-navigation">
          {tabs.map(t => (
            <button key={t.key} className={`tab-button ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
          ))}
        </nav>
        <main className="app-content">
          {activeTab === 'schedule' && <ProductionSchedule refreshTrigger={refreshTrigger} onRefresh={handleRefresh} onManageBoats={() => setManageBoats(true)} />}
          {activeTab === 'boats' && <BoatCommandCenter />}
          {activeTab === 'parts' && <KeyPartsTracker />}
          {activeTab === 'lamination' && <LaminationTracker />}
          {activeTab === 'finishing' && <FinishingTracker />}
          {activeTab === 'assembly' && <AssemblyTracker />}
          {activeTab === 'feed' && <ShopFeed />}
          {activeTab === 'admin' && isOps && <AdminPanel />}
        </main>
      </div>

      {isOps && manageBoats && (
        <div className="drawer-backdrop" onClick={() => setManageBoats(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <span className="drawer-title">Manage Boats</span>
              <button className="drawer-close" onClick={() => setManageBoats(false)}>✕ Close</button>
            </div>
            <div className="drawer-body">
              <BoatInformation refreshTrigger={refreshTrigger} onRefresh={handleRefresh} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
