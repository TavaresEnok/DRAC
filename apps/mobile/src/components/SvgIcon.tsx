import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import type { IconName } from '../types';

export function SvgIcon({ name, size = 24, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
  const common = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'home' ? <Path {...common} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> : null}
      {name === 'grid' ? <><Rect {...common} x="3" y="3" width="7" height="7" /><Rect {...common} x="14" y="3" width="7" height="7" /><Rect {...common} x="14" y="14" width="7" height="7" /><Rect {...common} x="3" y="14" width="7" height="7" /></> : null}
      {name === 'user' ? <><Path {...common} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Circle {...common} cx="12" cy="7" r="4" /></> : null}
      {name === 'settings' ? <><Circle {...common} cx="12" cy="12" r="3" /><Path {...common} d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></> : null}
      {name === 'camera' ? <><Path {...common} d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><Circle {...common} cx="12" cy="13" r="4" /></> : null}
      {name === 'mic' ? <><Path {...common} d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><Path {...common} d="M19 10v2a7 7 0 0 1-14 0v-2" /><Line {...common} x1="12" y1="19" x2="12" y2="23" /><Line {...common} x1="8" y1="23" x2="16" y2="23" /></> : null}
      {name === 'video' ? <><Polygon {...common} points="23 7 16 12 23 17 23 7" /><Rect {...common} x="1" y="5" width="15" height="14" rx="2" ry="2" /></> : null}
      {name === 'chevronLeft' ? <Polyline {...common} points="15 18 9 12 15 6" /> : null}
      {name === 'plus' ? <><Line {...common} x1="12" y1="5" x2="12" y2="19" /><Line {...common} x1="5" y1="12" x2="19" y2="12" /></> : null}
      {name === 'bell' ? <><Path {...common} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path {...common} d="M13.73 21a2 2 0 0 1-3.46 0" /></> : null}
      {name === 'move' ? <><Polyline {...common} points="5 9 2 12 5 15" /><Polyline {...common} points="9 5 12 2 15 5" /><Polyline {...common} points="19 9 22 12 19 15" /><Polyline {...common} points="9 19 12 22 15 19" /><Line {...common} x1="2" y1="12" x2="22" y2="12" /><Line {...common} x1="12" y1="2" x2="12" y2="22" /></> : null}
      {name === 'play' ? <Polygon points="5 3 19 12 5 21 5 3" fill={color} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {name === 'download' ? <><Path {...common} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><Polyline {...common} points="7 10 12 15 17 10" /><Line {...common} x1="12" y1="15" x2="12" y2="3" /></> : null}
      {name === 'calendar' ? <><Rect {...common} x="3" y="4" width="18" height="18" rx="2" ry="2" /><Line {...common} x1="16" y1="2" x2="16" y2="6" /><Line {...common} x1="8" y1="2" x2="8" y2="6" /><Line {...common} x1="3" y1="10" x2="21" y2="10" /></> : null}
    </Svg>
  );
}
