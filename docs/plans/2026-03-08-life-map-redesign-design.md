# Life Map Redesign — Design Document

**Date:** 2026-03-08

## Overview

Redesign the Life Map (Mapa da Vida) to match the Yinflow reference. The mandala is split horizontally into two 180° halves:

- **Bottom half** (3 o'clock → 6 o'clock → 9 o'clock): 6 life domains × 4 rings
- **Top half** (9 o'clock → 12 o'clock → 3 o'clock): Temporal calendar system × 4 rings

Both halves share the same 4 concentric rings (aligned radially) plus a center circle (Essência).

## Bottom Half — Life Domains

6 equal domains (30° each), clockwise from 3 o'clock:

1. **Espiritual** (3 o'clock)
2. **Mental**
3. **Físico**
4. **Material**
5. **Profissional**
6. **Pessoal** (9 o'clock)

Each domain is a transparent wrapper containing a chain: **Querer** (ring 1) → **Ser** (ring 2) → **Ter** (ring 3) → **Saber** (ring 4, leaf).

Saber leaves use **weight: 4** (see Angular Balance below).

## Top Half — Temporal Calendar

### Ring 1 (innermost): Days

8 cells, each 22.5° of the top 180°:

| # | ID | Label |
|---|-----|-------|
| 1 | fluxo | Flow |
| 2 | monday | Monday |
| 3 | tuesday | Tuesday |
| 4 | wednesday | Wednesday |
| 5 | thursday | Thursday |
| 6 | friday | Friday |
| 7 | saturday | Saturday |
| 8 | sunday | Sunday |

### Ring 2: Weeks

4 visual week arcs (each 45°), formed by grouping pairs of days:

| Week | Days | groupId |
|------|------|---------|
| Week 1 | Fluxo + Monday | `week-1` |
| Week 2 | Tuesday + Wednesday | `week-2` |
| Week 3 | Thursday + Friday | `week-3` |
| Week 4 | Saturday + Sunday | `week-4` |

### Ring 3: Months

12 visual month arcs (each 15°), 3 per week:

| Week | Month children |
|------|---------------|
| Week 1 | January, February, March |
| Week 2 | April, May, June |
| Week 3 | July, August, September |
| Week 4 | October, November, December |

Dividers rendered between each month arc.

### Ring 4 (outermost): 7-Year Life Phases

7 visual block arcs, distributed via groupId merging:

**Left group** (months Jan–Jun, under Fluxo+Mon+Tue+Wed):

| Month(s) | Block groupId |
|-----------|--------------|
| Jan + Feb | `phase-0-6` |
| Mar | `phase-7-13` |
| Apr | `phase-14-20` |
| May | `phase-21-27` |
| Jun | `phase-28-34` |

**Right group** (months Jul–Dec, under Thu+Fri+Sat+Sun):

| Month(s) | Block groupId |
|-----------|--------------|
| Jul + Aug + Sep | `phase-35-41` |
| Oct + Nov + Dec | `phase-42-48` |

## Tree Structure

Each day is a chain: Day (ring 1) → Week-part (ring 2) → branches into 3 Month-parts (ring 3) → each has 1 Block-part (ring 4, leaf).

```
root (Essência)
├── espiritual (transparent) → querer → ser → ter → saber (leaf, weight:4)
├── mental (transparent) → querer → ser → ter → saber (leaf, weight:4)
├── fisico (transparent) → ...
├── material (transparent) → ...
├── profissional (transparent) → ...
├── pessoal (transparent) → ...
├── fluxo (ring 1)
│   └── week-1-a (ring 2, groupId:"week-1")
│       ├── jan-a (ring 3, groupId:"jan") → phase-0-6-a (ring 4, groupId:"phase-0-6", leaf)
│       ├── feb-a (ring 3, groupId:"feb") → phase-0-6-b (ring 4, groupId:"phase-0-6", leaf)
│       └── mar-a (ring 3, groupId:"mar") → phase-7-13-a (ring 4, groupId:"phase-7-13", leaf)
├── monday (ring 1)
│   └── week-1-b (ring 2, groupId:"week-1")
│       ├── jan-b (ring 3, groupId:"jan") → phase-0-6-c (ring 4, groupId:"phase-0-6", leaf)
│       ├── feb-b (ring 3, groupId:"feb") → phase-0-6-d (ring 4, groupId:"phase-0-6", leaf)
│       └── mar-b (ring 3, groupId:"mar") → phase-7-13-b (ring 4, groupId:"phase-7-13", leaf)
├── tuesday (ring 1)
│   └── week-2-a (ring 2, groupId:"week-2")
│       ├── apr-a (ring 3, groupId:"apr") → phase-14-20-a (ring 4, groupId:"phase-14-20", leaf)
│       ├── may-a (ring 3, groupId:"may") → phase-21-27-a (ring 4, groupId:"phase-21-27", leaf)
│       └── jun-a (ring 3, groupId:"jun") → phase-28-34-a (ring 4, groupId:"phase-28-34", leaf)
├── wednesday → week-2-b → apr-b, may-b, jun-b → blocks...
├── thursday → week-3-a → jul-a, aug-a, sep-a → phase-35-41 parts...
├── friday → week-3-b → jul-b, aug-b, sep-b → phase-35-41 parts...
├── saturday → week-4-a → oct-a, nov-a, dec-a → phase-42-48 parts...
└── sunday → week-4-b → oct-b, nov-b, dec-b → phase-42-48 parts...
```

Total leaves: 8 days × 3 months × 1 block = **24 leaves** (weight 1 each).

## Angular Balance

- Bottom: 6 domain leaves × weight 4 = **24 units**
- Top: 24 block-part leaves × weight 1 = **24 units**
- Result: exact 180°/180° split

`startAngle: Math.PI / 2` places the first child at 3 o'clock.

## Engine Change: groupId

### New field on TreeNodeDef

```typescript
groupId?: string  // Adjacent arcs at same depth with same groupId merge visually
```

### Renderer behavior (SunburstSvg)

After computing arcs, find groups of arcs at the same depth with the same `groupId`. Render a single arc from `min(x0)` to `max(x1)`, using the shared `y0`/`y1`. The merged arc gets the group label (derived from the groupId or the first arc's label).

### Hit-testing

`getCellAtPointFromArcs` checks against merged arc bounds. Clicking any part of a merged arc returns the groupId.

### Label placement

Labels are centered on the merged arc bounds, not individual part bounds.

## Visual Config

```typescript
colors: {
  stroke: '#114559',
  text: '#114559',
  cellFill: '#FFFFFF',
  cellHoverFill: '#D9E2EA',
}
labelFont: 'Quicksand, sans-serif'
defaultSize: 700
```

Month dividers: thin stroke lines between each month arc at ring 3.
