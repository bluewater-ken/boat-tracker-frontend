// Shared flag definitions + renderers, reused across trackers (BRD §8).
// Icons are inline SVG (no dependencies) so color and size are fully controllable.
import './flags.css';

function Svg({ children, size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {children}
    </svg>
  );
}

// Warning triangle — Issue / Delay
const TriangleIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3 L22 20 H2 Z" />
    <line x1="12" y1="10" x2="12" y2="14.5" />
    <line x1="12" y1="17" x2="12" y2="17.1" />
  </Svg>
);
// Refresh/loop — Required Rework
const LoopIcon = (p) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <polyline points="21 3 21 9 15 9" />
  </Svg>
);
// Flag — Unsatisfactory
const FlagIcon = (p) => (
  <Svg {...p}>
    <line x1="5" y1="21" x2="5" y2="4" />
    <path d="M5 4 h12 l-3 4 3 4 H5" />
  </Svg>
);
// Clock — Late
const ClockIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 16 14" />
  </Svg>
);
// Hourglass — Backordered
const HourglassIcon = (p) => (
  <Svg {...p}>
    <path d="M6 3 h12 l-6 9 z" />
    <path d="M6 21 h12 l-6 -9 z" />
  </Svg>
);
// Half-filled circle — Partial (some of the order arrived)
const HalfIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3 a9 9 0 0 1 0 18 z" fill={p.color} stroke="none" />
  </Svg>
);

// Face icons for the Finishing part grade (how the part arrived from lamination).
const HappyIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="9" y1="10" x2="9" y2="10.1" />
    <line x1="15" y1="10" x2="15" y2="10.1" />
    <path d="M8 14.5 a4 4 0 0 0 8 0" />
  </Svg>
);
const NeutralIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="9" y1="10" x2="9" y2="10.1" />
    <line x1="15" y1="10" x2="15" y2="10.1" />
    <line x1="8.5" y1="15" x2="15.5" y2="15" />
  </Svg>
);
const SadIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="9" y1="10" x2="9" y2="10.1" />
    <line x1="15" y1="10" x2="15" y2="10.1" />
    <path d="M8 16 a4 4 0 0 1 8 0" />
  </Svg>
);

// Finishing part grade — pick ONE (BRD §9). Not booleans like the other flag sets.
export const GRADES = [
  { key: 'good', label: 'Good', color: '#3B6D11', Icon: HappyIcon },
  { key: 'bad', label: 'Bad', color: '#BA7517', Icon: NeutralIcon },
  { key: 'ugly', label: 'Ugly', color: '#A32D2D', Icon: SadIcon },
];

// Standard three flags (Lamination / Production Schedule).
export const STANDARD_FLAGS = [
  { key: 'flag_issue', label: 'Issue / Delay', color: '#BA7517', Icon: TriangleIcon },
  { key: 'flag_rework', label: 'Required Rework', color: '#185FA5', Icon: LoopIcon },
  { key: 'flag_unsatisfactory', label: 'Unsatisfactory', color: '#A32D2D', Icon: FlagIcon },
];

// Key Parts has its own three (BRD §6).
export const KEYPARTS_FLAGS = [
  { key: 'flag_late', label: 'Late', color: '#A32D2D', Icon: ClockIcon },
  { key: 'flag_backordered', label: 'Backordered', color: '#BA7517', Icon: HourglassIcon },
  { key: 'flag_partial', label: 'Partial', color: '#2E7D8A', Icon: HalfIcon },
  { key: 'flag_unsatisfactory', label: 'Unsatisfactory', color: '#185FA5', Icon: FlagIcon },
];

// Production Schedule (boat-level): the standard three plus two manual parts flags.
// Rendered as text labels on the board (see FlagTags), not icons.
export const SCHEDULE_FLAGS = [
  ...STANDARD_FLAGS,
  { key: 'flag_missing_parts', label: 'Missing parts', color: '#BA7517', Icon: TriangleIcon },
  { key: 'flag_late_parts', label: 'Late parts', color: '#A32D2D', Icon: ClockIcon },
];

// Small colored dots (no text) for cells/rows — matches BluewaterDemo.jsx.
export function FlagDots({ flags, defs, size = 7 }) {
  const active = defs.filter((d) => flags && flags[d.key]);
  if (!active.length) return null;
  return (
    <span className="flag-dots">
      {active.map((d) => (
        <span key={d.key} className="flag-dot" title={d.label} style={{ width: size, height: size, background: d.color }} />
      ))}
    </span>
  );
}

// Text labels for active flags (small colored pills). Preferred where there's room.
export function FlagTags({ flags, defs }) {
  const active = defs.filter((d) => flags && flags[d.key]);
  if (!active.length) return null;
  return (
    <span className="flag-tags">
      {active.map((d) => (
        <span key={d.key} className="flag-tag" style={{ color: d.color, background: d.color + '18' }}>{d.label}</span>
      ))}
    </span>
  );
}

// Bare corner icons (no text) for cells/rows.
export function FlagIcons({ flags, defs, size = 13 }) {
  const active = defs.filter((d) => flags && flags[d.key]);
  if (!active.length) return null;
  return (
    <span className="flag-icons">
      {active.map((d) => (
        <span key={d.key} className="flag-icon" title={d.label}>
          <d.Icon size={size} color={d.color} />
        </span>
      ))}
    </span>
  );
}

// Labeled toggle controls for the action menu.
export function FlagToggles({ flags, defs, onToggle }) {
  return (
    <div className="flag-toggles">
      {defs.map((d) => {
        const on = !!(flags && flags[d.key]);
        return (
          <button
            type="button"
            key={d.key}
            className={`flag-toggle ${on ? 'on' : ''}`}
            style={on ? { borderColor: d.color, color: d.color } : undefined}
            onClick={() => onToggle(d.key)}
          >
            <d.Icon size={15} color={on ? d.color : '#9aa5ad'} />
            <span>{d.label}</span>
          </button>
        );
      })}
    </div>
  );
}
