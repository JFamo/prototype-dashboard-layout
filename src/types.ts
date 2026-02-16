export type ComponentType = 'Chart' | 'Grid' | 'KPI' | 'StylizedKPIGraph';

// FR-002: Data model
export interface GridItem {
  componentId: string;
  componentType: ComponentType;
  x: number;
  y: number;
  width: number;
  height: number;
}
