export const MAP_COLS = 1200;
export const MAP_ROWS = 800;
export const MAP_CELL = 2;

/** Older maps used larger tiles; split each old tile into factor×factor new tiles. */
export function expandTiles(tiles: Record<string, string>, factor: number) {
  if (factor <= 1) return { ...tiles };
  const out: Record<string, string> = {};
  for (const [key, id] of Object.entries(tiles)) {
    const [x = 0, y = 0] = key.split(',').map(Number);
    for (let dx = 0; dx < factor; dx++) for (let dy = 0; dy < factor; dy++) out[`${x * factor + dx},${y * factor + dy}`] = id;
  }
  return out;
}

/** Sample every crossed cell, even when pointer events arrive far apart. */
export function strokeCells(from: [number, number], to: [number, number], radius: number) {
  const result = new Set<string>();
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) * 2));
  for (let i = 0; i <= steps; i++) {
    const x = Math.floor(from[0] + (to[0] - from[0]) * i / steps);
    const y = Math.floor(from[1] + (to[1] - from[1]) * i / steps);
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const cx = x + dx, cy = y + dy;
      if (cx >= 0 && cy >= 0 && cx < MAP_COLS && cy < MAP_ROWS) result.add(`${cx},${cy}`);
    }
  }
  return result;
}

/** Preenchimento tipo balde de tinta em áreas contíguas/circuladas */
export function floodFill(
  startX: number,
  startY: number,
  fillId: string,
  tiles: Record<string, string>,
  cols = MAP_COLS,
  rows = MAP_ROWS,
  maxCells = 80000
): Record<string, string> {
  const startKey = `${startX},${startY}`;
  const targetId = tiles[startKey] ?? "";
  if (targetId === fillId) return tiles;

  const nextTiles = { ...tiles };
  const queueX = new Int32Array(maxCells + 100);
  const queueY = new Int32Array(maxCells + 100);
  let head = 0;
  let tail = 0;

  queueX[tail] = startX;
  queueY[tail] = startY;
  tail++;

  const visited = new Set<string>();
  visited.add(startKey);

  while (head < tail && tail < maxCells) {
    const x = queueX[head];
    const y = queueY[head];
    head++;

    const key = `${x},${y}`;
    if (fillId) nextTiles[key] = fillId;
    else delete nextTiles[key];

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (let i = 0; i < 4; i++) {
      const [nx, ny] = neighbors[i];
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
        const nKey = `${nx},${ny}`;
        if (!visited.has(nKey)) {
          visited.add(nKey);
          const nVal = tiles[nKey] ?? "";
          if (nVal === targetId) {
            if (tail < maxCells) {
              queueX[tail] = nx;
              queueY[tail] = ny;
              tail++;
            }
          }
        }
      }
    }
  }

  return nextTiles;
}

/** Trace exposed edges into closed contours; round corners without seams between tiles. */
export function territoryPath(keys: string[], smooth: boolean) {
  const cells = new Set(keys);
  const edges = new Map<string, string[]>();
  const add = (a: string, b: string) => edges.set(a, [...(edges.get(a) ?? []), b]);
  for (const key of keys) {
    const [x = 0, y = 0] = key.split(',').map(Number);
    if (!cells.has(`${x},${y - 1}`)) add(`${x},${y}`, `${x + 1},${y}`);
    if (!cells.has(`${x + 1},${y}`)) add(`${x + 1},${y}`, `${x + 1},${y + 1}`);
    if (!cells.has(`${x},${y + 1}`)) add(`${x + 1},${y + 1}`, `${x},${y + 1}`);
    if (!cells.has(`${x - 1},${y}`)) add(`${x},${y + 1}`, `${x},${y}`);
  }
  let path = '';
  while (edges.size) {
    const start = edges.keys().next().value;
    if (!start) break;
    const points: [number, number][] = [];
    let current = start;
    for (let guard = 0; guard <= keys.length * 4; guard++) {
      const [cx = 0, cy = 0] = current.split(',').map(Number);
      points.push([cx * MAP_CELL, cy * MAP_CELL]);
      const nexts = edges.get(current);
      const next = nexts?.shift();
      if (!nexts?.length) edges.delete(current);
      if (!next || next === start) break;
      current = next;
    }
    if (points.length < 3) continue;
    if (!smooth) { path += `M${points.map(p => p.join(',')).join('L')}Z`; continue; }
    const first = points[0], last = points[points.length - 1];
    if (!first || !last) continue;
    path += `M${(first[0] + last[0]) / 2},${(first[1] + last[1]) / 2}`;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], next = points[(i + 1) % points.length];
      if (p && next) path += `Q${p.join(',')} ${(p[0] + next[0]) / 2},${(p[1] + next[1]) / 2}`;
    }
    path += 'Z';
  }
  return path;
}
