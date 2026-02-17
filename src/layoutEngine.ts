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

// Spiral outward from (cx, cy) to find nearest cell where component fits.
// Returns {x, y} or null if nothing within reasonable range.
export function findNearestFreeCell(
  items: GridItem[], cx: number, cy: number, w: number, h: number, excludeId?: string
): { x: number; y: number } | null {
  const maxSearch = Math.max(GRID_COLUMNS, getMaxRow(items) + h + 10);
  for (let d = 0; d <= maxSearch; d++) {
    for (let dx = -d; dx <= d; dx++) {
      for (let dy = -d; dy <= d; dy++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue; // only perimeter
        const x = cx + dx;
        const y = cy + dy;
        if (canFit(items, x, y, w, h, excludeId)) return { x, y };
      }
    }
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
  // Try pushing items downward
  const result = others.map(i => ({ ...i }));
  const resized = { ...comp, height: clamped };
  const hOverlaps = (a: GridItem, b: GridItem) =>
    a.x < b.x + b.width && b.x < a.x + a.width;
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of result.sort((a, b) => a.y - b.y)) {
      if (hOverlaps(resized, item) && resized.y + resized.height > item.y && item.y + item.height > resized.y) {
        const newY = resized.y + resized.height;
        if (newY !== item.y) { item.y = newY; changed = true; }
      }
      for (const other of result) {
        if (other.componentId === item.componentId) continue;
        if (hOverlaps(item, other) && item.y + item.height > other.y && other.y + other.height > item.y && other.y < item.y + item.height) {
          const newY = Math.max(other.y, item.y + item.height);
          if (newY !== other.y) { other.y = newY; changed = true; }
        }
      }
    }
  }
  return [...result, resized];
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
