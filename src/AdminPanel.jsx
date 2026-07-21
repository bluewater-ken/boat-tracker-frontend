import { useState } from 'react';
import { useAuth } from './AuthContext';
import { hasFullAccess } from './access';
import UsersAdmin from './UsersAdmin';
import RulesAdmin from './RulesAdmin';
import TimelineAdmin from './TimelineAdmin';
import CompletionsChart from './CompletionsChart';
import BoatReportsAdmin from './BoatReportsAdmin';
import PaymentsAdmin from './PaymentsAdmin';
import './AdminPanel.css';

// Ops-only Admin tab — home for management screens: Users, Issue Rules, Timeline,
// Throughput, and whatever comes later (announcements, TV schedule, settings...).

const SECTIONS = [
  { key: 'users', label: 'Users' },
  { key: 'rules', label: 'Issue Rules' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'throughput', label: 'Throughput' },
  { key: 'reports', label: 'Boat Reports' },
];

function AdminPanel() {
  const [section, setSection] = useState('users');
  const { user } = useAuth();
  // Payments is owner-level (money) — Ken + Kelly only (see access.js). The section
  // is hidden for everyone else, and the backend routes are independently gated to
  // the same allowlist so this isn't just a UI courtesy.
  const isKen = hasFullAccess(user);
  const sections = isKen ? [...SECTIONS, { key: 'payments', label: 'Payments' }] : SECTIONS;
  return (
    <div className="admin">
      <div className="admin-nav">
        {sections.map(s => (
          <button key={s.key} className={`admin-nav-btn ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      <div className="admin-body">
        {section === 'users' && <UsersAdmin />}
        {section === 'rules' && <RulesAdmin />}
        {section === 'timeline' && <TimelineAdmin />}
        {section === 'throughput' && <CompletionsChart />}
        {section === 'reports' && <BoatReportsAdmin />}
        {section === 'payments' && isKen && <PaymentsAdmin />}
      </div>
    </div>
  );
}

export default AdminPanel;
