// FR-001: Grid constants
export const GRID_COLUMNS = 12;
export const CELL_HEIGHT_PX = 80;
export const MAX_COMPONENT_HEIGHT = 8;

// FR-025: Default sizes per component type
export const DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  Chart: { width: 6, height: 2 },
  Grid: { width: 12, height: 3 },
  KPI: { width: 3, height: 1 },
  StylizedKPIGraph: { width: 4, height: 2 },
};

// FR-034: Mobile breakpoint
export const MOBILE_BREAKPOINT_PX = 768;
