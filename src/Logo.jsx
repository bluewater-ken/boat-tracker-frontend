// Bluewater wordmark. CSS stand-in matching the brand logo (two skewed steel
// bars + italic "BLUEWATER"). TODO: swap for the real PNG once it's in
// src/assets — replace the inner markup with <img src={logoWhite} .../>.
// `light` = white text for navy backgrounds; otherwise navy text for white ones.
function Logo({ size = 19, light = true }) {
  const barH = size * 1.1;
  const bar = { display: 'inline-block', width: size * 0.25, height: barH, background: '#A9C3D4', transform: 'skewX(-12deg)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={bar} />
      <span style={bar} />
      <span style={{ fontSize: size, fontWeight: 800, fontStyle: 'italic', color: light ? '#fff' : '#173A5E', letterSpacing: 0.5, marginLeft: 4, fontFamily: 'Arial, sans-serif' }}>BLUEWATER</span>
    </span>
  );
}

export default Logo;
