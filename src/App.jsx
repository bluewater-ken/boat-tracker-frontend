import { useState } from 'react';
import ProductionSchedule from './ProductionSchedule';
import BoatInformation from './BoatInformation';
import KeyPartsTracker from './KeyPartsTracker';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const handleRefresh = () => setRefreshTrigger(p => p + 1);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Boat Production Tracker</h1>
        <p>Manage boat production schedule and information</p>
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