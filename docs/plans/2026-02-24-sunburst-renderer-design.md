# Sunburst Renderer Design

**Date**: 2026-02-24
**Branch**: `feat/sunburst-renderer`
**Status**: Design approved, pending implementation

## Overview

Replace the current polar-chart mandala renderer with a D3-powered sunburst renderer that represents hierarchical data as concentric ring sectors. This enables:

- Zoomable focus into subtrees (arcs morph so a node's children fill the circle)
- Outliner-based mandala editing (tree data <-> indented list is 1:1)
- Agent creation of new mandalas (AI outputs a tree structure)
- Variable-depth trees (some branches deeper than others)
- Unequal angular weighting (some nodes wider than others)

## Terminology

### Tree / Hierarchy (D3)

| Term | Definition |
|------|-----------|
| **Node** | A single element in the hierarchical tree. Every cell in the mandala is a node. |
| **Root** | The topmost node — renders as the center circle of the sunburst. |
| **Leaf** | A node with no children — renders on the outermost ring. |
| **Depth** | Levels from root. Root = 0. Depth determines which concentric ring a node renders in. |
| **Subtree** | A node and all its descendants. Focus zoom shows a subtree. |
| **Weight** | Numeric value controlling angular space relative to siblings. Default 1. |
| **Partition** | D3's layout algorithm: tree -> space-filling arcs with x0/x1 (angular) and y0/y1 (radial). |
| **Transparent node** | A grouping node that doesn't render its own ring. Children render at its depth. |

### Sunburst Geometry (D3 Partition Output)

| Term | Definition |
|------|-----------|
| **x0, x1** | Start/end angles of a node's arc (radians, 0 to 2pi). |
| **y0, y1** | Inner/outer radial depth (normalized 0-1). Multiplied by outer radius for pixels. |
| **Arc** | The visual shape of a node — a sector of a concentric ring. SVG path from d3.arc(). |
| **Sweep** | Angular width of an arc (x1 - x0). Full circle = 2pi. |
| **Focus / Zoomed Node** | Node whose subtree fills the circle. Null = full tree. |

### TLDraw Canvas

| Term | Definition |
|------|-----------|
| **Shape** | A TLDraw object on the canvas. The mandala is one shape. Notes are separate shapes. |
| **ShapeUtil** | Class defining shape behavior (rendering, hit-testing, interactions). |
| **Shape Props** | Serialized data on a shape. Persisted, undo-able. |
| **Page Space** | Canvas coordinate system. Shapes have x, y in page space. |
| **Shape Space** | Local coordinates within a shape. (0,0) = top-left corner. |
| **Camera** | Visible viewport. `editor.zoomToBounds()` moves it. This is "Navigate" zoom. |

### Mandala System (Iris)

| Term | Definition |
|------|-----------|
| **Mandala** | A TLDraw shape rendering a sunburst visualization from a tree definition. |
| **Cell** | A fillable area corresponding to one node. Has state (empty/active/filled) and content. |
| **Framework** | A registered configuration: tree definition + visual settings + template info. |
| **Note** | A circular note shape placed inside a cell. Carries content and metadata. |
| **Snap** | System detecting notes dragged into cells, updating state, animating layout. |

### Zoom Modes

| Term | Definition |
|------|-----------|
| **Focus Mode** | Click cell -> arcs morph, subtree fills circle, notes outside hidden. |
| **Navigate Mode** | Click cell -> camera moves to frame that cell. Current behavior. |
| **Zoom Mode** | Per-mandala setting (`focus` or `navigate`), UI toggle. |

## Data Model

### TreeNodeDef (replaces MapCellDef, MapSliceDef, MapCenterDef)

```typescript
interface TreeNodeDef {
  id: string
  label: string
  question: string
  guidance: string
  examples: string[]
  weight?: number
  metadataSchema?: Record<string, 'string' | 'number' | 'boolean'>
  children?: TreeNodeDef[]
  transparent?: boolean
}
```

### TreeMapDefinition (replaces MapDefinition)

```typescript
interface TreeMapDefinition {
  id: string
  name: string
  description: string
  root: TreeNodeDef
}
```

### Key design decisions

- **Geometry is derived, not declared.** No innerRatio, outerRatio, startAngle, endAngle. D3's partition() computes these from tree structure.
- **Weight** controls angular proportion among siblings. Default 1 = equal subdivision.
- **metadataSchema** is per-node, replacing the hardcoded ALLOWED_KEYS_BY_CELL lookup.
- **transparent** nodes don't render a ring. Children render at the transparent node's depth level.

### MandalaState stays flat

`MandalaState = Record<string, CellState>` does not change. Cell IDs are strings. Snap, actions, and prompt parts continue to work with minimal changes.

### New shape props

```typescript
type MandalaShapeProps = {
  frameworkId: string
  w: number
  h: number
  state: MandalaState
  arrows: MandalaArrowRecord[]
  arrowsVisible: boolean
  zoomedNodeId: string | null    // NEW — null = show full tree
  zoomMode: 'focus' | 'navigate' // NEW — default 'navigate'
}
```

## Transparent Group Nodes

For cases where a node visually appears to have two parents (its arc spans two adjacent nodes at the level above), use a transparent grouping node.

### Structure

```
Root
+-- CrençasGroup (transparent=true)
|   +-- Crenças Presente      <- renders at apparent depth 1
|   +-- Crenças Futuro        <- renders at apparent depth 1
|   +-- Comportamentos        <- child of GROUP, spans full group width
|       +-- Presente
+-- Pensamentos e Emoções     <- depth 1
    +-- Eventos Passados
```

### Rules

- Transparent nodes exist in the tree for grouping but don't render their own ring.
- Their children render at the transparent node's apparent depth level.
- Children of a group member span only that member's arc.
- Children of the group node itself span the entire group's angular range.
- D3 partitions normally; rendering adjusts y0/y1 offsets for transparent nodes' descendants.
- All nodes (group members, group children) are full first-class nodes with own state, metadata, interactions.

## Rendering Architecture

### Dependencies

```
d3-hierarchy     ~5 KB gzip — partition layout
d3-shape         ~7 KB gzip — arc path generation
d3-interpolate   ~4 KB gzip — zoom transition interpolation
```

Plus TypeScript types: @types/d3-hierarchy, @types/d3-shape, @types/d3-interpolate.

### Pipeline

```
TreeMapDefinition
  -> d3.hierarchy(root)
  -> .sum(d => d.weight ?? 1)
  -> d3.partition()(root)
  -> post-process: adjust y0/y1 for transparent nodes
  -> for each visible node: d3.arc()(x0, x1, y0, y1) -> SVG path string
  -> React renders <path> elements
```

### Component structure

```
MandalaShapeUtil.component(shape)
  +-- <MandalaInteractive shape={shape} />
       +-- hover tracking (same as current)
       +-- zoom animation state (useRef for RAF)
       +-- <SunburstSvg ...>
            +-- <defs> with arc text paths
            +-- <path> per visible node (arc sectors)
            +-- <text>/<textPath> per visible node (curved labels)
            +-- center circle (zoomed node label or root)
```

### Labels

- Same `<textPath>` approach as current renderer: invisible arc path + text following the curve.
- Label arc placed at `y1 * outerRadius - offset` (near outer edge of cell).
- Flip logic preserved: text always readable regardless of position.
- Labels hidden (opacity 0) when arc sweep is too small to fit text.
- During zoom animation: labels fade out, fade back in when arcs settle.

### Zoom animation flow

1. User clicks a node in Focus mode.
2. Compute target arc params for all nodes (D3 partition relative to clicked node).
3. Start RAF loop: d3.interpolate(current, target) per node, update refs.
4. Each frame: re-render SVG paths from interpolated arc params.
5. On completion: update shape prop `zoomedNodeId` via editor.updateShape().

Clicking center circle zooms back to parent (or root at depth 1).

## Dual Zoom Modes

### Focus Mode (Sunburst Zoom)

- Click arc -> arcs morph so clicked node's subtree fills circle.
- Click center -> zoom back to parent.
- Notes outside focused subtree are hidden.
- Notes inside re-layout to fill expanded cells.
- Mandala shape stays same size on canvas.

### Navigate Mode (Camera Zoom)

- Click arc -> TLDraw camera zooms to cell's bounding box (current behavior).
- No arc morphing, no note hiding.
- Standard canvas navigation.

### UI Toggle

Small floating control near the mandala or in toolbar. Two states: Focus / Navigate.
Mode stored per-mandala in shape props. Default: `navigate` (preserves current behavior).

### onClick handler

Reads `shape.props.zoomMode` and dispatches:
- `focus`: updates `zoomedNodeId` prop, triggers arc animation.
- `navigate`: calls `editor.zoomToBounds()` on cell bounding box.

## System Integration

### What doesn't change

- MandalaState (flat Record<string, CellState>)
- Action schemas (FillCellAction.cellId etc. still string IDs)
- Mode definitions
- Prompt parts

### What changes

| File | Change | Risk |
|------|--------|------|
| shared/types/MandalaTypes.ts | Add TreeNodeDef, TreeMapDefinition | Low |
| client/lib/frameworks/emotions-map.ts | Rewrite as TreeMapDefinition | Medium |
| client/lib/frameworks/life-map.ts | Rewrite as TreeMapDefinition | Medium |
| client/lib/frameworks/framework-registry.ts | Accept TreeMapDefinition | Low |
| client/shapes/MandalaShapeUtil.tsx | Replace MandalaSvg with SunburstSvg, update onClick | High |
| client/lib/mandala-geometry.ts | Rewrite: derive bounds from D3 partition | High |
| client/lib/cell-layout.ts | Adapt to tree-derived cell bounds | Medium |
| client/lib/mandala-snap.ts | Use new geometry API, respect zoomedNodeId | Medium |
| client/actions/element-lookup-utils.ts | Read metadataSchema from tree node | Medium |

### Migration of existing frameworks

Emotions map and life map rewritten as TreeMapDefinition. The hierarchy is already implicit in their structure. Weights chosen to match current angular proportions.

## Branch Strategy

Separate branch `feat/sunburst-renderer`. Current MandalaSvg stays on main untouched until merge.

### Validation before merge

1. Emotions map renders identically (or near-identically) to current polar chart.
2. Life map renders correctly with 6 slices x 4 rings.
3. Focus zoom: click arc -> subtree fills circle, notes hide/show.
4. Navigate zoom: click arc -> camera zooms (same as current).
5. Note snapping works in both modes.
6. All existing tests pass (or updated).
7. Agent actions (fill_cell, highlight_cell, etc.) work.
8. toSvg() export works.
