import { useState, useEffect } from 'react';

// True on phone-width screens. Trackers use it to switch to their mobile (boat) layout
// and to show the action menu as a bottom sheet. 640px = the phone/tablet break we use app-wide.
export default function useIsMobile(query = '(max-width: 640px)') {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = () => setMobile(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [query]);
  return mobile;
}
