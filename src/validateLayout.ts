import type { GridItem } from './types';
import { GRID_COLUMNS, MAX_COMPONENT_HEIGHT } from './constants';

export interface Violation {
  type: 'overlap' | 'out_of_bounds' | 'invalid_dimensions' | 'gap' | 'gravity';
  message: string;
  components: string[];
}

export function validateLayout(items: GridItem[]): Violation[] {
  const violations: Violation[] = [];

  // FR-003: No overlaps
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (
        a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height
      ) {
        violations.push({
          type: 'overlap',
          message: `Overlap: ${a.componentId} (${a.x},${a.y} ${a.width}×${a.height}) and ${b.componentId} (${b.x},${b.y} ${b.width}×${b.height})`,
          components: [a.componentId, b.componentId],
        });
      }
    }
  }

  for (const item of items) {
    // FR-004: x + width <= GRID_COLUMNS
    if (item.x + item.width > GRID_COLUMNS) {
      violations.push({
        type: 'out_of_bounds',
        message: `Out of bounds: ${item.componentId} x:${item.x} + w:${item.width} = ${item.x + item.width} > ${GRID_COLUMNS}`,
        components: [item.componentId],
      });
    }

    // FR-005: Valid dimensions
    if (item.x < 0 || item.y < 0 || item.width < 1 || item.height < 1 || item.height > MAX_COMPONENT_HEIGHT) {
      violations.push({
        type: 'invalid_dimensions',
        message: `Invalid dimensions: ${item.componentId} (${item.x},${item.y} ${item.width}×${item.height})`,
        components: [item.componentId],
      });
    }
  }

  // FR-008: Horizontal fill check removed — components keep their natural widths

  // FR-021: Gravity — no component should have empty space above it
  for (const comp of items) {
    if (comp.y === 0) continue;
    // Check if this component could move up by 1
    const test = { ...comp, y: comp.y - 1 };
    const blocked = items.some(
      (other) =>
        other.componentId !== comp.componentId &&
        other.x < test.x + test.width && test.x < other.x + other.width &&
        other.y < test.y + test.height && test.y < other.y + other.height
    );
    if (!blocked) {
      violations.push({
        type: 'gravity',
        message: `Gravity violation: ${comp.componentId} at y=${comp.y} could float up`,
        components: [comp.componentId],
      });
    }
  }

  return violations;
}
