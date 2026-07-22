import { useState } from 'react';
import { useAuth } from './AuthContext';
import { hasFullAccess } from './access';
import { canEdit } from './permissions';
import UsersAdmin from './UsersAdmin';
import RulesAdmin from './RulesAdmin';
import TimelineAdmin from './TimelineAdmin';
import CompletionsChart from './CompletionsChart';
import BoatReportsAdmin from './BoatReportsAdmin';
import PaymentsAdmin from './PaymentsAdmin';
import './AdminPanel.css';

// Admin tab — management screens. Any Ops user sees Rules / Timeline / Throughput /
// Boat Reports. Users (who can grant access) and Payments (money) are owner-only
// (Ken + Kelly, see access.js) — so an Ops user can't hand themselves permissions.

// Sections every Ops user can reach.
const OPS_SECTIONS = [
  { key: 'rules', label: 'Issue Rules' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'throughput', label: 'Throughput' },
  { key: 'reports', label: 'Boat Reports' },
];

function AdminPanel() {
  const [section, setSection] = useState('rules');
  const { user } = useAuth();
  const isKen = hasFullAccess(user); // owner allowlist — Ken + Kelly
  // The Timeline section edits the projector rules (norms/blackouts/settings), which
  // the backend gates on gantt-edit. Only show it to users who can edit the timeline,
  // so nobody sees a rules editor whose every save would 403.
  const canTimeline = canEdit(user, 'gantt');
  const opsSections = OPS_SECTIONS.filter(s => s.key !== 'timeline' || canTimeline);
  const sections = isKen
    ? [{ key: 'users', label: 'Users' }, ...opsSections, { key: 'payments', label: 'Payments' }]
    : opsSections;
  // If the chosen section isn't available to this user, show the first one that is.
  const shown = sections.some(s => s.key === section) ? section : sections[0]?.key;
  return (
    <div className="admin">
      <div className="admin-nav">
        {sections.map(s => (
          <button key={s.key} className={`admin-nav-btn ${shown === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>
      <div className="admin-body">
        {shown === 'users' && isKen && <UsersAdmin />}
        {shown === 'rules' && <RulesAdmin />}
        {shown === 'timeline' && canTimeline && <TimelineAdmin />}
        {shown === 'throughput' && <CompletionsChart />}
        {shown === 'reports' && <BoatReportsAdmin />}
        {shown === 'payments' && isKen && <PaymentsAdmin />}
      </div>
    </div>
  );
}

export default AdminPanel;
