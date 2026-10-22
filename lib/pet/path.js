import { isBlocked } from "@/lib/world/collision";

/**
 * Walking paths for the dog: A* on a 0.25 m grid over the room, avoiding
 * furniture (the same colliders you bump into). Deterministic — both screens
 * get the same path from the same room — and cached, since the dog asks for the
 * same few paths over and over.
 */
const CELL = 0.25;
const cache = new Map();
const MAX_CACHE = 64;

function grid(world, radius) {
  const { bounds } = world;
  const cols = Math.floor((bounds.maxX - bounds.minX) / CELL);
  const rows = Math.floor((bounds.maxZ - bounds.minZ) / CELL);
  const free = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const point = { x: bounds.minX + (c + 0.5) * CELL, z: bounds.minZ + (r + 0.5) * CELL };
      free[r * cols + c] = isBlocked(point, { radius, bounds, colliders: world.colliders }) ? 0 : 1;
    }
  }
  return { cols, rows, free, bounds };
}

const cellOf = (g, p) => ({ c: Math.min(g.cols - 1, Math.max(0, Math.floor((p.x - g.bounds.minX) / CELL))), r: Math.min(g.rows - 1, Math.max(0, Math.floor((p.z - g.bounds.minZ) / CELL))) });
const centre = (g, c, r) => ({ x: g.bounds.minX + (c + 0.5) * CELL, z: g.bounds.minZ + (r + 0.5) * CELL });

/** The nearest walkable cell to `cell` (spiral search), or null. */
function nearestFree(g, cell) {
  if (g.free[cell.r * g.cols + cell.c]) return cell;
  for (let ring = 1; ring < Math.max(g.cols, g.rows); ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const r = cell.r + dr;
        const c = cell.c + dc;
        if (r >= 0 && c >= 0 && r < g.rows && c < g.cols && g.free[r * g.cols + c]) return { r, c };
      }
    }
  }
  return null;
}

/** A free spot near `point` (the point itself if it's free). */
export function freeSpotNear(world, point, radius) {
  const key = `g:${world.key}:${radius}`;
  if (!cache.has(key)) remember(key, grid(world, radius));
  const g = cache.get(key);
  const cell = nearestFree(g, cellOf(g, point));
  if (!cell) return point;
  const here = cellOf(g, point);
  return cell.r === here.r && cell.c === here.c && !isBlocked(point, { radius, bounds: world.bounds, colliders: world.colliders }) ? point : centre(g, cell.c, cell.r);
}

function remember(key, value) {
  cache.set(key, value);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

/**
 * Waypoints from `from` to `to` (both included), going around furniture.
 * `world` = { key, bounds, colliders } — `key` changes whenever the furniture does.
 */
export function findPath(world, from, to, radius) {
  const key = `p:${world.key}:${radius}:${from.x.toFixed(2)},${from.z.toFixed(2)}>${to.x.toFixed(2)},${to.z.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const gridKey = `g:${world.key}:${radius}`;
  if (!cache.has(gridKey)) remember(gridKey, grid(world, radius));
  const g = cache.get(gridKey);
  const start = nearestFree(g, cellOf(g, from));
  const goal = nearestFree(g, cellOf(g, to));
  let path = [from, to];
  if (start && goal) {
    const index = (cell) => cell.r * g.cols + cell.c;
    const open = new Map([[index(start), start]]);
    const came = new Map();
    const cost = new Map([[index(start), 0]]);
    const h = (cell) => Math.hypot(cell.c - goal.c, cell.r - goal.r);
    let found = false;
    let guard = 0;
    while (open.size && guard++ < 20000) {
      let bestKey = null;
      let best = null;
      let bestScore = Infinity;
      for (const [k, cell] of open) {
        const score = cost.get(k) + h(cell);
        if (score < bestScore || (score === bestScore && k < bestKey)) {
          bestScore = score;
          bestKey = k;
          best = cell;
        }
      }
      if (best.c === goal.c && best.r === goal.r) {
        found = true;
        break;
      }
      open.delete(bestKey);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const next = { r: best.r + dr, c: best.c + dc };
          if (next.r < 0 || next.c < 0 || next.r >= g.rows || next.c >= g.cols || !g.free[index(next)]) continue;
          // No cutting corners past furniture.
          if (dr && dc && (!g.free[best.r * g.cols + next.c] || !g.free[next.r * g.cols + best.c])) continue;
          const tentative = cost.get(bestKey) + Math.hypot(dr, dc);
          const nk = index(next);
          if (tentative < (cost.get(nk) ?? Infinity)) {
            cost.set(nk, tentative);
            came.set(nk, bestKey);
            open.set(nk, next);
          }
        }
      }
    }
    if (found) {
      const cells = [];
      for (let k = index(goal); k !== undefined; k = came.get(k)) cells.unshift({ c: k % g.cols, r: Math.floor(k / g.cols) });
      // Keep only the corners: a straight run needs no waypoints in between.
      const corners = cells.filter((cell, i) => {
        if (i === 0 || i === cells.length - 1) return false;
        const a = cells[i - 1];
        const b = cells[i + 1];
        return cell.c - a.c !== b.c - cell.c || cell.r - a.r !== b.r - cell.r;
      });
      path = [from, ...corners.map((cell) => centre(g, cell.c, cell.r)), to];
    }
  }
  remember(key, path);
  return path;
}

export const pathLength = (path) => path.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) : 0), 0);

/** Where along `path` after `distance` metres, and which way it's heading. */
export function alongPath(path, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= length || i === path.length - 1) {
      const t = length ? Math.min(1, left / length) : 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ry: length ? Math.atan2(b.x - a.x, b.z - a.z) : null };
    }
    left -= length;
  }
  const last = path.at(-1);
  return { x: last.x, z: last.z, ry: null };
}
