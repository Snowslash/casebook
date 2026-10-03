import type { CountGroup } from './logbook';

interface PieSegment {
  key: string;
  start: number;
  end: number;
  path: string;
}

export function pieSegments(groups: readonly CountGroup[]): PieSegment[] {
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  if (total === 0) return [];
  const point = (fraction: number) => {
    const angle = fraction * Math.PI * 2 - Math.PI / 2;
    return `${Number((110 + 92 * Math.cos(angle)).toFixed(6))} ${Number((110 + 92 * Math.sin(angle)).toFixed(6))}`;
  };
  let cumulative = 0;
  return groups.map(group => {
    const start = cumulative / total;
    cumulative += group.count;
    const end = cumulative / total;
    // Two half-sector arcs also render the single-category, full-circle case.
    const path = `M 110 110 L ${point(start)} A 92 92 0 0 1 ${point((start + end) / 2)} A 92 92 0 0 1 ${point(end)} Z`;
    return { key: group.key, start, end, path };
  });
}
