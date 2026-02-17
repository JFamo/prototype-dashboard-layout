import type { GridItem } from './types';
import { GRID_COLUMNS, MAX_COMPONENT_HEIGHT } from './constants';

export interface Violation {
  type: 'overlap' | 'out_of_bounds' | 'invalid_dimensions';
  message: string;
  components: string[];
}

export function validateLayout(items: GridItem[]): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (
        a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height
      ) {
        violations.push({
          type: 'overlap',
          message: `Overlap: ${a.componentId} and ${b.componentId}`,
          components: [a.componentId, b.componentId],
        });
      }
    }
  }

  for (const item of items) {
    if (item.x + item.width > GRID_COLUMNS) {
      violations.push({
        type: 'out_of_bounds',
        message: `Out of bounds: ${item.componentId}`,
        components: [item.componentId],
      });
    }
    if (item.x < 0 || item.y < 0 || item.width < 1 || item.height < 1 || item.height > MAX_COMPONENT_HEIGHT) {
      violations.push({
        type: 'invalid_dimensions',
        message: `Invalid dimensions: ${item.componentId}`,
        components: [item.componentId],
      });
    }
  }

  return violations;
}
