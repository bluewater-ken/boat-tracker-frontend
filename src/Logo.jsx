import logoWhite from './assets/bluewater-white.png';
import logoNavy from './assets/bluewater-navy.png';

// The real Bluewater wordmark. `light` = the white version for dark/navy
// backgrounds (e.g. the header bar); otherwise the navy version for light
// surfaces (e.g. the white login card).
function Logo({ size = 19, light = true }) {
  return (
    <img
      src={light ? logoWhite : logoNavy}
      alt="Bluewater"
      style={{ height: Math.round(size * 1.35), width: 'auto', display: 'block' }}
    />
  );
}

export default Logo;
