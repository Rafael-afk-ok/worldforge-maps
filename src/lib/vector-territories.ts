import { MAP_COLS, MAP_ROWS } from "@/lib/map-tools";

/**
 * Persistable geometry for a country or region. Coordinates are map-cell units,
 * not pixels, so the file stays compact and is independent of zoom/display scale.
 * Each area may contain multiple rings (islands and holes).
 */
export type VectorArea = {
  id: string;
  kind: "nation" | "region";
  rings: [number, number][][];
};

type Edge = { from: string; to: string; direction: number };

const keyOf = (x: number, y: number) => `${x},${y}`;
const pointOf = (key: string): [number, number] => {
  const [x = 0, y = 0] = key.split(",").map(Number);
  return [x, y];
};

/** Trace grid-cell boundaries into closed polygon rings. Input keys are x,y cells. */
function traceRings(keys: string[]): [number, number][][] {
  const occupied = new Set(keys);
  const edges: Edge[] = [];
  const add = (x1: number, y1: number, x2: number, y2: number, direction: number) => {
    edges.push({ from: keyOf(x1, y1), to: keyOf(x2, y2), direction });
  };

  for (const key of occupied) {
    const [x, y] = pointOf(key);
    if (!occupied.has(keyOf(x, y - 1))) add(x, y, x + 1, y, 0);
    if (!occupied.has(keyOf(x + 1, y))) add(x + 1, y, x + 1, y + 1, 1);
    if (!occupied.has(keyOf(x, y + 1))) add(x + 1, y + 1, x, y + 1, 2);
    if (!occupied.has(keyOf(x - 1, y))) add(x, y + 1, x, y, 3);
  }

  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), index]));
  const used = new Uint8Array(edges.length);
  const rings: [number, number][][] = [];

  for (let startIndex = 0; startIndex < edges.length; startIndex++) {
    if (used[startIndex]) continue;
    const first = edges[startIndex];
    if (!first) continue;
    const ring: [number, number][] = [];
    let edgeIndex = startIndex;
    let guard = 0;

    while (!used[edgeIndex] && guard++ <= edges.length + 1) {
      const edge = edges[edgeIndex];
      if (!edge) break;
      used[edgeIndex] = 1;
      ring.push(pointOf(edge.from));
      if (edge.to === first.from) break;

      const candidates = (outgoing.get(edge.to) ?? []).filter(index => !used[index]);
      if (!candidates.length) break;
      // Prefer a right turn, then straight, left, and back. This separates
      // diagonally touching cells into valid individual contours.
      const preference = [1, 0, 3, 2];
      let nextIndex = candidates[0]!;
      let best = 99;
      for (const candidateIndex of candidates) {
        const candidate = edges[candidateIndex];
        if (!candidate) continue;
        const turn = (candidate.direction - edge.direction + 4) % 4;
        const rank = preference.indexOf(turn);
        if (rank >= 0 && rank < best) { best = rank; nextIndex = candidateIndex; }
      }
      edgeIndex = nextIndex;
    }

    if (ring.length >= 4) {
      const firstPoint = ring[0], lastPoint = ring[ring.length - 1];
      if (firstPoint && lastPoint && (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1])) ring.push(firstPoint);
      if (ring.length >= 5) {
        const openRing = ring.slice(0, -1);
        const simplified: [number, number][] = [];
        for (let i = 0; i < openRing.length; i++) {
          const previous = openRing[(i + openRing.length - 1) % openRing.length];
          const current = openRing[i];
          const next = openRing[(i + 1) % openRing.length];
          if (!previous || !current || !next) continue;
          const cross = (current[0] - previous[0]) * (next[1] - current[1]) -
            (current[1] - previous[1]) * (next[0] - current[0]);
          if (cross !== 0) simplified.push(current);
        }
        if (simplified.length >= 3) {
          const firstPoint = simplified[0];
          if (firstPoint) simplified.push(firstPoint);
          rings.push(simplified);
        }
      }
    }
  }
  return rings;
}

/** Compress current cell assignments into country/region vector areas. */
export function tilesToVectorAreas(
  tiles: Record<string, string>,
  regionTiles: Record<string, string> = {},
): VectorArea[] {
  const groups = new Map<string, string[]>();
  const addToGroup = (kind: VectorArea["kind"], id: string, key: string) => {
    const groupKey = `${kind}:${id}`;
    let keys = groups.get(groupKey);
    if (!keys) { keys = []; groups.set(groupKey, keys); }
    keys.push(key);
  };
  for (const [key, id] of Object.entries(tiles)) {
    if (/^\\d+,\\d+$/.test(key) && typeof id === "string" && id) addToGroup("nation", id, key);
  }
  for (const [key, id] of Object.entries(regionTiles)) {
    if (/^\\d+,\\d+$/.test(key) && typeof id === "string" && id && tiles[key]) addToGroup("region", id, key);
  }

  const areas: VectorArea[] = [];
  for (const [groupKey, keys] of groups) {
    const separator = groupKey.indexOf(":");
    const kind = groupKey.slice(0, separator) as VectorArea["kind"];
    const id = groupKey.slice(separator + 1);
    const rings = traceRings(keys);
    if (rings.length) areas.push({ id, kind, rings });
  }
  return areas;
}

function pointInRing(x: number, y: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (!a || !b) continue;
    const crosses = (a[1] > y) !== (b[1] > y) &&
      x < ((b[0] - a[0]) * (y - a[1])) / ((b[1] - a[1]) || Number.EPSILON) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Rasterize vector areas to the editor's transient cell grid for legacy tools. */
export function vectorAreasToTiles(areas: VectorArea[]) {
  const tiles: Record<string, string> = {};
  const regionTiles: Record<string, string> = {};

  for (const candidate of areas as unknown[]) {
    if (!candidate || typeof candidate !== "object") continue;
    const area = candidate as VectorArea;
    if (typeof area.id !== "string" || !Array.isArray(area.rings) || (area.kind !== "nation" && area.kind !== "region")) continue;
    const validRings = area.rings.filter(ring => Array.isArray(ring) && ring.length >= 4 &&
      ring.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)));
    if (!validRings.length || !area.id || (area.kind !== "nation" && area.kind !== "region")) continue;
    let lowX = Infinity, highX = -Infinity, lowY = Infinity, highY = -Infinity;
    for (const ring of validRings) for (const point of ring) {
      lowX = Math.min(lowX, point[0]); highX = Math.max(highX, point[0]);
      lowY = Math.min(lowY, point[1]); highY = Math.max(highY, point[1]);
    }
    if (!Number.isFinite(lowX) || !Number.isFinite(lowY)) continue;
    const minX = Math.max(0, Math.floor(lowX));
    const maxX = Math.min(MAP_COLS - 1, Math.ceil(highX) - 1);
    const minY = Math.max(0, Math.floor(lowY));
    const maxY = Math.min(MAP_ROWS - 1, Math.ceil(highY) - 1);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const inside = validRings.reduce((value, ring) => pointInRing(x + 0.5, y + 0.5, ring) ? !value : value, false);
      if (!inside) continue;
      const key = keyOf(x, y);
      if (area.kind === "nation") tiles[key] = area.id;
      else regionTiles[key] = area.id;
    }
  }

  // Region shapes must remain inside their owning nation's restored territory;
  // the caller performs the final ownership validation once metadata is loaded.
  return { tiles, regionTiles };
}
