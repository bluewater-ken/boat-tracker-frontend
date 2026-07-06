import { useState, useEffect } from 'react';
import { apiFetch } from './api';
import './RulesAdmin.css';

// Issue Rules — every auto-flag rule as a plain-English sentence with its number
// editable inline, plus an on/off switch. Saved to the backend; the rule runner
// reads these settings on every pass.

const RULE_DEFS = [
  { key: 'part_overdue', icon: '🕓', tab: 'Key Parts', before: 'Flag a part when it is', after: 'day(s) or more past its expected delivery and not Received.', def: 1 },
  { key: 'parts_unordered', icon: '🛒', tab: 'Key Parts', text: 'While a boat is in Glass Shop, flag it if any standard key parts are still Not Ordered.' },
  { key: 'backorder_stale', icon: '⏳', tab: 'Key Parts', before: 'Flag a backordered part after', after: 'day(s) with no new delivery date.', def: 7 },
  { key: 'stage_over_norm', icon: '🐌', tab: 'Schedule', before: 'Flag a boat running', after: "day(s) over its model's normal stage time (learned by the Timeline engine).", def: 3 },
  { key: 'behind_target', icon: '🎯', tab: 'Schedule', before: 'Flag a boat projected', after: 'day(s) or more past its target delivery date.', def: 5 },
  { key: 'flag_stale', icon: '⚠️', tab: 'Schedule', before: 'Remind about a boat flag left on for', after: 'day(s) without being cleared.', def: 7 },
  { key: 'lam_stalled', icon: '🧊', tab: 'Lamination', before: 'Flag a lamination task started', after: 'day(s) ago and still not finished.', def: 7 },
  { key: 'ugly_part', icon: '🙁', tab: 'Finishing', before: 'Flag a part that arrived Ugly with no progress after', after: 'day(s).', def: 3 },
  { key: 'asap_idle', icon: '🔥', tab: 'Finishing', before: 'Flag an ASAP task that has not moved for', after: 'day(s).', def: 3 },
  { key: 'wc_quiet', icon: '💤', tab: 'Assembly', before: 'Flag a started work center with no checklist activity for', after: 'day(s).', def: 4 },
  { key: 'build_improvement', icon: '🔧', tab: 'Build Improvements', text: 'Every unchecked Build Improvements item shows as an open issue.' },
  { key: 'resolve_snooze', icon: '😴', tab: 'General', before: 'A resolved-but-unfixed issue comes back after', after: 'hour(s).', def: 24 },
];

function RulesAdmin() {
  const [settings, setSettings] = useState({}); // rule_key -> { enabled, value }
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState(null); // brief "Saved ✓" feedback

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const r = await apiFetch('/api/issue-rules').catch(() => null);
      if (r && r.ok) {
        const rows = await r.json();
        const map = {};
        for (const row of rows) map[row.rule_key] = { enabled: row.enabled !== false, value: row.value };
        setSettings(map);
        setConnected(true);
      }
    } finally { setLoading(false); }
  };

  const get = (def) => {
    const s = settings[def.key] || {};
    return { enabled: s.enabled !== false, value: s.value ?? def.def };
  };

  const save = async (def, patch) => {
    const cur = get(def);
    const next = { ...cur, ...patch };
    setSettings(prev => ({ ...prev, [def.key]: next }));
    try {
      const r = await apiFetch(`/api/issue-rules/${def.key}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next.enabled, value: next.value }),
      });
      if (!r.ok) throw new Error();
      setSavedKey(def.key);
      setTimeout(() => setSavedKey(k => (k === def.key ? null : k)), 1500);
    } catch (e) { alert('Failed to save — is the issues backend set up?'); init(); }
  };

  if (loading) return <div className="loading">Loading rules...</div>;

  return (
    <div className="rules">
      <p className="rules-intro">
        These power the auto-flagged items on the Shop Feed's Issues list. Change a number or switch a
        rule off — takes effect on the next rule check (within ~15 minutes).
        {!connected && <strong> Rules backend isn't set up yet — showing defaults, read-only.</strong>}
      </p>
      {RULE_DEFS.map(def => {
        const { enabled, value } = get(def);
        return (
          <div key={def.key} className={`rule-row ${enabled ? '' : 'off'}`}>
            <label className="rule-switch" title={enabled ? 'Rule is ON' : 'Rule is OFF'}>
              <input type="checkbox" checked={enabled} disabled={!connected}
                onChange={e => save(def, { enabled: e.target.checked })} />
            </label>
            <span className="rule-icon">{def.icon}</span>
            <span className="rule-text">
              {def.text ? def.text : (
                <>
                  {def.before}{' '}
                  <input className="rule-num" type="number" min="0" value={value} disabled={!connected || !enabled}
                    onChange={e => setSettings(prev => ({ ...prev, [def.key]: { enabled, value: e.target.value === '' ? '' : +e.target.value } }))}
                    onBlur={e => { const v = Math.max(0, +e.target.value || def.def); save(def, { value: v }); }} />{' '}
                  {def.after}
                </>
              )}
              <span className="rule-tab">{def.tab}</span>
            </span>
            {savedKey === def.key && <span className="rule-saved">Saved ✓</span>}
          </div>
        );
      })}
      <p className="rules-note">
        Want a brand-new rule? Tell Ken's Claude session in plain English and it gets added here.
      </p>
    </div>
  );
}

export default RulesAdmin;
