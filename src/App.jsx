import { useState } from 'react';
import ProductionSchedule from './ProductionSchedule';
import BoatInformation from './BoatInformation';
import KeyPartsTracker from './KeyPartsTracker';
import Login from './Login';
import { useAuth } from './AuthContext';
import './App.css';

function App() {
  const { user, status, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('schedule');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const handleRefresh = () => setRefreshTrigger(p => p + 1);

  // Gate the whole app behind login.
  if (status === 'loading') return <div className="loading">Loading…</div>;
  if (status === 'anon') return <Login />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-titles">
          {/* TODO: swap this text for the white Bluewater logo PNG when Ken provides it. */}
          <h1>Bluewater Sportfish</h1>
          <p>Production Tracker</p>
        </div>
        <div className="app-header-user">
          <span className="app-header-name">{user?.display_name || user?.username}</span>
          <button className="btn-logout" onClick={signOut}>Log Out</button>
        </div>
      </header>
      <nav className="tab-navigation">
        <button className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>Production Schedule</button>
        <button className={`tab-button ${activeTab === 'boats' ? 'active' : ''}`} onClick={() => setActiveTab('boats')}>Boat Information</button>
        <button className={`tab-button ${activeTab === 'parts' ? 'active' : ''}`} onClick={() => setActiveTab('parts')}>Key Parts</button>
      </nav>
      <main className="app-content">
        {activeTab === 'schedule' && <ProductionSchedule refreshTrigger={refreshTrigger} onRefresh={handleRefresh} />}
        {activeTab === 'boats' && <BoatInformation refreshTrigger={refreshTrigger} onRefresh={handleRefresh} />}
        {activeTab === 'parts' && <KeyPartsTracker />}
      </main>
    </div>
  );
}

export default App;
