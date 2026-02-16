import type { GridItem } from './types';
import { GRID_COLUMNS, MAX_COMPONENT_HEIGHT } from './constants';

function overlaps(a: GridItem, b: GridItem): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

function getOccupiedYs(items: GridItem[]): number[] {
  const ys = new Set<number>();
  for (const item of items) {
    for (let r = item.y; r < item.y + item.height; r++) ys.add(r);
  }
  return [...ys].sort((a, b) => a - b);
}

function componentsAtY(items: GridItem[], y: number): GridItem[] {
  return items.filter(item => item.y <= y && y < item.y + item.height);
}

function uniqueById(comps: GridItem[]): GridItem[] {
  const seen = new Set<string>();
  return comps.filter(c => { if (seen.has(c.componentId)) return false; seen.add(c.componentId); return true; });
}

// Sort components for a row: by x, with resizedId winning ties
function rowSort(comps: GridItem[], resizedId?: string): GridItem[] {
  return [...comps].sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    if (a.componentId === resizedId) return -1;
    if (b.componentId === resizedId) return 1;
    return 0;
  });
}

// The core layout solver. Given items with potentially invalid positions/widths,
// produces a valid layout where:
// - No overlaps
// - Every occupied y tiles full grid width
// - Components float up (gravity)
// - Multi-row components have consistent x/width across all rows
function solveLayout(items: GridItem[], resizedId?: string): GridItem[] {
  const result = items.map(i => ({ ...i }));

  // Step 1: For each row, ensure total width <= GRID_COLUMNS by shrinking
  for (const y of getOccupiedYs(result)) {
    const atY = uniqueById(componentsAtY(result, y));
    const sorted = rowSort(atY, resizedId);
    const totalWidth = sorted.reduce((sum, c) => sum + c.width, 0);
    if (totalWidth <= GRID_COLUMNS) continue;

    let excess = totalWidth - GRID_COLUMNS;

    // Distribute shrinking proportionally: each component keeps at least width 1,
    // and shrinks proportional to its current width.
    const totalShrinkable = sorted.reduce((s, c) => s + (result.find(r => r.componentId === c.componentId)!.width - 1), 0);
    if (totalShrinkable > 0) {
      let remaining = excess;
      for (const comp of sorted) {
        const ref = result.find(r => r.componentId === comp.componentId)!;
        const shrinkable = ref.width - 1;
        const share = Math.min(shrinkable, Math.round(excess * shrinkable / totalShrinkable));
        ref.width -= Math.min(share, remaining);
        remaining -= Math.min(share, remaining);
      }
      // Mop up any rounding remainder
      if (remaining > 0) {
        // Shrink non-resized components first
        const order = sorted.filter(c => c.componentId !== resizedId).concat(sorted.filter(c => c.componentId === resizedId));
        for (const comp of order) {
          if (remaining <= 0) break;
          const ref = result.find(r => r.componentId === comp.componentId)!;
          const shrink = Math.min(ref.width - 1, remaining);
          ref.width -= shrink;
          remaining -= shrink;
        }
      }
    }
  }

  // Step 2: Assign x positions by packing left-to-right.
  // The resizedId component's requested x determines its position in the sort order
  // (i.e., where it falls relative to other components), but all components are
  // packed sequentially to avoid gaps.
  // Process per-row-group: components sharing the same y-span are packed together.
  const placed = new Set<string>();
  const occupied = new Map<number, { start: number; end: number; id: string }[]>();

  // Process multi-row components first (more constrained), but resizedId gets
  // its sort position based on its requested x.
  const byPriority = [...result].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    // resizedId wins ties — user placed it here intentionally
    if (a.componentId === resizedId) return -1;
    if (b.componentId === resizedId) return 1;
    // Multi-row before single-row (more constrained)
    const aMulti = a.height > 1 ? 0 : 1;
    const bMulti = b.height > 1 ? 0 : 1;
    return aMulti - bMulti;
  });

  for (const comp of byPriority) {
    if (placed.has(comp.componentId)) continue;
    placed.add(comp.componentId);
    const ref = result.find(r => r.componentId === comp.componentId)!;

    // Find the leftmost x where this component fits across ALL its rows
    let bestX = -1;
    for (let tryX = 0; tryX <= GRID_COLUMNS - ref.width; tryX++) {
      let fits = true;
      for (let r = ref.y; r < ref.y + ref.height; r++) {
        const rowOcc = occupied.get(r) || [];
        for (const occ of rowOcc) {
          if (tryX < occ.end && tryX + ref.width > occ.start) {
            fits = false;
            tryX = Math.max(tryX, occ.end - 1);
            break;
          }
        }
        if (!fits) break;
      }
      if (fits) { bestX = tryX; break; }
    }
    if (bestX < 0) bestX = 0;
    ref.x = bestX;

    for (let r = ref.y; r < ref.y + ref.height; r++) {
      if (!occupied.has(r)) occupied.set(r, []);
      occupied.get(r)!.push({ start: ref.x, end: ref.x + ref.width, id: ref.componentId });
      occupied.get(r)!.sort((a, b) => a.start - b.start);
    }
  }

  // Step 3: Position movable (single-row) components into gaps around
  // fixed (multi-row) components so they don't overlap, but do NOT
  // expand widths to fill the row — components keep their natural size.
  for (const y of getOccupiedYs(result)) {
    const atY = uniqueById(componentsAtY(result, y)).sort((a, b) => a.x - b.x);

    const fixed: GridItem[] = [];
    const movable: GridItem[] = [];
    for (const comp of atY) {
      const ref = result.find(r => r.componentId === comp.componentId)!;
      const spansOtherRows = ref.height > 1 || ref.y !== y;
      if (spansOtherRows) fixed.push(ref);
      else movable.push(ref);
    }

    if (movable.length > 0 && fixed.length > 0) {
      // Build gaps around fixed components
      const fixedRanges = fixed.map(f => ({ start: f.x, end: f.x + f.width })).sort((a, b) => a.start - b.start);
      const gaps: { start: number; end: number }[] = [];
      let cursor = 0;
      for (const fr of fixedRanges) {
        if (fr.start > cursor) gaps.push({ start: cursor, end: fr.start });
        cursor = Math.max(cursor, fr.end);
      }
      if (cursor < GRID_COLUMNS) gaps.push({ start: cursor, end: GRID_COLUMNS });

      // Place movable components into gaps at their natural width
      let mi = 0;
      for (const gap of gaps) {
        let x = gap.start;
        while (mi < movable.length && x + movable[mi].width <= gap.end) {
          movable[mi].x = x;
          x += movable[mi].width;
          mi++;
        }
      }
    }
  }

  return result;
}

// FR-020: Push-down overlapping components
function pushDown(items: GridItem[]): GridItem[] {
  const result = items.map(i => ({ ...i }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        if (overlaps(result[i], result[j])) {
          const [upper, lower] = result[i].y <= result[j].y
            ? [result[i], result[j]] : [result[j], result[i]];
          lower.y = upper.y + upper.height;
          changed = true;
        }
      }
    }
  }
  return result;
}

// FR-021, FR-022: Gravity compaction
function gravityCompact(items: GridItem[]): GridItem[] {
  const result = items.map(i => ({ ...i }));
  let changed = true;
  while (changed) {
    changed = false;
    result.sort((a, b) => a.y - b.y);
    for (const comp of result) {
      for (let tryY = 0; tryY < comp.y; tryY++) {
        const test = { ...comp, y: tryY };
        const blocked = result.some(
          other => other.componentId !== comp.componentId && overlaps(test, other)
        );
        if (!blocked) {
          comp.y = tryY;
          changed = true;
          break;
        }
        const blocker = result.find(
          other => other.componentId !== comp.componentId && overlaps({ ...comp, y: tryY }, other)
        );
        if (blocker) tryY = blocker.y + blocker.height - 1;
      }
    }
  }
  return result;
}

// FR-024: Full stabilization loop
export function stabilize(items: GridItem[], resizedId?: string): GridItem[] {
  let current = items.map(i => ({ ...i }));
  for (let iter = 0; iter < 20; iter++) {
    const solved = solveLayout(current, resizedId);
    const pushed = pushDown(solved);
    const compacted = gravityCompact(pushed);
    const next = solveLayout(compacted, resizedId);

    const stable = current.length === next.length && current.every(old => {
      const n = next.find(u => u.componentId === old.componentId);
      return n && n.x === old.x && n.y === old.y && n.width === old.width && n.height === old.height;
    });
    current = next;
    if (stable) break;
  }
  return current;
}

export function resizeWidth(items: GridItem[], componentId: string, newWidth: number): GridItem[] {
  return stabilize(items.map(i => i.componentId === componentId
    ? { ...i, width: Math.max(1, Math.min(newWidth, GRID_COLUMNS)) } : { ...i }), componentId);
}

export function resizeLeftEdge(items: GridItem[], componentId: string, newX: number): GridItem[] {
  const comp = items.find(i => i.componentId === componentId);
  if (!comp) return items;
  const clampedX = Math.max(0, Math.min(newX, comp.x + comp.width - 1));
  return stabilize(items.map(i => i.componentId === componentId
    ? { ...i, x: clampedX, width: comp.x + comp.width - clampedX } : { ...i }), componentId);
}

export function resizeHeight(items: GridItem[], componentId: string, newHeight: number): GridItem[] {
  const clamped = Math.max(1, Math.min(newHeight, MAX_COMPONENT_HEIGHT));
  const result = items.map(i => i.componentId === componentId
    ? { ...i, height: clamped } : { ...i });
  // Only push overlapping items down, then compact. No width changes.
  const pushed = pushDown(result);
  return gravityCompact(pushed);
}

export function addComponent(items: GridItem[], newItem: GridItem): GridItem[] | null {
  const atY = componentsAtY(items, newItem.y);
  if (atY.length + 1 > GRID_COLUMNS) return null;
  return stabilize([...items.map(i => ({ ...i })), { ...newItem }], newItem.componentId);
}

export function removeComponent(items: GridItem[], componentId: string): GridItem[] {
  return stabilize(items.filter(i => i.componentId !== componentId));
}

export function repositionComponent(items: GridItem[], componentId: string, newX: number, newY: number): GridItem[] {
  const comp = items.find(i => i.componentId === componentId);
  if (!comp) return items;
  const without = items.filter(i => i.componentId !== componentId);
  return stabilize([...without.map(i => ({ ...i })), { ...comp, x: newX, y: newY }], componentId);
}

export function migrateOldFormat(rows: { items: { componentId: string; componentType: string }[] }[]): GridItem[] {
  const result: GridItem[] = [];
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx].items;
    const count = row.length;
    if (count === 0) continue;
    const baseWidth = Math.floor(GRID_COLUMNS / count);
    const remainder = GRID_COLUMNS % count;
    let x = 0;
    for (let i = 0; i < count; i++) {
      const w = baseWidth + (i < remainder ? 1 : 0);
      result.push({
        componentId: row[i].componentId,
        componentType: row[i].componentType as GridItem['componentType'],
        x, y: rowIdx, width: w, height: 1,
      });
      x += w;
    }
  }
  return result;
}

export function getMaxRow(items: GridItem[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map(i => i.y + i.height));
}
