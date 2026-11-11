import { useMemo } from 'react';
import type { City } from '../lib/types';
import { useStore } from '../lib/store';
import { cityName } from '../lib/cities';
import { useI18n } from '../i18n';

interface Props {
  fromCityId: string;
  toCityId: string;
  stopCityIds?: string[];
  height?: number;
}

export function MapView({ fromCityId, toCityId, stopCityIds = [], height = 240 }: Props) {
  const { t, lang } = useI18n();
  const cities = useStore((s) => s.cities);

  const { project, route, dots, from, to } = useMemo(() => {
    const from = cities.find((c) => c.id === fromCityId);
    const to = cities.find((c) => c.id === toCityId);
    if (!from || !to) return { project: null, route: '', dots: [] as Array<{ c: City; x: number; y: number }>, from, to };
    const focus = [from, to, ...stopCityIds.map((id) => cities.find((c) => c.id === id)).filter((c): c is City => !!c)];
    const lats = focus.map((c) => c.lat);
    const lons = focus.map((c) => c.lon);
    const pad = 1.6;
    const minLat = Math.min(...lats) - pad;
    const maxLat = Math.max(...lats) + pad;
    const minLon = Math.min(...lons) - pad;
    const maxLon = Math.max(...lons) + pad;
    const W = 440;
    const H = height;
    const project = (c: { lat: number; lon: number }) => ({
      x: 24 + ((c.lon - minLon) / (maxLon - minLon || 1)) * (W - 48),
      y: H - 30 - ((c.lat - minLat) / (maxLat - minLat || 1)) * (H - 60),
    });
    const p1 = project(from);
    const p2 = project(to);
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2 - Math.min(46, Math.abs(p2.x - p1.x) * 0.18 + 14);
    const route = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;
    const dots = cities
      .filter((c) => c.lat >= minLat && c.lat <= maxLat && c.lon >= minLon && c.lon <= maxLon)
      .map((c) => ({ c, ...project(c) }));
    return { project, route, dots, from, to };
  }, [cities, fromCityId, toCityId, stopCityIds, height]);

  if (!project || !from || !to) return null;
  const p1 = project(from);
  const p2 = project(to);

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 440 ${height}`} role="img" aria-label={`${cityName(from, lang)} → ${cityName(to, lang)}`}>
        <defs>
          <linearGradient id="mapbg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eaf0fd" />
            <stop offset="100%" stopColor="#d9e4fa" />
          </linearGradient>
        </defs>
        <rect width="440" height={height} fill="url(#mapbg)" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={i * 55} y1="0" x2={i * 55} y2={height} stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1" />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * (height / 5)} x2="440" y2={i * (height / 5)} stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1" />
        ))}
        {dots.map(({ c, x, y }) => (
          <g key={c.id}>
            <circle cx={x} cy={y} r="3" fill="#9aa8d8" />
            <text x={x + 6} y={y + 3} fontSize="9" fill="#6b7280" fontFamily="inherit">{cityName(c, lang)}</text>
          </g>
        ))}
        <path d={route} fill="none" stroke="#000080" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
        {[...stopCityIds].map((id) => {
          const c = cities.find((x) => x.id === id);
          if (!c) return null;
          const p = project(c);
          return <circle key={id} cx={p.x} cy={p.y} r="5" fill="#fff" stroke="#000080" strokeWidth="2.5" />;
        })}
        <g>
          <circle cx={p1.x} cy={p1.y} r="8" fill="#000080" fillOpacity="0.15" />
          <circle cx={p1.x} cy={p1.y} r="5" fill="#fff" stroke="#000080" strokeWidth="3" />
          <text x={p1.x} y={p1.y - 12} fontSize="11" fontWeight="700" fill="#05052e" textAnchor="middle" fontFamily="inherit">{cityName(from, lang)}</text>
        </g>
        <g>
          <circle cx={p2.x} cy={p2.y} r="8" fill="#000080" fillOpacity="0.15" />
          <path d={`M ${p2.x} ${p2.y - 14} c -5 0 -8.5 3.6 -8.5 8 c 0 6 8.5 12 8.5 12 s 8.5 -6 8.5 -12 c 0 -4.4 -3.5 -8 -8.5 -8 Z`} fill="#000080" />
          <circle cx={p2.x} cy={p2.y - 6.5} r="2.6" fill="#fff" />
          <text x={p2.x} y={p2.y + 18} fontSize="11" fontWeight="700" fill="#05052e" textAnchor="middle" fontFamily="inherit">{cityName(to, lang)}</text>
        </g>
      </svg>
      <div className="map-note">{t('search.mapNote')}</div>
    </div>
  );
}