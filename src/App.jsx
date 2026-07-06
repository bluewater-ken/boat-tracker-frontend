import { useState, useEffect, lazy, Suspense } from 'react';
import ProductionSchedule from './ProductionSchedule'; // default tab — eager so first paint has no delay
import Login from './Login';
import Logo from './Logo';
import { useAuth } from './AuthContext';
import { isDemoUser } from './api';
import './App.css';

// Other tabs load only when opened — keeps the initial download small.
const BoatInformation = lazy(() => import('./BoatInformation'));
const KeyPartsTracker = lazy(() => import('./KeyPartsTracker'));
const LaminationTracker = lazy(() => import('./LaminationTracker'));
const FinishingTracker = lazy(() => import('./FinishingTracker'));
const AssemblyTracker = lazy(() => import('./AssemblyTracker'));
const GanttChart = lazy(() => import('./GanttChart'));
const ShopFeed = lazy(() => import('./ShopFeed'));
const AdminPanel = lazy(() => import('./AdminPanel'));
const AskBoss = lazy(() => import('./AskBoss'));

const BASE_TABS = [
  { key: 'schedule', label: 'Production Schedule' },
  { key: 'gantt', label: 'Timeline' },
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
  const [askOpen, setAskOpen] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const handleRefresh = () => setRefreshTrigger(p => p + 1);

  // Close the Manage Boats drawer with Esc.
  useEffect(() => {
    if (!manageBoats) return;
    const onKey = (e) => { if (e.key === 'Escape') setManageBoats(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manageBoats]);

  // Reset reportIssueOpen when leaving the feed tab (so it doesn't stay open on return).
  useEffect(() => {
    if (activeTab !== 'feed') setReportIssueOpen(false);
  }, [activeTab]);

  // Gate the whole app behind login.
  if (status === 'loading') return <div className="loading">Loading…</div>;
  if (status === 'anon') return <Login />;

  const roleLabel = user?.role === 'ops' ? 'Ops' : user?.role === 'shop' ? 'Shop' : '';
  const isOps = user?.role === 'ops';
  const isDemo = isDemoUser(user);
  const tabs = isOps ? [...BASE_TABS, { key: 'admin', label: 'Admin' }] : BASE_TABS;

  return (
    <div className="app">
      {isDemo && (
        <div className="demo-banner">🔒 Demo mode — explore anything; your changes are shown but never saved.</div>
      )}
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-left">
            <Logo size={19} />
            <span className="app-header-boss">
              <span className="boss-name">B.O.S.S</span>
              <span className="boss-sub">Bluewater Operations<br />and Shop System</span>
            </span>
          </div>
          <div className="app-header-user">
            <button className="btn-ask" onClick={() => setAskOpen(true)}>💬 Ask the B.O.S.S</button>
            <button className="btn-report" onClick={() => { setActiveTab('feed'); setReportIssueOpen(true); }}>📋 Report Issue</button>
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
          <Suspense fallback={<div className="loading">Loading…</div>}>
            {activeTab === 'schedule' && <ProductionSchedule refreshTrigger={refreshTrigger} onRefresh={handleRefresh} onManageBoats={() => setManageBoats(true)} />}
            {activeTab === 'parts' && <KeyPartsTracker />}
            {activeTab === 'lamination' && <LaminationTracker />}
            {activeTab === 'finishing' && <FinishingTracker />}
            {activeTab === 'assembly' && <AssemblyTracker />}
            {activeTab === 'gantt' && <GanttChart />}
            {activeTab === 'feed' && <ShopFeed initialView="issues" initialPostingOpen={reportIssueOpen} />}
            {activeTab === 'admin' && isOps && <AdminPanel />}
          </Suspense>
        </main>
      </div>

      {askOpen && (
        <Suspense fallback={null}><AskBoss onClose={() => setAskOpen(false)} /></Suspense>
      )}

      {isOps && manageBoats && (
        <div className="drawer-backdrop" onClick={() => setManageBoats(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <span className="drawer-title">Manage Boats</span>
              <button className="drawer-close" onClick={() => setManageBoats(false)}>✕ Close</button>
            </div>
            <div className="drawer-body">
              <Suspense fallback={<div className="loading">Loading…</div>}>
                <BoatInformation refreshTrigger={refreshTrigger} onRefresh={handleRefresh} />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
