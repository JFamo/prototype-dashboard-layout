import type { GridItem } from './types';
import { GRID_COLUMNS, MAX_COMPONENT_HEIGHT } from './constants';

function overlaps(a: GridItem, b: GridItem): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height;
}

function canFit(items: GridItem[], x: number, y: number, w: number, h: number, excludeId?: string): boolean {
  if (x < 0 || y < 0 || x + w > GRID_COLUMNS || h > MAX_COMPONENT_HEIGHT) return false;
  const test = { x, y, width: w, height: h, componentId: '', componentType: '' as any };
  return !items.some(i => i.componentId !== excludeId && overlaps(test, i));
}

// Search downward from (cx, cy) to find the nearest row where the component fits.
// Returns {x, y} or null if nothing within reasonable range.
export function findNearestFreeCell(
  items: GridItem[], cx: number, cy: number, w: number, h: number, excludeId?: string
): { x: number; y: number } | null {
  const maxY = getMaxRow(items) + h + 10;
  for (let y = cy; y <= maxY; y++) {
    if (canFit(items, cx, y, w, h, excludeId)) return { x: cx, y };
  }
  return null;
}

export function addComponent(items: GridItem[], newItem: GridItem): GridItem[] | null {
  const pos = findNearestFreeCell(items, newItem.x, newItem.y, newItem.width, newItem.height);
  if (!pos) return null;
  return [...items, { ...newItem, x: pos.x, y: pos.y }];
}

export function removeComponent(items: GridItem[], componentId: string): GridItem[] {
  return items.filter(i => i.componentId !== componentId);
}

export function repositionComponent(items: GridItem[], componentId: string, newX: number, newY: number): GridItem[] | null {
  const comp = items.find(i => i.componentId === componentId);
  if (!comp) return null;
  const others = items.filter(i => i.componentId !== componentId);
  const pos = findNearestFreeCell(others, newX, newY, comp.width, comp.height);
  if (!pos) return null;
  return [...others, { ...comp, x: pos.x, y: pos.y }];
}

export function resizeLeftEdge(items: GridItem[], componentId: string, newX: number): GridItem[] {
  const comp = items.find(i => i.componentId === componentId);
  if (!comp) return items;
  const clampedX = Math.max(0, Math.min(newX, comp.x + comp.width - 1));
  const newWidth = comp.x + comp.width - clampedX;
  const others = items.filter(i => i.componentId !== componentId);
  if (canFit(others, clampedX, comp.y, newWidth, comp.height)) {
    return [...others, { ...comp, x: clampedX, width: newWidth }];
  }
  // Push items to the left
  const result = others.map(i => ({ ...i }));
  const resized = { ...comp, x: clampedX, width: newWidth };
  const vOverlaps = (a: GridItem, b: GridItem) =>
    a.y < b.y + b.height && b.y < a.y + a.height;
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of result.sort((a, b) => b.x - a.x)) {
      // Pushed by resized component
      if (vOverlaps(resized, item) && resized.x < item.x + item.width && item.x < resized.x + resized.width) {
        const newItemX = resized.x - item.width;
        if (newItemX !== item.x) { item.x = newItemX; changed = true; }
      }
      // Cascade: pushed by other shifted items
      for (const other of result) {
        if (other.componentId === item.componentId) continue;
        if (vOverlaps(item, other) && item.x < other.x + other.width && other.x < item.x + item.width) {
          const newOtherX = Math.min(other.x, item.x - other.width);
          if (newOtherX !== other.x) { other.x = newOtherX; changed = true; }
        }
      }
    }
  }
  if (result.some(i => i.x < 0)) return items;
  return [...result, resized];
}

export function resizeWidth(items: GridItem[], componentId: string, newWidth: number): GridItem[] {
  const comp = items.find(i => i.componentId === componentId);
  if (!comp) return items;
  const clamped = Math.max(1, Math.min(newWidth, GRID_COLUMNS));
  const others = items.filter(i => i.componentId !== componentId);
  if (canFit(others, comp.x, comp.y, clamped, comp.height)) {
    return [...others, { ...comp, width: clamped }];
  }
  // Try pushing items to the right
  const result = others.map(i => ({ ...i }));
  const resized = { ...comp, width: clamped };
  // Iteratively push: process items left-to-right that vertically overlap the resized comp
  const vOverlaps = (a: GridItem, b: GridItem) =>
    a.y < b.y + b.height && b.y < a.y + a.height;
  let changed = true;
  while (changed) {
    changed = false;
    // Sort right-side items by x so we cascade left-to-right
    for (const item of result.sort((a, b) => a.x - b.x)) {
      // Check overlap with resized component
      if (vOverlaps(resized, item) && resized.x + resized.width > item.x && item.x + item.width > resized.x) {
        const newX = resized.x + resized.width;
        if (newX !== item.x) { item.x = newX; changed = true; }
      }
      // Check overlap with other pushed items
      for (const other of result) {
        if (other.componentId === item.componentId) continue;
        if (vOverlaps(item, other) && item.x + item.width > other.x && other.x + other.width > item.x && other.x < item.x + item.width) {
          const newX = Math.max(other.x, item.x + item.width);
          if (newX !== other.x) { other.x = newX; changed = true; }
        }
      }
    }
  }
  // Reject if any item went out of bounds
  if (result.some(i => i.x + i.width > GRID_COLUMNS)) return items;
  return [...result, resized];
}

export function resizeHeight(items: GridItem[], componentId: string, newHeight: number): GridItem[] {
  const comp = items.find(i => i.componentId === componentId);
  if (!comp) return items;
  const clamped = Math.max(1, Math.min(newHeight, MAX_COMPONENT_HEIGHT));
  const others = items.filter(i => i.componentId !== componentId);
  if (canFit(others, comp.x, comp.y, comp.width, clamped)) {
    return [...others, { ...comp, height: clamped }];
  }
  if (clamped <= comp.height) return [...others, { ...comp, height: clamped }];

  const result = others.map(i => ({ ...i }));

  // Recursive push: when a component is pushed down, anything below IT (in its columns) must also move
  const pushed = new Set<string>();
  function pushDown(srcX: number, srcWidth: number, oldBottom: number, newBottom: number) {
    const delta = newBottom - oldBottom;
    if (delta <= 0) return;
    for (const item of result) {
      if (pushed.has(item.componentId)) continue;
      const hOverlap = srcX < item.x + item.width && item.x < srcX + srcWidth;
      if (!hOverlap) continue;
      // Item is in the zone that got expanded into
      if (item.y >= oldBottom && item.y < newBottom) {
        pushed.add(item.componentId);
        const prevBottom = item.y + item.height;
        item.y = newBottom;
        // Recursively push items below this (now wider) pushed item
        pushDown(item.x, item.width, prevBottom, item.y + item.height);
      }
      // Item is below the old bottom — shift by delta
      else if (item.y >= oldBottom) {
        pushed.add(item.componentId);
        const prevBottom = item.y + item.height;
        item.y += delta;
        pushDown(item.x, item.width, prevBottom, item.y + item.height);
      }
      // Item partially overlaps the resize zone
      else if (item.y < newBottom && item.y + item.height > oldBottom) {
        pushed.add(item.componentId);
        const prevBottom = item.y + item.height;
        item.y = newBottom;
        pushDown(item.x, item.width, prevBottom, item.y + item.height);
      }
    }
  }

  pushDown(comp.x, comp.width, comp.y + comp.height, comp.y + clamped);
  return [...result, { ...comp, height: clamped }];
}

export function getMaxRow(items: GridItem[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map(i => i.y + i.height));
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
