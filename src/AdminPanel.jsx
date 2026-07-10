import { useState } from 'react';
import UsersAdmin from './UsersAdmin';
import RulesAdmin from './RulesAdmin';
import TimelineAdmin from './TimelineAdmin';
import './AdminPanel.css';

// Ops-only Admin tab — home for management screens: Users, Issue Rules, Timeline, and
// whatever comes later (announcements, TV schedule, settings...).

const SECTIONS = [
  { key: 'users', label: 'Users' },
  { key: 'rules', label: 'Issue Rules' },
  { key: 'timeline', label: 'Timeline' },
];

function AdminPanel() {
  const [section, setSection] = useState('users');
  return (
    <div className="admin">
      <div className="admin-nav">
        {SECTIONS.map(s => (
          <button key={s.key} className={`admin-nav-btn ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      <div className="admin-body">
        {section === 'users' && <UsersAdmin />}
        {section === 'rules' && <RulesAdmin />}
        {section === 'timeline' && <TimelineAdmin />}
      </div>
    </div>
  );
}

export default AdminPanel;
