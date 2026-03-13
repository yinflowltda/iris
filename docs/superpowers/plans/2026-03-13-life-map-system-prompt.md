# Life Map System Prompt Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin 145-line `buildLifeMapSection` with a comprehensive, self-contained system prompt grounded in OT theory and the Yinflow methodology, using a Layered Onion architecture with region-based loading.

**Architecture:** The new prompt follows the emotions map pattern — one exported function `buildLifeMapSection(flags, sessionState?)` that composes layers based on session state. Five layers: base (always), intentional region, temporal region, condition overlays, and free mode. Region-based loading instead of step-based (life map exploration is fluid, not sequential).

**Tech Stack:** TypeScript, Vitest for testing, bun as runner.

**Spec:** `docs/superpowers/specs/2026-03-13-life-map-system-prompt-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `client/lib/frameworks/life-map.ts` | Modify | Rename `flow`→`flex`, `essencia`→`proposito`, update labels and descriptions |
| `shared/schema/PromptPartDefinitions.ts` | Modify | Add life-map session state fields (`region`, `activeConditions`) to `SessionStatePart` |
| `worker/prompt/sections/life-map-section.ts` | Rewrite | Complete rewrite — layered onion prompt (~800-1000 lines) |
| `worker/prompt/buildSystemPrompt.ts` | Modify | Add `'life-map'` to `SELF_CONTAINED_FRAMEWORKS` |
| `tests/unit/build-system-prompt.test.ts` | Modify | Update assertions for new life map content |
| `tests/unit/prompt/life-map-slices.test.ts` | Create | Region-based loading tests (mirrors `emotions-map-slices.test.ts`) |
| `tests/unit/life-map.test.ts` | Modify | Update cell ID assertions for renames |
| `tests/unit/life-tree.test.ts` | Modify | Update `essencia`→`proposito` and `flow`→`flex` assertions |
| `tests/unit/prisma/cell-anchors.test.ts` | Modify | Update `essencia`→`proposito` and `flow`→`flex` assertions |

---

## Chunk 1: Foundation — Code Renames & Infrastructure

### Task 1: Rename `flow` → `flex` in life-map tree definition

**Files:**
- Modify: `client/lib/frameworks/life-map.ts`
- Modify: `tests/unit/life-map.test.ts`
- Modify: `tests/unit/life-tree.test.ts` (has `flow` assertions at lines ~82, 85, 153, 182)
- Modify: `tests/unit/prisma/cell-anchors.test.ts` (has `flow` negative assertions at lines ~111-114)

- [ ] **Step 1: Read `tests/unit/life-map.test.ts` to understand existing assertions**

- [ ] **Step 2: Update `DAYS` array — rename flow to flex**

In `client/lib/frameworks/life-map.ts`, change:
```typescript
// Before
{ id: 'flow', label: 'Flow' },
// After
{ id: 'flex', label: 'Flex' },
```

- [ ] **Step 3: Update all `flow` references throughout the file**

Search and replace in `life-map.ts`:
- `isFlow` variable name → `isFlex` (in `buildTemporalDayNode`)
- `d.id !== 'flow'` → `d.id !== 'flex'` (in `daySegmentCells` filter)
- `'flow'` in `temporalNoteCells` → `'flex'`
- Comments referencing "Flow" cell → "Flex"

- [ ] **Step 4: Update tests to use `flex` cell IDs**

In ALL test files, replace `flow` cell ID references with `flex`:
- `tests/unit/life-map.test.ts` — any `flow` cell ID references
- `tests/unit/life-tree.test.ts` — `'flow'` references (~lines 82, 85, 153, 182)
- `tests/unit/prisma/cell-anchors.test.ts` — `'flow'`, `'flow-week1'`, `'flow-january'` (~lines 111-114)

- [ ] **Step 5: Run tests to verify**

Run: `bun test tests/unit/life-map.test.ts tests/unit/life-tree.test.ts tests/unit/prisma/cell-anchors.test.ts`
Expected: All tests pass with new cell IDs.

- [ ] **Step 6: Commit**

```bash
git add client/lib/frameworks/life-map.ts tests/unit/life-map.test.ts tests/unit/life-tree.test.ts tests/unit/prisma/cell-anchors.test.ts
git commit -m "refactor: rename flow → flex cell ID in life map tree"
```

### Task 2: Rename `essencia` → `proposito` and update domain names

**Files:**
- Modify: `client/lib/frameworks/life-map.ts`
- Modify: `tests/unit/life-map.test.ts`
- Modify: `tests/unit/life-tree.test.ts` (has `essencia` assertions at lines ~16-17, 36)
- Modify: `tests/unit/prisma/cell-anchors.test.ts` (has `essencia` positive assertion at line ~92)

- [ ] **Step 1: Update center cell in `LIFE_MAP` MapDefinition**

In `client/lib/frameworks/life-map.ts`:
```typescript
// Before
center: {
    id: 'essencia',
    label: 'Essência',
    ...
    question: 'What is your essence — the core of who you are beyond roles and titles?',
    guidance: 'Help the user connect with their deepest sense of self...',
// After
center: {
    id: 'proposito',
    label: 'Propósito',
    ...
    question: 'What is the driving reason behind your current choices? What are you working toward in this period of your life?',
    guidance: 'Help the user articulate the focused intention that gives direction to everything on this map. Life maps are scoped to a 3-6 month horizon.',
```

- [ ] **Step 2: Update `longDescription` domain names**

```typescript
// Before
'Spiritual, Emotional, Physical, Material, Professional, and Relational'
// After
'Spiritual, Mental, Physical, Material, Professional, and Personal'
```

- [ ] **Step 3: Update file header comment**

Change `Center: Essência (Essence/Self)` → `Center: Propósito (Purpose/Focus)`

- [ ] **Step 4: Update `edgeTypes` — change `essencia` references to `proposito`**

In the `grounds` edge type:
```typescript
fromCells: ['proposito'],  // was ['essencia']
```

- [ ] **Step 5: Update tests for new center cell ID**

In ALL test files, replace `essencia` → `proposito`:
- `tests/unit/life-map.test.ts` — any `essencia` references
- `tests/unit/life-tree.test.ts` — `'essencia'` references (~lines 16-17, 36)
- `tests/unit/prisma/cell-anchors.test.ts` — `expect(ids).toContain('essencia')` → `'proposito'` (~line 92)

- [ ] **Step 6: Run tests**

Run: `bun test tests/unit/life-map.test.ts tests/unit/life-tree.test.ts tests/unit/prisma/cell-anchors.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/lib/frameworks/life-map.ts tests/unit/life-map.test.ts tests/unit/life-tree.test.ts tests/unit/prisma/cell-anchors.test.ts
git commit -m "refactor: rename essencia → proposito, update domain names"
```

### Task 3: Add life-map fields to SessionStatePart

**Files:**
- Modify: `shared/schema/PromptPartDefinitions.ts`

- [ ] **Step 1: Add optional life-map fields to SessionStatePart**

```typescript
export interface SessionStatePart {
    type: 'sessionState'
    currentStep: number
    filledCells: string[]
    activeCells: string[]
    mode: 'guided' | 'free'
    frameworkId: string
    // Life Map specific (optional — only present when frameworkId is 'life-map')
    region?: 'intentional' | 'temporal' | null
    activeConditions?: string[]
}
```

Note: Adding optional fields rather than a discriminated union is a pragmatic choice — it avoids breaking `SessionStatePart` consumers that expect `currentStep` to always exist. The `buildLifeMapSection` function reads `region` and `activeConditions`; the emotions map builder reads `currentStep`. Both coexist.

- [ ] **Step 2: Run existing tests to verify no breakage**

Run: `bun test tests/unit/prompt/emotions-map-slices.test.ts tests/unit/build-system-prompt.test.ts`
Expected: All existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add shared/schema/PromptPartDefinitions.ts
git commit -m "feat: add region and activeConditions fields to SessionStatePart for life map"
```

### Task 4: Register life-map as self-contained framework

**Files:**
- Modify: `worker/prompt/buildSystemPrompt.ts`

- [ ] **Step 1: Add `'life-map'` to `SELF_CONTAINED_FRAMEWORKS`**

```typescript
// Before
const SELF_CONTAINED_FRAMEWORKS = new Set(['emotions-map'])
// After
const SELF_CONTAINED_FRAMEWORKS = new Set(['emotions-map', 'life-map'])
```

- [ ] **Step 2: Run existing tests**

Run: `bun test tests/unit/build-system-prompt.test.ts`
Expected: The "includes Life Map section when frameworkId is life-map" test should still pass (the section content is what changes, not whether it's included).

- [ ] **Step 3: Commit**

```bash
git add worker/prompt/buildSystemPrompt.ts
git commit -m "feat: register life-map as self-contained framework"
```

---

## Chunk 2: Prompt Section — Base Layer & Loading Logic

### Task 5: Write the failing test for region-based loading

**Files:**
- Create: `tests/unit/prompt/life-map-slices.test.ts`

- [ ] **Step 1: Create test file with test scaffolding**

```typescript
import { describe, expect, it } from 'vitest'
import '../../../client/lib/frameworks/emotions-map'
import '../../../client/lib/frameworks/life-map'
import '../../../client/modes/AgentModeDefinitions'
import type { SessionStatePart } from '../../../shared/schema/PromptPartDefinitions'
import type { AgentPrompt } from '../../../shared/types/AgentPrompt'
import { buildSystemPrompt } from '../../../worker/prompt/buildSystemPrompt'

const ALL_ACTION_TYPES = [
    'message',
    'think',
    'fill_cell',
    'highlight_cell',
    'zoom_to_cell',
    'create_arrow',
    'set_metadata',
    'get_metadata',
    'unknown',
] as const

function makePrompt(sessionState?: SessionStatePart): AgentPrompt {
    const prompt: Record<string, unknown> = {
        mode: {
            type: 'mode',
            modeType: 'mandala',
            frameworkId: 'life-map',
            partTypes: ['mode', 'messages', 'screenshot', 'sessionState'],
            actionTypes: [...ALL_ACTION_TYPES],
        },
    }
    if (sessionState) {
        prompt.sessionState = sessionState
    }
    return prompt as unknown as AgentPrompt
}

function makeSessionState(overrides: Partial<SessionStatePart> = {}): SessionStatePart {
    return {
        type: 'sessionState',
        currentStep: 0,
        filledCells: [],
        activeCells: [],
        mode: 'guided',
        frameworkId: 'life-map',
        region: null,
        activeConditions: [],
        ...overrides,
    }
}

function buildPromptText(sessionState?: SessionStatePart): string {
    return buildSystemPrompt(makePrompt(sessionState), { withSchema: false })
}

describe('life-map region-based loading', () => {
    describe('base layer always present', () => {
        it('includes role and core principles in all modes', () => {
            const text = buildPromptText(makeSessionState({ region: 'intentional' }))
            expect(text).toContain('life design companion')
            expect(text).toContain('Core Principles')
            expect(text).toContain('highlight_cell')
            expect(text).toContain('Propósito')
        })
    })

    describe('no session state — full prompt', () => {
        it('includes all layers when no session state', () => {
            const text = buildPromptText(undefined)
            expect(text).toContain('life design companion')
            expect(text).toContain('Want / Querer')
            expect(text).toContain('Do (Fazer)')
            expect(text).toContain('Anxiety')
            expect(text).toContain('Free Exploration')
        })
    })

    describe('guided mode — region-based loading', () => {
        it('region null: loads base layer only', () => {
            const text = buildPromptText(makeSessionState({ region: null }))
            expect(text).toContain('life design companion')
            expect(text).not.toContain('Want / Querer (Purpose/Desire)')
            expect(text).not.toContain('Do (Fazer)')
        })

        it('region intentional: loads base + intentional', () => {
            const text = buildPromptText(makeSessionState({ region: 'intentional' }))
            expect(text).toContain('Want / Querer (Purpose/Desire)')
            expect(text).toContain('espiritual-querer')
            expect(text).not.toContain('monday-dawn')
            expect(text).not.toContain('Do (Fazer)')
        })

        it('region temporal: loads base + temporal', () => {
            const text = buildPromptText(makeSessionState({ region: 'temporal' }))
            expect(text).toContain('Do (Fazer)')
            expect(text).toContain('monday-dawn')
            expect(text).not.toContain('Want / Querer (Purpose/Desire)')
        })
    })

    describe('condition overlays', () => {
        it('loads anxiety overlay when active', () => {
            const text = buildPromptText(
                makeSessionState({
                    region: 'intentional',
                    activeConditions: ['anxiety'],
                }),
            )
            expect(text).toContain('Anxiety')
            expect(text).not.toContain('Burnout')
            expect(text).not.toContain('ADHD')
        })

        it('loads multiple conditions', () => {
            const text = buildPromptText(
                makeSessionState({
                    region: 'temporal',
                    activeConditions: ['insomnia', 'adhd'],
                }),
            )
            expect(text).toContain('Insomnia')
            expect(text).toContain('ADHD')
            expect(text).not.toContain('Burnout')
        })

        it('no conditions loaded when array empty', () => {
            const text = buildPromptText(
                makeSessionState({ region: 'intentional', activeConditions: [] }),
            )
            expect(text).not.toContain('Overlay: Anxiety')
            expect(text).not.toContain('Overlay: Burnout')
        })
    })

    describe('free mode', () => {
        it('loads base + free mode rules + conditions', () => {
            const text = buildPromptText(
                makeSessionState({
                    mode: 'free',
                    activeConditions: ['depression'],
                }),
            )
            expect(text).toContain('Free Exploration')
            expect(text).toContain('Content routing')
            expect(text).toContain('Depression')
            // Should NOT include guided region layers
            expect(text).not.toContain('Want / Querer (Purpose/Desire)')
            expect(text).not.toContain('Do (Fazer)')
        })
    })

    describe('self-contained — no generic intro/rules', () => {
        it('uses compact intro, not generic intro', () => {
            const text = buildPromptText(undefined)
            expect(text).toContain('structured JSON containing a list of actions')
            expect(text).not.toContain('You are a helpful assistant')
        })
    })

    describe('token reduction', () => {
        it('intentional region is significantly smaller than full prompt', () => {
            const full = buildPromptText(undefined)
            const scoped = buildPromptText(
                makeSessionState({ region: 'intentional' }),
            )
            const reduction = 1 - scoped.length / full.length
            expect(reduction).toBeGreaterThan(0.15)
        })
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/prompt/life-map-slices.test.ts`
Expected: FAIL — the current `buildLifeMapSection` doesn't accept session state or produce the expected content.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/prompt/life-map-slices.test.ts
git commit -m "test: add failing tests for life map region-based loading"
```

### Task 6: Implement base layer of buildLifeMapSection

**Files:**
- Rewrite: `worker/prompt/sections/life-map-section.ts`

This task creates the base layer and loading logic skeleton. The region layers, condition overlays, and free mode are stubbed as empty functions that will be filled in Tasks 7-10.

- [ ] **Step 1: Write the new file structure with base layer and loading logic**

Rewrite `worker/prompt/sections/life-map-section.ts` with:

```typescript
import type { SessionStatePart } from '../../../shared/schema/PromptPartDefinitions'
import type { SystemPromptFlags } from '../getSystemPromptFlags'
import { flagged } from './flagged'

/**
 * Build the Life Map system prompt section.
 *
 * Layered Onion architecture:
 * - Base layer: always loaded (role, six verbs, flippable notes, arrows, metadata, principles)
 * - Intentional region: loaded when region is 'intentional' (domain exploration)
 * - Temporal region: loaded when region is 'temporal' (routine/calendar)
 * - Condition overlays: loaded per active condition
 * - Free mode: loaded when mode is 'free'
 *
 * When sessionState is absent, all layers are included (full prompt).
 */
export function buildLifeMapSection(
    flags: SystemPromptFlags,
    sessionState?: SessionStatePart,
): string {
    const sections = [buildBaseLayer(flags)]

    if (!sessionState) {
        // No session state → load everything (backwards-compatible full prompt)
        sections.push(
            buildIntentionalRegion(flags),
            buildTemporalRegion(flags),
            ...ALL_CONDITION_BUILDERS.map((fn) => fn()),
            buildFreeModeRules(flags),
        )
    } else if (sessionState.mode === 'free') {
        sections.push(buildFreeModeRules(flags))
        // Load active condition overlays
        for (const condition of sessionState.activeConditions ?? []) {
            const builder = CONDITION_BUILDER_MAP[condition]
            if (builder) sections.push(builder())
        }
    } else {
        // Guided mode: load region layer based on session state
        const region = sessionState.region
        if (region === 'intentional') {
            sections.push(buildIntentionalRegion(flags))
        } else if (region === 'temporal') {
            sections.push(buildTemporalRegion(flags))
        }
        // region === null → base layer only (Step 0 framing)

        // Load active condition overlays
        for (const condition of sessionState.activeConditions ?? []) {
            const builder = CONDITION_BUILDER_MAP[condition]
            if (builder) sections.push(builder())
        }
    }

    return sections.join('\n\n')
}

// ============================================================================
// Condition overlay registry
// ============================================================================

type ConditionBuilder = () => string

const CONDITION_BUILDER_MAP: Record<string, ConditionBuilder> = {
    anxiety: buildConditionAnxiety,
    'chronic-stress': buildConditionChronicStress,
    insomnia: buildConditionInsomnia,
    adhd: buildConditionADHD,
    burnout: buildConditionBurnout,
    'chronic-pain': buildConditionChronicPain,
    depression: buildConditionDepression,
}

const ALL_CONDITION_BUILDERS: ConditionBuilder[] = Object.values(CONDITION_BUILDER_MAP)
```

Then implement `buildBaseLayer(flags)` with the full base layer content from the spec (sections: Role & Identity, Six Verbs, Propósito, Flippable Notes Guidance, Arrow System, Metadata System, Core Principles, Cross-Region Bridge, Session Flow, Mandala Actions, Communication Style, Internal Reasoning, Boundaries).

**Note on `tense` metadata:** The spec instructs Iris to call `set_metadata` with a `tense` field. This field does not yet exist in the metadata schema — it will be added separately. Include the `tense` instructions in the prompt text as-is (the prompt describes the *desired* behavior). The schema change is tracked in the spec's Feature Dependencies.

The base layer is the largest single section. Translate the spec sections into template literal strings, using `flagged()` for conditional sections (same pattern as emotions map).

Key content markers that tests will check for:
- `"life design companion"` (role)
- `"Core Principles"` (principles section)
- `"highlight_cell"` (mandala actions)
- `"Propósito"` (center cell)

Stub the region/condition/free builders as minimal functions returning placeholder strings:
```typescript
function buildIntentionalRegion(_flags: SystemPromptFlags): string {
    return '### Intentional Region\n(placeholder)'
}
function buildTemporalRegion(_flags: SystemPromptFlags): string {
    return '### Temporal Region\n(placeholder)'
}
function buildFreeModeRules(_flags: SystemPromptFlags): string {
    return '### Free Exploration\n(placeholder)'
}
function buildConditionAnxiety(): string { return '#### Overlay: Anxiety\n(placeholder)' }
// ... etc for each condition
```

- [ ] **Step 2: Run the base layer tests**

Run: `bun test tests/unit/prompt/life-map-slices.test.ts`
Expected: Base layer tests pass, some region/condition tests may pass with placeholders, token reduction test should pass.

- [ ] **Step 3: Update `build-system-prompt.test.ts` assertions**

The existing test at line 43-49 checks for `'Life Map'` and `'life domains'`. Update to match new content:
```typescript
it('includes Life Map section when frameworkId is life-map', () => {
    const prompt = makeMinimalPrompt('life-map')
    const systemPrompt = buildSystemPrompt(prompt, { withSchema: false })
    expect(systemPrompt).toContain('Life Map')
    expect(systemPrompt).toContain('life design companion')
    expect(systemPrompt).not.toContain('CBT')
})
```

- [ ] **Step 4: Run all prompt tests**

Run: `bun test tests/unit/prompt/ tests/unit/build-system-prompt.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add worker/prompt/sections/life-map-section.ts tests/unit/prompt/life-map-slices.test.ts tests/unit/build-system-prompt.test.ts
git commit -m "feat: implement life map base layer with loading logic skeleton"
```

---

## Chunk 3: Prompt Section — Intentional & Temporal Region Layers

### Task 7: Implement intentional region layer (Layer 2)

**Files:**
- Modify: `worker/prompt/sections/life-map-section.ts`

- [ ] **Step 1: Replace the `buildIntentionalRegion` placeholder**

Implement `buildIntentionalRegion(flags)` with content from spec sections:

**Sections to include:**
1. **Exploring a Domain** — The Want → Be → Have → Know guided sequence with educative moments. Four sub-sections, one per verb, each with: question prompt, what to explore, educative moment text.
2. **Users Who Don't Know Their Want** — Socratic questioning, Have as alternative entry.
3. **Flipping Within Domains** — When to suggest, good vs weak flips.
4. **Cross-Domain Patterns** — Shared desires, resource transfers, identity conflicts, knowledge bridges.
5. **Domain-Specific Exploration Cues** — Table of 6 dimensions with natural Want prompts and what to watch for.
6. **Satisfaction & Performance Assessment** — Optional 0-10 rating, before/after fields.
7. **Cell ID Format (Intentional Half)** — All 25 cell IDs (`proposito` + 6 domains × 4 layers).
8. **fill_cell Examples (Intentional Half)** — Sample labels for each layer type.

Content markers for tests (these exact strings must appear in the output — the tests in Task 5 assert on them):
- `"Want / Querer (Purpose/Desire)"` (section header — must match verbatim)
- `"espiritual-querer"` (cell ID)

- [ ] **Step 2: Run tests**

Run: `bun test tests/unit/prompt/life-map-slices.test.ts`
Expected: Intentional region tests pass (content markers found/excluded correctly).

- [ ] **Step 3: Commit**

```bash
git add worker/prompt/sections/life-map-section.ts
git commit -m "feat: implement intentional region layer for life map prompt"
```

### Task 8: Implement temporal region layer (Layer 3)

**Files:**
- Modify: `worker/prompt/sections/life-map-section.ts`

- [ ] **Step 1: Replace the `buildTemporalRegion` placeholder**

Implement `buildTemporalRegion(flags)` with content from spec sections:

**Sections to include:**
1. **The Do (Fazer) Verb** — Intro connecting temporal half to intentional.
2. **Temporal Structure** — Days (7 + Flex), customizable day segments, weeks (recurring monthly), months, septenniums.
3. **Exploring the Temporal Half** — Current routine mapping (past-present), routine analysis (what to surface), routine restructuring (present-future), weekly patterns, monthly goals, septenniums.
4. **Cell ID Format (Temporal Half)** — All temporal cell IDs: `flex`, 28 day segments, 8 week slots, 24 months, 10 septenniums.
5. **fill_cell Examples (Temporal Half)** — Sample labels.

Content markers for tests:
- `"Do (Fazer)"` (section header)
- `"monday-dawn"` (cell ID)

- [ ] **Step 2: Run tests**

Run: `bun test tests/unit/prompt/life-map-slices.test.ts`
Expected: Temporal region tests pass.

- [ ] **Step 3: Commit**

```bash
git add worker/prompt/sections/life-map-section.ts
git commit -m "feat: implement temporal region layer for life map prompt"
```

---

## Chunk 4: Prompt Section — Condition Overlays & Free Mode

### Task 9: Implement condition overlays (Layer 4)

**Files:**
- Modify: `worker/prompt/sections/life-map-section.ts`

- [ ] **Step 1: Replace all 7 condition builder placeholders**

Implement each condition builder function from the spec. Each condition has:
- Intentional adjustments (which dimensions to explore, what to look for)
- Temporal adjustments (routine patterns to surface, what to insert)
- Special cautions where applicable

**Conditions:**
1. `buildConditionAnxiety()` — triggers across dimensions, overload patterns, relaxation gaps
2. `buildConditionChronicStress()` — unresolved events, incongruence, role imbalance
3. `buildConditionInsomnia()` — sleep-focused temporal, Noite/Madrugada emphasis
4. `buildConditionADHD()` — executive function, concrete scheduling, Flex as strength
5. `buildConditionBurnout()` — Profissional priority, reconnect to Propósito, small steps
6. `buildConditionChronicPain()` — pain-onset events, functional capacity planning
7. `buildConditionDepression()` — Want may feel unreachable, small achievable changes, crisis safety

Each condition builder includes the health disclaimer:
```
"The guidance I provide here is for educational and self-exploration purposes. It does not replace professional care. I recommend reviewing your map with a qualified professional before making significant changes based on what we explore."
```

Content markers for tests:
- `"Anxiety"`, `"Burnout"`, `"ADHD"`, `"Insomnia"`, `"Depression"`, `"Chronic Stress"`, `"Chronic Pain"` (condition names)

- [ ] **Step 2: Run condition overlay tests**

Run: `bun test tests/unit/prompt/life-map-slices.test.ts`
Expected: All condition overlay tests pass (correct conditions loaded/excluded).

- [ ] **Step 3: Commit**

```bash
git add worker/prompt/sections/life-map-section.ts
git commit -m "feat: implement 7 condition overlays for life map prompt"
```

### Task 10: Implement free mode layer (Layer 5)

**Files:**
- Modify: `worker/prompt/sections/life-map-section.ts`

- [ ] **Step 1: Replace the `buildFreeModeRules` placeholder**

Implement `buildFreeModeRules(flags)` with content from spec:

**Sections to include:**
1. **Activation** — When free mode activates (explicit request, returning to populated map, voice monologue).
2. **Iris as Vessel** — Listen, absorb, extract, fill, present.
3. **Content Routing** — Table mapping content types to target cells with tense detection.
4. **Multi-Cell Extraction Example** — The "software developer burnout" example from spec.
5. **Returning Sessions** — Orient, surface accountability, check single-tense notes, offer re-rating.
6. **Free Mode Principles** — 7 principles for free-form exploration.

Content markers for tests:
- `"Free Exploration"` (section header)
- `"Content routing"` (routing table)

- [ ] **Step 2: Run all tests**

Run: `bun test tests/unit/prompt/life-map-slices.test.ts`
Expected: All tests pass including free mode tests.

- [ ] **Step 3: Commit**

```bash
git add worker/prompt/sections/life-map-section.ts
git commit -m "feat: implement free mode layer for life map prompt"
```

---

## Chunk 5: Integration, Full Test Suite & Cleanup

### Task 11: Run full test suite and verify integration

**Files:**
- All modified files

- [ ] **Step 1: Run the complete test suite**

Run: `bun test`
Expected: All tests pass. No regressions in emotions map or other tests.

- [ ] **Step 2: Verify prompt sizes**

Add a temporary logging statement or run a quick size check:
```bash
bun -e "
import './client/lib/frameworks/life-map';
import './client/lib/frameworks/emotions-map';
import './client/modes/AgentModeDefinitions';
import { buildSystemPrompt } from './worker/prompt/buildSystemPrompt';
const prompt = { mode: { type: 'mode', modeType: 'mandala', frameworkId: 'life-map', partTypes: ['mode', 'messages'], actionTypes: ['message', 'think', 'fill_cell', 'highlight_cell', 'create_arrow', 'set_metadata', 'get_metadata'] } };
const full = buildSystemPrompt(prompt, { withSchema: false });
console.log('Full prompt length:', full.length, 'chars');
console.log('Full prompt approx tokens:', Math.round(full.length / 4));
"
```

- [ ] **Step 3: Verify that the old `life-map-section.ts` content is fully replaced**

Read the new file and confirm:
- No references to `Emocional` or `Relacional`
- No references to `essencia` (should be `proposito`)
- No references to cell ID `flow` (should be `flex`)
- Contains `life design companion` (not "life design guide")
- Contains the health disclaimer

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup and integration verification"
```

---

## Implementation Notes

### Following the emotions map pattern
The emotions map (`emotions-map-section.ts`, 625 lines) is the reference implementation. Key patterns to replicate:
- One exported function with `(flags, sessionState?)` signature
- `buildBaseLayer(flags)` as the always-loaded foundation
- Registry pattern for loadable sections (`CONDITION_BUILDER_MAP` instead of `STEP_BUILDER_MAP`)
- `flagged()` helper for conditional sections
- `ALL_*_BUILDERS` array for full-prompt loading

### Key differences from emotions map
- **Region-based loading** instead of step-based (current ± 1)
- **Condition overlays** are additive layers, not mutually exclusive steps
- **Free mode** is a distinct layer, not just an alternative to guided
- **No `currentStep`** — life map uses `region` field instead

### Content to transcribe from spec
The spec at `docs/superpowers/specs/2026-03-13-life-map-system-prompt-design.md` contains the complete prompt text organized by layer. The implementation task is primarily transcription — converting the spec's markdown sections into TypeScript template literals, using `flagged()` for conditional blocks and `${...}` for interpolation.

### What this plan does NOT cover
- **Flippable notes UI** (frontend component work)
- **Bulk flip toggle** (frontend component work)
- **Customizable day segments UI** (frontend component work)
- **Time block input field** (frontend component work)
- **Tense metadata schema** (shared schema change — may be done alongside or separately)

These are UI features listed in the spec's Feature Dependencies. They enhance the prompt's concepts but are not required for the prompt itself to function.
