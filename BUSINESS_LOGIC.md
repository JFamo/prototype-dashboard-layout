# Dashboard Layout System — Business Logic Specification

> Items marked 🔒 are **core rules** — fundamental to the layout system's correctness regardless of implementation.
> Items marked 🔧 are **configurable** — expected to change based on product requirements, branding, or implementation context.

## Overview

🔒 A dashboard layout system where users place, resize, reposition, and remove rectangular components on a fixed-width grid. The grid is unbounded vertically. Components are free-placed (no gravity, no auto-packing) — they stay exactly where the user puts them.

---

## 1. Data Model

### Grid Item

Each component on the dashboard is represented by:

| Field           | Type   | Description                                      | Stability |
|-----------------|--------|--------------------------------------------------|-----------|
| `componentId`   | string | Unique identifier                                | 🔒 Core   |
| `componentType` | enum   | One of: `Chart`, `Grid`, `KPI`, `StylizedKPIGraph` | 🔧 Configurable — types will vary by product |
| `x`             | int    | Column position (0-based, left edge)             | 🔒 Core   |
| `y`             | int    | Row position (0-based, top edge)                 | 🔒 Core   |
| `width`         | int    | Width in columns                                 | 🔒 Core   |
| `height`        | int    | Height in rows                                   | 🔒 Core   |

### Constants

| Constant              | Value | Description                                | Stability |
|-----------------------|-------|--------------------------------------------|-----------|
| `GRID_COLUMNS`        | 12    | Fixed number of columns                    | 🔧 Configurable — could be any positive integer |
| `CELL_HEIGHT_PX`      | 80    | Pixel height of one grid row               | 🔧 Configurable — visual tuning |
| `MAX_COMPONENT_HEIGHT` | 8    | Maximum height of any component in rows    | 🔧 Configurable — product decision |
| `MOBILE_BREAKPOINT_PX` | 768  | Below this width, switch to mobile layout  | 🔧 Configurable — responsive design choice |

### Default Sizes (per component type)

🔧 Configurable — these will change as component types change.

| Type              | Width | Height |
|-------------------|-------|--------|
| Chart             | 6     | 2      |
| Grid              | 12    | 3      |
| KPI               | 3     | 1      |
| StylizedKPIGraph  | 4     | 2      |

---

## 2. Layout Invariants

🔒 These must hold true at all times. If any are violated, it is a bug.

1. 🔒 **No overlap**: No two components may occupy the same grid cell. Two components overlap when their bounding rectangles intersect: `A.x < B.x + B.width AND B.x < A.x + A.width AND A.y < B.y + B.height AND B.y < A.y + A.height`.
2. 🔒 **Horizontal bounds**: For every component, `x >= 0` and `x + width <= GRID_COLUMNS`.
3. 🔒 **Valid dimensions**: `x >= 0`, `y >= 0`, `width >= 1`, `height >= 1`, `height <= MAX_COMPONENT_HEIGHT`.
4. 🔒 **No gravity**: Components do NOT automatically float upward. Gaps between rows are allowed.
5. 🔒 **No auto-packing**: Components do NOT automatically shift left. They stay at their assigned x position.

---

## 3. Core Algorithm: Downward Free Cell Search

🔒 Used by **Add** and **Reposition** operations.

> **Synopsis**: Try to place the component exactly where the user dropped it. If that spot is taken, search straight down in the same column until an open row is found. If nothing works, reject the action.

**Input**: existing items, target position `(cx, cy)`, component dimensions `(w, h)`, optional `excludeId`.

**Algorithm** (downward search):
1. 🔒 Starting at `y = cy`, incrementing `y` by 1 each iteration. The x position stays fixed at `cx`.
2. 🔒 At each `y`, check if the component fits at `(cx, y)`:
   - `cx >= 0`, `y >= 0`, `cx + w <= GRID_COLUMNS`, `h <= MAX_COMPONENT_HEIGHT`.
   - No overlap with any existing item (excluding `excludeId` if provided).
3. 🔒 If it fits, return `(cx, y)`.
4. 🔧 Search up to `maxRow + h + 10` rows below the current lowest item. *(Search limit is tunable.)*
5. 🔒 If no position found, return `null` (placement rejected).

🔒 **Key property**: The x position never changes from the user's drop target. Only the y position shifts downward to avoid collisions.

---

## 4. Operations

### 4.1 Add Component (from palette)

> **Synopsis**: Drop a new component from the palette onto the grid. It lands at the drop point or the first open row directly below it, or the drop is rejected if there's no room.

🔒 **Trigger**: User drags a component type from the palette and drops it on the grid.

🔧 **Input**: The grid cell `(gridX, gridY)` under the cursor at drop time, the component type's default width and height. *(Default dimensions are configurable per type.)*

**Steps**:
1. 🔧 Create a new component with a unique ID, the palette type, default dimensions, and target position `(gridX, gridY)`. *(ID generation strategy is configurable.)*
2. 🔒 Run **Downward Free Cell Search** against all existing items.
3. 🔒 If a position is found, add the component at that position.
4. 🔒 If no position is found, **reject the drop**. 🔧 *(Optionally show a visual rejection indicator.)*

### 4.2 Reposition Component (drag existing)

> **Synopsis**: Move an existing component to a new location. It lands at the drop point or the first open row directly below it, or stays put if there's no room.

**Steps**:
1. 🔒 Remove the component from the item list temporarily.
2. 🔒 Run **Downward Free Cell Search** against the remaining items, using the component's existing width and height.
3. 🔒 If a position is found, place the component at that position.
4. 🔒 If no position is found, **reject the move** (component stays where it was). 🔧 *(Optionally show a visual rejection indicator.)*

### 4.3 Remove Component

> **Synopsis**: Delete a component. Nothing else moves.

**Steps**: 🔒 Remove the component from the item list. No other components move.

### 4.4 Resize Right Edge (width increase/decrease)

> **Synopsis**: Widen or narrow a component by dragging its right edge. If neighbors are in the way, they get pushed right like dominoes. If a pushed item is taller than the resized component, items to the right of the pushed item in ITS rows are also pushed (cascading). If pushing would shove anything off the grid, the resize is blocked.

🔒 **Input**: Component ID, new desired width (clamped to `[1, GRID_COLUMNS]`).

**Steps**:
1. 🔒 If the new width fits without overlapping any other component, apply it directly. Done.
2. 🔒 Otherwise, attempt to **push items to the right with cascading**:
   a. Iteratively until stable, processing items left-to-right by x position:
      - If an item **vertically overlaps** the resized component and their x-ranges intersect, move it so its left edge is at the resized component's right edge (`resized.x + resized.width`).
      - **Cascade**: If a pushed item now overlaps another item (checking vertical overlap between the two items, not just with the original), push that item further right to `pusher.x + pusher.width`. This means a pushed item that is taller than the resized component will push items in rows the original didn't span.
      - Repeat until no more overlaps exist between any pair of items.
   c. 🔒 After all pushes settle, check if any item's right edge exceeds `GRID_COLUMNS`. If so, **reject the resize entirely** — return the original layout unchanged.
   d. 🔒 Otherwise, apply the new layout with pushed items.

🔒 **Key rules**:
- Pushing cascades through the full chain: a short component can push a tall component, which then pushes items in rows the original component didn't span.
- Pushing never changes y positions — only x positions are affected.
- Items that do NOT vertically overlap any component in the push chain are never moved.

### 4.5 Resize Left Edge (width increase by expanding left)

> **Synopsis**: Widen a component by dragging its left edge leftward (the right edge stays fixed). Neighbors to the left get pushed like dominoes. If a pushed item is taller than the resized component, items to the left of the pushed item in ITS rows are also pushed (cascading). If pushing would shove anything past column 0, the resize is blocked.

🔒 **Input**: Component ID, new desired x position. The new x is clamped to `[0, component.x + component.width - 1]` (minimum width of 1). The new width is computed as `originalRightEdge - newX` (i.e., `component.x + component.width - clampedX`).

**Steps**:
1. 🔒 If the new bounds fit without overlapping any other component, apply directly. Done.
2. 🔒 Otherwise, attempt to **push items to the left with cascading**:
   a. Iteratively until stable, processing items right-to-left by x position:
      - If an item **vertically overlaps** the resized component and their x-ranges intersect, move it so its right edge is at the resized component's left edge (`item.x = resized.x - item.width`).
      - **Cascade**: If a pushed item now overlaps another item (checking vertical overlap between the two items), push that item further left. This means a pushed item that is taller than the resized component will push items in rows the original didn't span.
      - Repeat until no more overlaps exist between any pair of items.
   c. 🔒 After all pushes settle, check if any item's x is less than 0. If so, **reject the resize entirely** — return the original layout unchanged.
   d. 🔒 Otherwise, apply the new layout.

🔒 **Key rules**:
- The right edge of the component stays fixed. Only the left edge and width change.
- Pushing cascades through the full chain: a short component can push a tall component, which then pushes items in rows the original component didn't span.
- Pushing never changes y positions — only x positions are affected.

### 4.6 Resize Bottom Edge (height increase/decrease)

> **Synopsis**: Make a component taller or shorter by dragging its bottom edge. Everything below it (in the same columns) shifts down by the same amount. If a pushed item is wider than the resized component, items below the pushed item in ITS columns are also pushed recursively. The top edge stays fixed. This never rejects because the grid grows vertically without limit.

🔒 **Input**: Component ID, new desired height (clamped to `[1, MAX_COMPONENT_HEIGHT]`).

**Steps**:
1. 🔒 If the new height fits without overlapping any other component, apply it directly. Done.
2. 🔒 If the new height is less than the current height (shrinking), apply directly (shrinking never causes new overlaps). Done.
3. 🔒 Otherwise (growing downward), **recursively shift items below to preserve relative positions**:
   a. Compute `oldBottom = component.y + component.height` and `newBottom = component.y + newHeight`.
   b. Compute `delta = newBottom - oldBottom`.
   c. For each other component that **horizontally overlaps** the source (the resized component):
      - If its y is between `oldBottom` and `newBottom` (in the expanded zone): move it to `newBottom`.
      - If its y is at or below `oldBottom`: shift it down by `delta`.
      - If it partially overlaps the resize zone: move it to `newBottom`.
   d. **Recursive step**: For each item that was pushed, treat it as a new push source — use its x, width, its previous bottom as `oldBottom`, and its new bottom as `newBottom`. Apply the same push logic to items below it. This ensures that if a pushed item is wider than the original, items in its additional columns are also pushed.
   e. Each item is pushed at most once (tracked by ID).

🔒 **Key rules**:
- The top edge of the component stays fixed. Only the bottom edge and height change.
- Push is recursive: a narrow component can push a wide component, which then pushes items in columns the original component didn't span.
- Pushing never changes x positions — only y positions are affected.
- Height resize downward never rejects (the grid is unbounded vertically).
- Items that do NOT horizontally overlap any component in the push chain are never moved.

---

## 5. Overlap Detection

🔒 Two items overlap when their axis-aligned bounding rectangles intersect:

```
overlaps(A, B) =
  A.x < B.x + B.width  AND  B.x < A.x + A.width  AND
  A.y < B.y + B.height  AND  B.y < A.y + A.height
```

🔒 "Vertically overlaps" (used in horizontal resize push):
```
vOverlaps(A, B) = A.y < B.y + B.height AND B.y < A.y + A.height
```

🔒 "Horizontally overlaps" (used in vertical resize push):
```
hOverlaps(A, B) = A.x < B.x + B.width AND B.x < A.x + A.width
```

---

## 6. Validation

🔒 After every operation, validate the layout. Any violation is a bug in the engine.

| Check              | Rule                                                        | Stability |
|--------------------|-------------------------------------------------------------|-----------|
| No overlap         | No pair of items has intersecting bounding rectangles       | 🔒 Core   |
| Horizontal bounds  | Every item: `x + width <= GRID_COLUMNS`                    | 🔒 Core   |
| Valid dimensions   | Every item: `x >= 0, y >= 0, width >= 1, height >= 1, height <= MAX_COMPONENT_HEIGHT` | 🔒 Core   |

🔧 Violations are displayed as a fixed banner at the bottom of the screen with red background, listing each violation. *(Presentation of violations is configurable.)*

---

## 7. UI Behavior

### 7.1 Desktop Layout

- 🔒 Each component is absolutely positioned using `left = x * columnPixelWidth`, `top = y * CELL_HEIGHT_PX`, `width = componentWidth * columnPixelWidth`, `height = componentHeight * CELL_HEIGHT_PX`.
- 🔒 `columnPixelWidth = containerWidth / GRID_COLUMNS`.
- 🔧 Grid lines (vertical and horizontal) are rendered as 1px lines. During drag operations, grid lines become more visible (blue tint). *(Visual styling is configurable.)*
- 🔧 The grid height is `max((maxRow + 2) * CELL_HEIGHT_PX, 400px)`. *(Minimum height and padding rows are tunable.)*

### 7.2 Component Visual

- 🔧 Each component type has a distinct background color: Chart=#4a90d9, Grid=#50b87a, KPI=#e6a23c, StylizedKPIGraph=#9b59b6. *(Colors will change.)*
- 🔧 Components display their type name, position `(x,y)`, and dimensions `width×height`. *(Debug info — likely removed in production.)*
- 🔧 A remove button (✕) is in the top-right corner. *(Button style and placement are configurable.)*
- 🔒 Three resize handles: left edge, right edge, bottom edge.
- 🔧 Resize handles are invisible 6px strips. *(Handle size and appearance are configurable.)*
- 🔧 While being dragged, the component's opacity drops to 0.4. *(Drag visual feedback is configurable.)*
- 🔧 Components with validation violations get a 3px solid red border. *(Violation styling is configurable.)*

### 7.3 Resize Handles

- 🔒 **Right edge**: Dragging horizontally changes width.
- 🔒 **Left edge**: Dragging horizontally changes x and width (right edge stays fixed).
- 🔒 **Bottom edge**: Dragging vertically changes height.
- 🔒 All resize handles convert pixel deltas to grid unit deltas using `Math.round(pixelDelta / cellSize)`.
- 🔧 Cursor styles: `ew-resize` for horizontal, `ns-resize` for vertical. *(Cursor choice is configurable.)*

### 7.4 Drag and Drop

- 🔒 Components are draggable via their body (excluding resize handles and the remove button).
- 🔧 The palette sidebar contains one draggable item per component type, showing the type name and default dimensions. *(Palette layout and content are configurable.)*
- 🔒 Drop target is the entire grid container.
- 🔒 On drop, the grid cell under the cursor is computed as `gridX = floor((cursorX - gridLeft) / columnPixelWidth)`, `gridY = floor((cursorY - gridTop) / CELL_HEIGHT_PX)`.

### 7.5 Rejection Indicator

🔧 *(Optional)* When a drop or reposition is rejected, show a visual rejection indicator.

🔧 Current implementation:
- The grid background briefly flashes red (`rgba(211, 47, 47, 0.08)`).
- A "Cannot place here" toast appears at the top center of the grid, fading out over 600ms.
*(Rejection visual style, text, and duration are all configurable.)*

### 7.6 Mobile Layout

🔧 When the container width is below `MOBILE_BREAKPOINT_PX` (768px):
- 🔒 Components stack vertically in a single column, full width, sorted by `(y, x)`.
- 🔒 Drag-and-drop and resize handles are disabled.
- 🔧 No grid lines are rendered. *(Mobile visual treatment is configurable.)*

---

## 8. Legacy Migration

🔧 A `migrateOldFormat` function converts from a row-based format to the grid item format. *(This is specific to the current migration path and will likely change or be removed.)*

**Input**: Array of rows, each containing an array of `{ componentId, componentType }`.

**Algorithm**: 🔒 For each row, divide `GRID_COLUMNS` evenly among the items. The first `GRID_COLUMNS % count` items get one extra column of width. Items are placed left-to-right within the row, with `y = rowIndex`.
