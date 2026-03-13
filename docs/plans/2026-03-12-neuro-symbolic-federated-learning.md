# Iris Neuro-Symbolic Federated Learning Architecture

**Date:** 2026-03-12
**Status:** Specification
**Scope:** End-to-end architecture for privacy-preserving neuro-symbolic AI training across Iris's distributed Mandala knowledge graphs

---

## Table of Contents

1. [Vision & Motivation](#1-vision--motivation)
2. [Glossary](#2-glossary)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [The Map as Knowledge Graph Schema](#4-the-map-as-knowledge-graph-schema)
5. [Prisma: Structural Intelligence Model](#5-prisma-structural-intelligence-model)
6. [Iris: Conversational Companion](#6-iris-conversational-companion)
7. [Federated Learning Protocol](#7-federated-learning-protocol)
8. [Encryption & Privacy Architecture](#8-encryption--privacy-architecture)
9. [Four-Layer Intelligence Improvement](#9-four-layer-intelligence-improvement)
10. [Platform Architecture: Atlas & Custom Maps](#10-platform-architecture-atlas--custom-maps)
11. [Technology Stack](#11-technology-stack)
12. [Implementation Phases](#12-implementation-phases)
13. [Research Foundations & References](#13-research-foundations--references)

---

## 1. Vision & Motivation

Iris is a platform for **Cognitive Mapping** — AI-assisted thinking sessions where users explore their inner world through structured Mandalas. Each Mandala is a visual knowledge graph grounded in empirical evidence from areas of knowledge such asCBT, Occupational Therapy, and others.

The core challenge: Iris handles deeply sensitive data (emotions, beliefs, behavioral patterns, life reflections, business decisions, etc.). Users must trust that their data is private. At the same time, the platform benefits from collective intelligence — patterns learned across thousands of users can make the AI dramatically better for everyone.

**This spec defines how Iris achieves both simultaneously** through:

- **Neuro-symbolic AI**: Mandala Maps provide the symbolic structure (cells, edges, empirical rules). A small neural model (Prisma) learns to map text onto this structure. The combination produces interpretable, evidence-grounded intelligence.
- **Federated Learning**: Prisma trains locally in each user's browser. Only encrypted model updates are shared. Raw data never leaves the device.
- **Homomorphic Encryption**: The aggregation server computes on encrypted updates without ever decrypting them. Privacy is enforced by mathematics, not policy.

The result: a platform where **the AI gets smarter from everyone's usage, but no one's data is ever visible to anyone — not even the platform operator.**

---

## 2. Glossary

### Product Terms

| Term        | Definition                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mandala** | The visual form — a circular sunburst visualization rendered on a tldraw canvas. One or more Mandalas can exist in a Space.                                                 |
| **Map**     | The function — a schema defining cells, edge types, empirical basis, and rules. Examples: Emotions Map (CBT-based), Life Map (OT-based). A Mandala is an instance of a Map. |
| **Space**   | A tldraw-sync room with a unique URL. A collaborative canvas that can contain multiple Mandalas. Maps to tldraw-sync's "room" concept.                                      |
| **Atlas**   | The registry/library of all published Maps. Users and AI agents can browse, create, and share Maps through the Atlas.                                                       |
| **Notes**   | Content the user creates inside cells. Nodes in the knowledge graph. Rendered as tldraw shapes.                                                                             |
| **Arrows**  | Directed connections between Notes. Edges in the knowledge graph. Each Arrow has a type defined by the Map's edge schema.                                                   |
| **Cells**   | Structural positions in a Map where Notes live. NOT emotions or topics — they are structural containers (e.g., `present-beliefs`, `past-events`, `profissional-querer`).    |

### AI Terms

| Term       | Definition                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prisma** | The structural intelligence model. A small neural network (MiniLM encoder + LoRA adapter + anchor projection + edge predictor) that runs in the browser. Classifies Notes into Cells, predicts Arrows between Notes, and detects patterns in the knowledge graph. Named for a prism that breaks light into its spectrum — it reveals the structure within content. Trained via Federated Learning. |
| **Iris**   | The conversational AI companion. The LLM-powered agent the user talks to during a Cognitive Mapping Session. Helps focus the user's awareness into each Cell to see it with clarity. Powered by the user's choice of LLM (Claude, GPT, Llama, etc.) and enhanced by Prisma's structural context. Named for the part of the eye that focuses light.                                                 |

### Session Terms

| Term                     | Usage                                                    |
| ------------------------ | -------------------------------------------------------- |
| **Cognitive Mapping**    | Technical/professional description of what the user does |
| **AI-assisted thinking** | Plain language explanation                               |
| **Yinflow Session**      | Brand-specific product term for a in itself              |
| **Mental Cartography**   | Marketing, landing pages, press materials                |

---

## 3. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER'S BROWSER                                                     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  Space (tldraw-sync room)                                │      │
│  │                                                          │      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │      │
│  │  │  Mandala #1  │  │  Mandala #2  │  │  Mandala #3  │  │      │
│  │  │  (Emotions   │  │  (Life Map)  │  │  (Custom)    │  │      │
│  │  │   Map)       │  │              │  │              │  │      │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │      │
│  │         │                 │                 │          │      │
│  │  ┌──────┴───────┐  ┌─────┴────────┐  ┌─────┴────────┐  │      │
│  │  │ Prisma Head  │  │ Prisma Head  │  │ Prisma Head  │  │      │
│  │  │ emotions-map │  │ life-map     │  │ custom-X     │  │      │
│  │  │ (~150KB)     │  │ (~200KB)     │  │ (~100-300KB) │  │      │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │      │
│  │         └─────────────────┼─────────────────┘          │      │
│  │                           │                             │      │
│  │                  ┌────────┴────────┐                    │      │
│  │                  │ Prisma Encoder  │                    │      │
│  │                  │ (shared, 22MB)  │                    │      │
│  │                  │ MiniLM + LoRA   │                    │      │
│  │                  └────────┬────────┘                    │      │
│  │                           │                             │      │
│  │                  ┌────────┴────────┐                    │      │
│  │                  │ FL Client       │                    │      │
│  │                  │ (background)    │                    │      │
│  │                  │ Train → encrypt │                    │      │
│  │                  │ → upload deltas │                    │      │
│  │                  └────────┬────────┘                    │      │
│  └───────────────────────────┼──────────────────────────────┘      │
│                              │                                      │
│  ┌───────────────────────────┼──────────────────────────────┐      │
│  │  Iris (Conversational)    │                               │      │
│  │                           │ symbolic context              │      │
│  │  System prompt enriched   │                               │      │
│  │  with Prisma's output  ←──┘                               │      │
│  │  + Map's empirical basis                                  │      │
│  │  + graph patterns                                         │      │
│  │                                                           │      │
│  │  → API call to user's chosen LLM                          │      │
│  │    (Claude / GPT / Llama / Ollama / Workers AI)           │      │
│  └───────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE EDGE                                                    │
│                                                                     │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────┐        │
│  │  User DO     │  │  Aggregation DO   │  │  R2          │        │
│  │  (per-space  │  │  (per-Map)        │  │  (model      │        │
│  │   storage)   │  │                   │  │   checkpts)  │        │
│  │              │  │  FedAvg on CKKS-  │  │              │        │
│  │  Mandala     │  │  encrypted deltas │  │  Encrypted   │        │
│  │  state,      │  │                   │  │  Prisma      │        │
│  │  notes,      │  │  NEVER decrypts.  │  │  weights     │        │
│  │  arrows      │  │  Has no keys.     │  │  per round   │        │
│  └──────────────┘  └───────────────────┘  └──────────────┘        │
│                                                                     │
│  ┌──────────────┐  ┌───────────────────┐                           │
│  │  D1          │  │  Vectorize        │                           │
│  │  (accounts,  │  │  (anchor          │                           │
│  │   Map meta,  │  │   embeddings,     │                           │
│  │   Atlas)     │  │   semantic        │                           │
│  │              │  │   search)         │                           │
│  └──────────────┘  └───────────────────┘                           │
│                                                                     │
│  ┌──────────────┐                                                   │
│  │  Workers AI  │                                                   │
│  │  (fallback   │                                                   │
│  │   embeddings │                                                   │
│  │   + LoRA     │                                                   │
│  │   inference) │                                                   │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. The Map as Knowledge Graph Schema

Each Map defines a **formal knowledge graph schema** grounded in empirical evidence. The Map is not just a visual layout — it is an ontology that constrains what Prisma can learn and what Iris can reason about.

### 4.1 Map Definition Structure

```typescript
interface MapDefinition {
  id: string; // 'emotions-map'
  name: string; // 'Emotions Map'
  description: string;

  // Tree structure defining cells
  root: TreeNodeDef; // Hierarchy of cells

  // Knowledge graph edge schema
  edgeTypes: EdgeTypeDef[]; // Valid relationship types between Notes

  // Visual configuration
  visual: FrameworkVisualConfig;

  // Platform metadata
  template: FrameworkTemplateConfig;

  // Radial layout overrides
  startAngle?: number;
  radialBands?: RadialBandsConfig;
  overlayRing?: OverlayRingConfig;
}

interface EdgeTypeDef {
  id: string; // 'triggers'
  label: string; // 'triggers'
  fromCells: string[]; // Valid source cells: ['past-events']
  toCells: string[]; // Valid target cells: ['past-thoughts-emotions']
  empiricalBasis: string; // Clinical/theoretical grounding
  bidirectional?: boolean; // Default: false (directed)
  suggestWhen?: string; // Hint for Iris: when to suggest this Arrow
}
```

### 4.2 Emotions Map — Complete Cell & Edge Schema

**Grounded in:** Beck's Cognitive Behavioral Therapy (1979), specifically the Dysfunctional Thought Record (DTR) technique. The DTR is a structured worksheet used in CBT to help patients identify and challenge negative automatic thoughts by examining situations, emotions, thoughts, evidence, and alternative perspectives.

**Cells (7):**

| Cell ID                  | Label               | Radial Position      | Purpose                                             |
| ------------------------ | ------------------- | -------------------- | --------------------------------------------------- |
| `evidence`               | Evidence            | Center (root)        | Objective facts supporting or contradicting beliefs |
| `past-thoughts-emotions` | Thoughts & Emotions | Past / Inner ring    | Past cognitive patterns and emotional responses     |
| `past-events`            | Events              | Past / Outer ring    | Concrete past events and situations                 |
| `present-beliefs`        | Beliefs             | Present / Inner ring | Current core beliefs about self and situation       |
| `present-behaviors`      | Behaviors           | Present / Outer ring | Current behavioral patterns and responses           |
| `future-beliefs`         | Beliefs             | Future / Inner ring  | Desired/emerging restructured beliefs               |
| `future-events`          | Events              | Future / Outer ring  | Anticipated changes and planned actions             |

**Edge Types (9):**

| Edge ID        | From Cell              | To Cell                         | Empirical Basis                                                                                         |
| -------------- | ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `triggers`     | past-events            | past-thoughts-emotions          | CBT: Activating events trigger automatic thoughts and emotional responses (Beck, 1979)                  |
| `shapes`       | past-thoughts-emotions | present-beliefs                 | CBT: Repeated automatic thoughts crystallize into core beliefs (Beck, 1979; Young, 1990)                |
| `drives`       | present-beliefs        | present-behaviors               | CBT: Core beliefs activate compensatory behavioral strategies (Beck, 2011)                              |
| `supports`     | evidence               | present-beliefs, future-beliefs | CBT: Evidence evaluation is central to cognitive restructuring (Burns, 1980)                            |
| `contradicts`  | evidence               | present-beliefs, future-beliefs | CBT: Disconfirming evidence challenges maladaptive beliefs (Padesky, 1994)                              |
| `evolves-into` | present-beliefs        | future-beliefs                  | CBT: Cognitive restructuring transforms maladaptive beliefs into adaptive alternatives (Beck, 2011)     |
| `motivates`    | future-beliefs         | future-events                   | CBT: Behavioral experiments and action plans flow from restructured beliefs (Bennett-Levy et al., 2004) |
| `echoes`       | past-events            | future-events                   | CBT: Past experiences inform future expectations, goals, and avoidance patterns (Ehlers & Clark, 2000)  |
| `reinforces`   | present-behaviors      | present-beliefs                 | CBT: Behavioral patterns maintain or modify belief systems through feedback loops (Salkovskis, 1991)    |

**Metadata schemas per cell** (from existing code):

- `evidence`: `{ direction: string, linked_belief_id: string }`
- `present-beliefs`: `{ belief_level, strength_before, strength_after, associated_emotion, associated_emotion_intensity, distortion }`
- `present-behaviors`: `{ behavior_type: string }`
- `past-thoughts-emotions`: `{ kind, intensity_before, intensity_after, linked_event_id, distortion }`
- `past-events`: `{ trigger_type, is_primary }`
- `future-beliefs`: `{ strength, linked_old_belief_id }`
- `future-events`: `{ action_type, linked_belief_id }`

### 4.3 Life Map — Complete Cell & Edge Schema

**Grounded in:** Model of Human Occupation (MOHO) by Gary Kielhofner (1980, 2008), an occupational therapy framework. MOHO conceptualizes human occupation through volition (motivation), habituation (patterns), and performance capacity, across life domains. The four-ring structure (Querer/Ser/Ter/Saber) maps to MOHO's layers of occupational engagement.

**Domain Cells (25):**

Center: `essencia` (Essence — the core self that anchors all domains)

Six domains, each with four rings:

| Domain       | Querer (want/desire)  | Ser (being/identity) | Ter (having/resources) | Saber (knowing/wisdom) |
| ------------ | --------------------- | -------------------- | ---------------------- | ---------------------- |
| Espiritual   | `espiritual-querer`   | `espiritual-ser`     | `espiritual-ter`       | `espiritual-saber`     |
| Mental       | `mental-querer`       | `mental-ser`         | `mental-ter`           | `mental-saber`         |
| Fisico       | `fisico-querer`       | `fisico-ser`         | `fisico-ter`           | `fisico-saber`         |
| Material     | `material-querer`     | `material-ser`       | `material-ter`         | `material-saber`       |
| Profissional | `profissional-querer` | `profissional-ser`   | `profissional-ter`     | `profissional-saber`   |
| Pessoal      | `pessoal-querer`      | `pessoal-ser`        | `pessoal-ter`          | `pessoal-saber`        |

**Temporal cells (top half):** Flow + 7 weekdays, each with dawn/morning/afternoon/night segments, week slots, month slots, plus 10 seven-year life phase overlay blocks.

**Edge Types (within-domain):**

| Edge ID      | From Ring | To Ring    | Empirical Basis                                                                                    |
| ------------ | --------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `shapes`     | querer    | ser        | MOHO: Volition (desire/motivation) shapes occupational identity (Kielhofner, 2008)                 |
| `determines` | ser       | ter        | MOHO: Occupational identity determines what one accumulates and maintains (Christiansen, 1999)     |
| `enables`    | ter       | saber      | MOHO: Environmental resources and capacities enable knowledge acquisition (Kielhofner, 2008)       |
| `informs`    | saber     | querer     | MOHO: Occupational competence and reflection inform deeper volitional awareness (Kielhofner, 2008) |
| `grounds`    | essencia  | any querer | MOHO: Personal causation — core sense of self anchors motivation across domains (Kielhofner, 2008) |

**Edge Types (cross-domain):**

| Edge ID          | From            | To              | Empirical Basis                                                                                |
| ---------------- | --------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `depends-on`     | domain-X-ring   | domain-Y-ring   | OT: Occupational balance requires interdependence across life areas (Wilcock, 2006)            |
| `conflicts-with` | domain-X-ring   | domain-Y-ring   | OT: Role conflicts and occupational imbalance (Backman, 2004)                                  |
| `planned-in`     | any domain cell | temporal cell   | OT: Occupational engagement is structured through temporal organization (Larson & Zemke, 2003) |
| `reflects`       | temporal cell   | any domain cell | OT: Daily routines reflect underlying values and occupational patterns (Clark et al., 1991)    |

### 4.4 Why the Map-as-Schema Matters for AI

The Map provides what most neuro-symbolic AI systems must build manually: **a formally defined ontology grounded in real-world evidence**. This has three consequences:

1. **Prisma's output space is constrained.** It classifies into a known set of Cells and predicts from a known set of Edge Types. This keeps the model small, interpretable, and fast.

2. **Iris's reasoning is grounded.** When Iris suggests a connection between Notes, it's not hallucinating — it's following evidence-grounded relationship types defined in the Map, which may be clinical (if it's health related) or not.

3. **New Maps extend the system.** When a user or AI agent creates a new Map in the Atlas, they define the ontology. Prisma and Iris automatically adapt to it.

---

## 5. Prisma: Structural Intelligence Model

Prisma is a lightweight neuro-symbolic model that runs entirely in the user's browser. It performs three tasks:

1. **Cell Classification**: Given a Note's text, predict which Cell it belongs in
2. **Arrow Prediction**: Given two Notes, predict whether an Arrow should connect them and what type
3. **Pattern Detection**: Identify meaningful patterns based on real-world evidence (clinical or not) in the Mandala's knowledge graph

### 5.1 Architecture

```
LAYER 1: Text Encoder (shared across all Maps)
──────────────────────────────────────────────────
Model:       all-MiniLM-L6-v2 (Sentence-BERT family)
Parameters:  22M (frozen base) + ~36KB LoRA-B adapter (trainable)
Input:       Text string (Note content)
Output:      384-dimensional dense embedding vector
Runtime:     ONNX Runtime Web (WASM backend) in browser
LoRA:        FFA-LoRA variant — freeze randomly-initialized A matrix,
             train only zero-initialized B matrix. Halves communication
             cost and improves DP stability. [Wang et al., ICLR 2024]

LAYER 2: Cell Classification (per-Map head)
──────────────────────────────────────────────────
Architecture:
  Projection:    Linear(384 → 128) + ReLU + Linear(128 → 384)
  Cell Anchors:  One 384-dim learned embedding per Cell in the Map
  Scoring:       Cosine similarity between projected embedding and each anchor

  Emotions Map:  7 anchors  (7 × 384 = 2,688 floats, ~10.5KB)
  Life Map:      25 anchors (25 × 384 = 9,600 floats, ~37.5KB)

Training:    Margin-enhanced contrastive loss (per FedSA [AAAI 2025])
             Pull Note embeddings toward correct Cell anchor
             Push away from incorrect Cell anchors

Output:      { cellId, confidence, top3Cells }
Trainable:   Projection (~99K params) + anchors (~10-38K) ≈ ~110-137K params

LAYER 3: Arrow Prediction (per-Map head)
──────────────────────────────────────────────────
Architecture:
  Edge Embeddings:  One learned vector per EdgeTypeDef in the Map
  Scoring:          Bilinear: score(note_a, note_b, edge_type) =
                    embed_a^T · W_edge · embed_b
  Constraint:       Only score Edge Types where fromCells contains note_a's Cell
                    AND toCells contains note_b's Cell (schema enforcement)

  Emotions Map:  9 edge types → 9 scoring matrices (9 × 384 = 3,456 floats)
  Life Map:      9 edge types → 9 scoring matrices

Training:    Binary cross-entropy on (note_a, note_b, edge_type) triples
             Positive: user-confirmed Arrows
             Negative: random pairs within valid schema constraints

Output:      { fromNoteId, toNoteId, edgeType, confidence }
Trainable:   ~3.5K-35K params (depending on scoring architecture)

LAYER 4: Symbolic Reasoning (pure TypeScript, zero training)
──────────────────────────────────────────────────
Input:       Cell classifications + Arrow predictions + Mandala state
Rules:       Derived from Map definition (empirical basis)

Operations:
  - Chain detection: find complete CBT thought record chains
    (past-events → triggers → past-thoughts-emotions → shapes →
     present-beliefs → drives → present-behaviors)
  - Gap analysis: identify missing links in the graph
    (present-beliefs with no Evidence Arrows → suggest evidence exploration)
  - Pattern detection: recurring themes across Cells
    (multiple Notes in same Cell with similar metadata → pattern)
  - Coverage analysis: which Cells are empty, underdeveloped
  - Cross-Mandala patterns: connections across Maps in same Space

Output:      SymbolicContext object for Iris's system prompt
```

### 5.2 Model Size Summary

| Component                    | Parameters | Size           | Loaded                     |
| ---------------------------- | ---------- | -------------- | -------------------------- |
| MiniLM base encoder (frozen) | 22M        | ~22MB          | Once per browser session   |
| LoRA-B adapter (shared)      | ~9.2K      | ~36KB          | Once, updated per FL round |
| Projection head (per-Map)    | ~99K       | ~387KB         | Per Mandala                |
| Cell anchors (per-Map)       | 2.7-9.6K   | ~10-38KB       | Per Mandala                |
| Edge predictor (per-Map)     | 3.5-35K    | ~14-137KB      | Per Mandala                |
| **Total per Mandala**        | —          | **~410-560KB** | On demand                  |
| **Total in browser**         | —          | **~22.5MB**    | Mostly cached              |

Inference latency: **~3-8ms per Note** (ONNX WASM on modern hardware).

### 5.3 Cold Start for New Maps

When a new Map is created (by a user or AI agent via the Atlas), Prisma works immediately without any FL training:

1. Generate initial Cell anchors by embedding each Cell's `label + question + guidance + examples` using the shared encoder
2. Initialize Edge predictor weights randomly (constrained by schema — only valid edges scored)
3. Prisma performs Cell classification using cosine similarity to initial anchors
4. Quality improves as the user creates Notes and local training refines the head
5. Once enough users adopt the Map (≥ K threshold), FL rounds begin

---

## 6. Iris: Conversational Companion

Iris is the conversational AI the user interacts with during a Cognitive Mapping Session. It is powered by any LLM the user chooses (BYOM — Bring Your Own Model) and enhanced by Prisma's structural context.

### 6.1 BYOM Architecture

```typescript
interface LLMConfig {
  provider:
    | "anthropic"
    | "openai"
    | "google"
    | "workers-ai"
    | "ollama"
    | "custom";
  apiKey?: string; // User's own API key (encrypted in DO, never logged)
  baseUrl?: string; // For custom/Ollama endpoints
  model?: string; // Specific model name
  via?: "direct" | "proxy"; // Direct API or through Iris's Worker proxy
}
```

**Supported providers:**

| Provider   | Models                         | Access method                             |
| ---------- | ------------------------------ | ----------------------------------------- |
| Anthropic  | Claude Sonnet, Opus            | User's API key or Iris subscription proxy |
| OpenAI     | GPT-4o, o1                     | User's API key                            |
| Google     | Gemini Pro, Ultra              | User's API key                            |
| Workers AI | Llama, Mistral (open-source)   | Free tier via Cloudflare                  |
| Ollama     | Any local model                | User runs locally, maximum privacy        |
| Custom     | Any OpenAI-compatible endpoint | User provides base URL                    |

### 6.2 How Prisma Enhances Iris

Prisma's output is injected into Iris's system prompt as structured context. This makes any LLM better at understanding the user's Mandala without fine-tuning:

```typescript
interface SymbolicContext {
  // Current Note classification
  currentNote?: {
    cellId: string;
    cellLabel: string;
    confidence: number;
    alternativeCells: Array<{ cellId: string; confidence: number }>;
  };

  // Graph neighborhood
  connectedNotes: Array<{
    noteId: string;
    cellId: string;
    edgeType: string;
    direction: "incoming" | "outgoing";
    notePreview: string; // First 50 chars
  }>;

  // Detected patterns
  patterns: Array<{
    type: "complete-chain" | "gap" | "cluster" | "coverage";
    description: string;
    involvedCells: string[];
    clinicalBasis: string; // From Map's edgeType.empiricalBasis
  }>;

  // Map context
  mapId: string;
  cellDescriptions: Record<string, string>; // Cell question/guidance
  validEdgeTypes: EdgeTypeDef[]; // For Iris to suggest Arrows

  // Mandala state
  cellNoteCounts: Record<string, number>;
  emptyCells: string[];
  totalNotes: number;
  totalArrows: number;
}
```

**Example system prompt injection:**

```
You are Iris, a companion for Cognitive Mapping. You help the user
focus their awareness into each area of their Mandala to see it clearly.

CURRENT MANDALA: Emotions Map
The user is working in: Present / Beliefs
  Cell question: "What do you currently believe about yourself and this situation?"
  Cell guidance: "Explore how beliefs may have evolved. Notice any cognitive dissonance."

PRISMA CONTEXT:
- Current Note classified as: present-beliefs (confidence: 0.84)
  Also considered: future-beliefs (0.42)
- Connected Notes:
  ← "shapes" from past-thoughts-emotions: "I always felt I wasn't good en..."
  → "drives" to present-behaviors: "I tend to overwork to prove m..."
- Patterns detected:
  - COMPLETE CHAIN: past-events("I lost my job") → triggers →
    past-thoughts-emotions("I felt not good enough") → shapes →
    present-beliefs(CURRENT) → drives → present-behaviors("overwork to prove")
    Clinical basis: CBT thought record chain identified
  - GAP: present-beliefs has no "supports" or "contradicts" Arrows from evidence
    Clinical basis: Evidence evaluation is central to cognitive restructuring
- Empty cells: future-events, future-beliefs
- 8 Notes total, 5 Arrows

Use this context to guide the conversation. Do not mention Prisma,
Cells, or Arrows directly — translate insights into natural language.
When appropriate, gently suggest the user explore evidence for their
beliefs or consider what future beliefs might look like.
```

### 6.3 Iris Does NOT Require Prisma

Iris works without Prisma — it's just less contextually aware. This is important for:

- First-time users before Prisma has loaded
- Custom Maps before any FL training
- Users who disable Prisma for privacy
- Fallback if ONNX WASM fails on a device

Without Prisma, Iris still receives the Map's Cell descriptions and the user's Note text. It just doesn't get the automated classification, Arrow predictions, or pattern detection.

---

## 7. Federated Learning Protocol

### 7.1 FL Round Types

Prisma's architecture has a shared encoder and per-Map heads. FL training is segmented accordingly:

**Global Encoder Rounds** — improve text understanding across all Maps:

- Participants: all consenting users, regardless of which Map they use
- What's trained: LoRA-B adapter weights on the shared MiniLM encoder
- Aggregation: one global Aggregation DO
- Benefit: text understanding improves for everyone

**Per-Map Head Rounds** — improve Cell classification and Arrow prediction for a specific Map:

- Participants: only users of that specific Map
- What's trained: projection head + Cell anchors + Edge predictor
- Aggregation: one Aggregation DO per Map
- Minimum participants per round: K (configurable, e.g., 10)
- New Maps with few users: use initial anchors from cold start (Section 5.3)

### 7.2 Training Round Protocol

```
ROUND N (for a specific Map or global encoder):

1. BROADCAST
   Aggregation DO publishes to R2:
   - Current global weights (CKKS-encrypted aggregate from round N-1)
   - Round metadata: { roundId, mapId, minClients, deadline, roundKey }

2. CLIENT PULL
   Browser checks for new round (periodic poll or WebSocket notification):
   - Downloads encrypted aggregate (~2MB for encoder, ~200KB for head)
   - Decrypts locally using round key from key agreement protocol
   - Applies weights to local Prisma model

3. LOCAL TRAINING
   For each Note in user's Mandala(s) using this Map:
   a. Forward pass: text → encoder → embedding → classification loss + edge loss
   b. Classification loss: contrastive (pull toward correct Cell anchor, push from others)
   c. Edge loss: binary cross-entropy on user-confirmed Arrows
   d. Backpropagate through LoRA-B (encoder) and head layers
   e. Repeat for 5-50 local steps (adaptive based on data size)

   Training happens in a Web Worker (background thread)
   Does not block UI or Mandala interaction

4. PREPARE UPDATE
   a. Compute delta: new_weights - received_weights
   b. Clip gradient norm (per-parameter clipping, calibrated for DP budget)
   c. Add calibrated Gaussian noise (ε-differential privacy)
   d. Encrypt ALL values using CKKS homomorphic encryption
      - Pack ~4,096 floats per CKKS ciphertext
      - Total: ~7-30 ciphertext objects
      - Encryption time: ~1-3 seconds (Web Worker, parallel)

5. UPLOAD
   Send encrypted delta to Aggregation DO:
   - Payload: CKKS ciphertexts (~2-7MB)
   - Metadata: { roundId, clientId (anonymous), numSamples }
   - Over TLS (encrypted in transit + encrypted payload)

6. AGGREGATION (Aggregation DO)
   a. Collect encrypted deltas from ≥ K clients
   b. Byzantine defense:
      - Cannot inspect individual deltas (encrypted)
      - Use metadata-based heuristics (e.g., reject if numSamples = 0)
      - Apply Krum filter on ciphertext norms (computable on encrypted data)
   c. Homomorphic aggregation:
      CKKS.add(enc_delta_1, enc_delta_2, ..., enc_delta_K) / K
      Result: encrypted aggregate (still CKKS ciphertext)
      THE AGGREGATION DO NEVER DECRYPTS. IT HAS NO KEYS.
   d. Store encrypted aggregate to R2
   e. Increment round counter
   f. Notify clients: new round available

7. CLIENT RECEIVES (next round or next session)
   a. Download encrypted aggregate
   b. Decrypt locally using round key
   c. Apply to Prisma model
   d. Prisma is now improved with collective intelligence
```

### 7.3 What's Transmitted Per Round Per Client

```
Encoder LoRA-B delta (FFA-LoRA, rank 4):
  384 × 4 × 6 layers = 9,216 floats        ~36KB plaintext
  CKKS packed: ~3 ciphertext objects         ~800KB encrypted

Per-Map head delta:
  Projection: ~99K floats                    ~387KB plaintext
  Anchors: 2.7-9.6K floats                  ~10-38KB plaintext
  Edge predictor: 3.5-35K floats            ~14-137KB plaintext
  CKKS packed: ~25-35 ciphertext objects     ~1.5-2MB encrypted

Total per client per round:                  ~2-3MB encrypted
Compare to full model sync:                  ~22MB
Reduction:                                   ~8-11x
```

### 7.4 Participation Model

| User tier       | Default participation               | Can change          |
| --------------- | ----------------------------------- | ------------------- |
| Free            | Opted in (nudged consent at signup) | Can opt out anytime |
| Paid            | Opted out                           | Can opt in          |
| EU users (GDPR) | Explicit opt-in required            | —                   |

Consent UI at signup (for non-EU free tier):

```
┌─────────────────────────────────────────────────┐
│  Help improve Iris for everyone                 │
│                                                 │
│  Your Prisma model learns locally and shares    │
│  only encrypted improvements — never your       │
│  words, never your reflections.                 │
│                                                 │
│  [✦ Contribute encrypted improvements]          │
│  [ ] Keep everything on my device               │
│                                                 │
│  Change anytime in Settings.                    │
└─────────────────────────────────────────────────┘
```

---

## 8. Encryption & Privacy Architecture

### 8.1 Defense Stack (7 Layers)

| Layer | Technique                       | What it prevents                                        | Phase   |
| ----- | ------------------------------- | ------------------------------------------------------- | ------- |
| 1     | **Durable Object isolation**    | Data physically separated per-Space                     | Phase 1 |
| 2     | **Map-constrained model**       | Tiny attack surface (7-25 Cell anchors per Map)         | Phase 2 |
| 3     | **FFA-LoRA**                    | Only B matrix trained — halves exposed parameters       | Phase 3 |
| 4     | **Differential privacy**        | Calibrated noise bounds information leakage per update  | Phase 4 |
| 5     | **CKKS homomorphic encryption** | Aggregator cannot see individual updates                | Phase 4 |
| 6     | **No selective encryption**     | All parameters encrypted, no sensitivity judgment calls | Phase 4 |
| 7     | **E2EE at rest**                | Stored data encrypted with user-held keys               | Phase 5 |

Layers 4 and 5 are **defense in depth**: even if CKKS is somehow broken, DP noise still protects. Even if DP noise is somehow stripped, CKKS still protects. An attacker would need to break both simultaneously.

### 8.2 CKKS Homomorphic Encryption

**Why CKKS (not Paillier or TFHE):**

CKKS (Cheon-Kim-Kim-Song, 2017) is designed for approximate arithmetic on floating-point vectors — exactly what FL model updates are. It supports **batched encryption** (thousands of floats per ciphertext), making it far more efficient than Paillier (one integer per ciphertext) for our use case.

| Property                  | Paillier         | TFHE            | CKKS                                |
| ------------------------- | ---------------- | --------------- | ----------------------------------- |
| Arithmetic type           | Integer only     | Boolean/integer | Approximate float                   |
| Batching                  | No               | No              | Yes (4096+ values)                  |
| Addition                  | Yes              | Yes             | Yes                                 |
| Multiplication            | No               | Yes             | Yes (limited depth)                 |
| Speed for FL aggregation  | Slow (per-value) | Overkill        | Fast (batched)                      |
| Ciphertext size per value | ~256 bytes       | ~2KB            | ~0.5 bytes (amortized via batching) |

For Iris, FedAvg requires only homomorphic addition. CKKS provides this with minimal overhead via batching.

**Available implementations:**

- [OpenFHE](https://openfhe.org/) — C++ with WASM compilation, mature, well-documented (Polyakov et al., 2022)
- [Concrete (Zama)](https://github.com/zama-ai/concrete-ml) — Rust with WASM API, has ML-specific tooling (Chillotti et al., 2020)
- [he-toolkit (Intel)](https://github.com/intel/he-toolkit) — reference implementations

**Performance characteristics for Iris:**

```
Prisma head weights: ~135K floats
CKKS slot count: 4,096
Ciphertext objects needed: ceil(135,000 / 4,096) ≈ 33 ciphertexts

Encryption time (browser, WASM):     ~1-3 seconds
Homomorphic addition (33 objects):   <10ms
Decryption time (browser, WASM):     ~1-2 seconds
Ciphertext total size:               ~2MB

Overhead vs. plaintext: ~20% computation, ~4x bandwidth
Reference: NVIDIA Clara Train 4.0 benchmarks show ~20% overhead for HE in FL
```

### 8.3 Key Management

Each FL round uses a **threshold key agreement protocol** where:

1. At round start, participating clients perform a distributed key generation (e.g., N-out-of-K threshold scheme)
2. The shared public key encrypts all updates
3. The aggregation DO performs homomorphic addition on ciphertexts
4. The shared secret key is reconstructed client-side to decrypt the aggregate
5. The aggregation DO never possesses any secret key material

For simplicity in early phases, a per-round key pair can be generated by a designated client or via a key server separate from the aggregation DO. The aggregation DO holds only the public key.

### 8.4 End-to-End Encryption at Rest (Phase 5)

For data stored in Durable Objects (Notes, Arrows, Mandala state):

```
User's password → PBKDF2 (600K iterations, SHA-256) → AES-256-GCM key

All Note content and Arrow metadata encrypted before storage in DO SQLite.
DO stores only ciphertext. Worker code cannot read content.

Password change → re-encrypt all stored data.
Password lost → data unrecoverable (by design).

Web Crypto API (SubtleCrypto) available in both browser and Workers runtime.
```

### 8.5 Privacy Comparison

| Approach                     | What it protects against               | Who uses it  |
| ---------------------------- | -------------------------------------- | ------------ |
| "No admin endpoint" (policy) | Casual browsing by developers          | Most SaaS    |
| DO isolation (architectural) | Cross-user data access                 | Iris Phase 1 |
| FL (data stays local)        | Data leaving the device                | Iris Phase 4 |
| FL + Differential Privacy    | Information leakage from model updates | Iris Phase 4 |
| FL + DP + CKKS Encryption    | Aggregator seeing individual updates   | Iris Phase 4 |
| E2EE at rest                 | Stored data readable by operator       | Iris Phase 5 |

**Iris's combined stack is stronger than Signal** (E2EE for transit/storage) because it also protects data **during computation** via homomorphic encryption.

---

## 9. Four-Layer Intelligence Improvement

Iris (the conversational companion) gets smarter over time through four complementary layers. Layers 1-3 work with **any LLM** (Claude, GPT, etc.). Layer 4 is optional and requires an open-source model.

### 9.1 Layer 1: Context Engineering (Phase 1)

**What**: Prisma classifies Notes, predicts Arrows, and detects patterns. These are injected as structured context into Iris's system prompt.

**How it improves over time**: As Prisma's FL training improves Cell classification accuracy and Arrow prediction, the context Iris receives becomes more accurate and richer.

**Why it works**: [Anthropic's context engineering research (2025)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) demonstrates that "intelligence is not the bottleneck — context is." Structured context outperforms fine-tuning for most conversational quality improvements.

**Works with**: Any LLM. No fine-tuning needed.

### 9.2 Layer 2: RAG from Mandala History (Phase 2)

**What**: Before each Iris response, retrieve the most relevant past Notes, Arrows, and conversations from the user's Mandala history using semantic search.

**How it works**:

```
1. User writes a message
2. Embed message using Prisma's encoder (shared with Cell classification)
3. Search Vectorize (or browser-local index) for similar past Notes
4. Retrieve top-K relevant Notes with their Cell positions and Arrow connections
5. Include as context: "3 weeks ago you explored a similar theme in Past/Events..."
```

**Why it works**: RAG grounds Iris's responses in the user's actual history, not just the current session. This creates continuity across Cognitive Mapping Sessions.

**Works with**: Any LLM. Uses Prisma's embeddings for retrieval.

### 9.3 Layer 3: Distilled Symbolic Rules (Phase 3)

**What**: Patterns learned by Prisma across all users (via FL) are extracted as symbolic rules and injected into Iris's context.

**How it works**:

```
FL training reveals aggregate patterns in Prisma's trained anchors and
Edge predictor weights. These are distilled into rules:

Example: across 1000 Emotions Map users, Prisma learned that Notes
classified as present-beliefs with high confidence AND no incoming
"supports" or "contradicts" Arrows from evidence tend to co-occur
with high `associated_emotion_intensity` metadata values.

Distilled rule:
  IF cell == 'present-beliefs'
  AND no_evidence_arrows(note)
  AND metadata.associated_emotion_intensity > 7
  THEN suggest: "This belief feels strongly held but hasn't been
  examined against evidence yet. This is a common pattern — would
  you like to explore what evidence might relate to this belief?"

  Clinical basis: CBT evidence evaluation (Burns, 1980)
```

**Why it works**: The collective intelligence is encoded as **interpretable rules**, not opaque model weights. Clinicians can review, validate, and modify these rules. The rules are derived from encrypted FL aggregates — no individual's data is visible.

**Works with**: Any LLM. Rules go into the system prompt as additional context.

### 9.4 Layer 4: Federated LoRA Fine-Tuning of Open-Source LLM (Phase 4, Optional)

**What**: For users who choose an open-source model as their Iris (Llama, Mistral), train a LoRA adapter via FL to make the conversational model genuinely better at Cognitive Mapping.

**How it works**:

- Base model: e.g., Llama-3.1-8B or Mistral-7B
- LoRA adapter trained locally on the user's conversations + Prisma's context
- FL aggregates LoRA adapters across users (same CKKS-encrypted pipeline)
- Personal LoRA captures individual style; global LoRA captures general patterns
- Inspired by [FedALT (2025)](https://arxiv.org/abs/2503.11880): personal + "Rest-of-World" LoRA components with adaptive mixing

**Limitations**:

- Only works with open-source models (cannot fine-tune Claude/GPT via API)
- Training requires more compute than Prisma (may need GPU service, not browser-only)
- Inference of fine-tuned model needs hosting (Cloudflare Workers AI supports LoRA inference)

**Works with**: Open-source models only. Complementary to Layers 1-3.

---

## 10. Platform Architecture: Atlas & Custom Maps

### 10.1 Atlas: The Map Registry

The Atlas is a searchable library of Maps that users and AI agents can browse, create, and share. It is stored in Cloudflare D1 (relational database for metadata) and R2 (for Map definition files).

```typescript
interface AtlasEntry {
  id: string;
  mapDefinition: MapDefinition; // Full Map schema (cells, edges, rules)

  creator: {
    type: "human" | "ai-agent" | "collaboration";
    userId: string;
    displayName: string;
    credentials?: string; // For clinician-created Maps
  };

  empiricalBasis: {
    primarySource: string; // "Dysfunctional Thought Record (Beck, 1979)"
    references: Citation[]; // Academic citations
    evidenceLevel:
      | "clinical-trial"
      | "clinical-practice"
      | "theoretical"
      | "experiential"
      | "community";
    reviewedBy?: ReviewerInfo[]; // Clinician reviews
  };

  visibility: "private" | "unlisted" | "published";
  reviewStatus:
    | "draft"
    | "community-reviewed"
    | "clinician-reviewed"
    | "verified";

  stats: {
    totalUsers: number;
    totalMandalas: number;
    avgSessionDuration: number; // Aggregate, anonymized
    prismaAccuracy?: number; // FL-trained model quality metric
    flRoundsCompleted: number;
  };

  tags: string[]; // Searchable categories
  locales: string[]; // Supported languages
}
```

### 10.2 Map Creation by Users

Users create Maps through a Map Builder interface (future implementation):

1. Define Cells (hierarchy, labels, questions, guidance, examples)
2. Define Edge Types (fromCells, toCells, labels, empirical basis)
3. Optionally link empirical basis (citations, clinical framework references)
4. Preview the Mandala visualization
5. Publish to Atlas (private, unlisted, or public)

### 10.3 Map Creation by AI Agents

AI agents can propose Maps based on:

- Established clinical frameworks (DBT, ACT, IFS, Solution-Focused Therapy, etc.)
- User requests ("create a Map for processing grief")
- Academic literature (agent searches for evidence basis)

AI-generated Maps are marked with `creator.type: 'ai-agent'` and start at `reviewStatus: 'draft'`. They require human review (community or clinician) before reaching `published` status.

### 10.4 Prisma Model Lifecycle for New Maps

```
Map Created
  └─→ Initial anchors generated (cold start, Section 5.3)
  └─→ Prisma works immediately (basic quality)

Users adopt Map
  └─→ Local training improves each user's personal Prisma head

Threshold reached (≥ K users)
  └─→ FL rounds begin for this Map's head
  └─→ Prisma quality improves with collective intelligence

Map becomes popular
  └─→ FL rounds produce stable, high-quality Prisma head
  └─→ Distilled symbolic rules extracted (Layer 3)
  └─→ Map flagged for platform moderator review if not already verified. Verified maps receive a badge.
```

### 10.5 Cross-Map Arrows

When multiple Mandalas exist in the same Space, Arrows can cross between them. For example:

- A Note in the Emotions Map's `present-beliefs` could link to a Note in the Life Map's `profissional-querer` (a career-related belief connecting to a professional desire)
- Cross-Map edge types are defined at the Space level, not the Map level
- Maps created in different Spaces cannot cross-reference each other
- Prisma can predict cross-Map Arrows using embeddings from both Maps' encoders

---

## 11. Technology Stack

### 11.1 Browser (Client-Side)

| Component          | Technology                                                                                      | Purpose                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Canvas             | tldraw + tldraw-sync                                                                            | Mandala rendering, Note editing, real-time collaboration |
| Prisma encoder     | [ONNX Runtime Web](https://onnxruntime.ai/) (WASM)                                              | Text embedding inference + local LoRA training           |
| Prisma base model  | [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) (ONNX format) | 22M param sentence encoder, 384-dim output               |
| FL training        | ONNX Runtime Web Training API                                                                   | Local LoRA-B + head training in Web Worker               |
| Encryption         | [OpenFHE WASM](https://openfhe.org/) or Concrete WASM                                           | CKKS homomorphic encryption of model updates             |
| DP noise           | Custom TypeScript                                                                               | Gaussian noise injection + gradient clipping             |
| Symbolic reasoning | Custom TypeScript                                                                               | Pattern detection, gap analysis, chain detection         |
| Iris API calls     | Fetch API / SSE                                                                                 | Communication with user's chosen LLM                     |

### 11.2 Cloudflare Edge (Server-Side)

| Component           | Technology                      | Purpose                                                                         |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| Worker              | Cloudflare Workers (TypeScript) | HTTP routing, auth, API proxy                                                   |
| User storage        | Durable Objects (SQLite)        | Per-Space Mandala state, Notes, Arrows                                          |
| FL aggregation      | Durable Objects                 | Per-Map FedAvg on CKKS ciphertexts                                              |
| Model storage       | Cloudflare R2                   | Encrypted Prisma checkpoints per round                                          |
| Atlas metadata      | Cloudflare D1                   | Map definitions, user accounts, Atlas entries                                   |
| Vector search       | Cloudflare Vectorize            | Anchor embeddings, semantic search for RAG                                      |
| Fallback embeddings | Cloudflare Workers AI           | `@cf/baai/bge-small-en-v1.5` for server-side embedding when browser unavailable |
| LoRA inference      | Cloudflare Workers AI           | LoRA adapter serving for open-source Iris models (Layer 4)                      |
| AI Gateway          | Cloudflare AI Gateway           | Rate limiting, caching, observability for LLM API calls                         |

### 11.3 Key Dependencies

| Dependency       | Version/Source                                                               | License        | Purpose                           |
| ---------------- | ---------------------------------------------------------------------------- | -------------- | --------------------------------- |
| ONNX Runtime Web | [github.com/microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) | MIT            | Browser-side inference + training |
| all-MiniLM-L6-v2 | [HuggingFace](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) | Apache 2.0     | Base encoder model                |
| OpenFHE          | [openfhe.org](https://openfhe.org/)                                          | BSD 2-Clause   | CKKS homomorphic encryption       |
| tldraw           | [github.com/tldraw/tldraw](https://github.com/tldraw/tldraw)                 | tldraw license | Canvas framework                  |

---

## 12. Implementation Phases

### Phase 1: Foundation (Current → Near-term)

**Objective:** Per-user Durable Objects, authentication, basic Iris conversation.

- [ ] User authentication (Cloudflare Access)
- [ ] Per-Space Durable Objects with SQLite storage
- [ ] BYOM configuration: user selects LLM provider and provides API key
- [ ] Iris conversational flow through Worker proxy (existing `AgentService.ts`)
- [ ] D1 schema for user accounts and Space metadata
- [ ] Privacy-by-default: DO isolation, no cross-user data access

**Privacy posture:** "Data isolated per-Space. No central content database."

### Phase 2: Prisma Cell Classification (Near-term)

**Objective:** Prisma classifies Notes into Cells and provides context to Iris.

- [ ] Bundle all-MiniLM-L6-v2 ONNX model (~22MB, cached via Service Worker)
- [ ] Implement Cell anchor generation from Map definitions
- [ ] Store initial anchors in Vectorize
- [ ] Build classification endpoint: Note text → nearest Cell anchor → suggestion
- [ ] Integrate Prisma context into Iris system prompt (Context Engineering, Layer 1)
- [ ] Surface classification as UI suggestion ("This note might belong in Present/Beliefs")
- [ ] Local-only training: user's Note-to-Cell placements refine personal Prisma head

**Privacy posture:** "Prisma runs entirely in your browser. Nothing leaves your device."

### Phase 3: Knowledge Graph & Arrows (Near-term → Medium-term)

**Objective:** Implement Arrows between Notes, Arrow prediction, symbolic reasoning.

- [ ] Add `edgeTypes` to Map definitions (Emotions Map first, then Life Map)
- [ ] Implement Arrow creation UI (connect Notes with typed Arrows)
- [ ] Build Edge predictor in Prisma (per-Map head, schema-constrained)
- [ ] Implement symbolic reasoning layer:
  - [ ] Chain detection (complete CBT thought records)
  - [ ] Gap analysis (missing Evidence Arrows)
  - [ ] Coverage analysis (empty Cells)
- [ ] Inject graph patterns into Iris context
- [ ] RAG from Mandala history (Layer 2): semantic search over past Notes

**Privacy posture:** Same as Phase 2 — all processing in browser.

### Phase 4: Federated Learning with Encryption (Medium-term)

**Objective:** FL training of Prisma across users with full encryption.

- [ ] Implement FFA-LoRA training in ONNX Runtime Web (browser, Web Worker)
- [ ] Implement CKKS encryption (OpenFHE WASM build)
- [ ] Build Aggregation Durable Object:
  - [ ] Round coordination (broadcast, collect, aggregate, publish)
  - [ ] Homomorphic addition over CKKS ciphertexts
  - [ ] Byzantine defense (Krum on ciphertext norms)
  - [ ] Round key management
- [ ] Implement DP noise injection (Gaussian mechanism, per-parameter clipping)
- [ ] R2 storage for encrypted model checkpoints
- [ ] Consent UI at signup (nudged opt-in for free tier, explicit for EU)
- [ ] Global encoder FL rounds + per-Map head FL rounds
- [ ] Distilled symbolic rules from FL-trained Prisma (Layer 3)
- [ ] Monitoring: FL round metrics, convergence tracking, participation rates

**Privacy posture:** "Every byte that leaves your device is encrypted. The server computes on ciphertext. Only your device can decrypt. Privacy enforced by mathematics."

### Phase 5: Advanced Privacy & Platform (Long-term)

**Objective:** E2EE at rest, Atlas platform, open-source privacy layer.

- [ ] E2EE for stored data (user-held keys, Web Crypto API)
- [ ] Atlas: Map creation UI, publishing, discovery, search
- [ ] AI agent Map creation with evidence basis
- [ ] Clinician review workflow for Maps
- [ ] Cross-Map Arrows and cross-Map Prisma intelligence
- [ ] Optional federated LoRA fine-tuning for open-source Iris models (Layer 4)
- [ ] Formal privacy audit (DP budget accounting, CKKS security parameters)
- [ ] Open-source the FL + encryption layer for trust and auditability
- [ ] Map versioning and evolution (update Maps while preserving user data)

**Privacy posture:** "Even we cannot read your data at rest. Open-source encryption layer — verify it yourself."

---

## 13. Research Foundations & References

### 13.1 Federated Learning

| Paper                                                                                                                                                                                                                                                        | Year | Venue          | Relevance                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | -------------- | --------------------------------------------------------------------------- |
| McMahan et al., "Communication-Efficient Learning of Deep Networks from Decentralized Data"                                                                                                                                                                  | 2017 | AISTATS        | Foundational FedAvg algorithm                                               |
| [FFA-LoRA: "Improving LoRA in Privacy-preserving Federated Learning"](https://arxiv.org/abs/2403.12313)                                                                                                                                                      | 2024 | ICLR           | Freeze A matrix, train only B — halves communication, improves DP stability |
| [HetLoRA: "Heterogeneous LoRA for Federated Fine-tuning of On-Device Foundation Models"](https://arxiv.org/abs/2401.06432)                                                                                                                                   | 2024 | EMNLP (Google) | Heterogeneous LoRA ranks per client device capability                       |
| [FedEx-LoRA: "Exact Aggregation for Federated Fine-Tuning"](https://arxiv.org/abs/2410.09432)                                                                                                                                                                | 2024 | —              | Exact (not approximate) aggregation of LoRA matrices                        |
| [FedALT: "Federated Fine-Tuning through Adaptive Local Training"](https://arxiv.org/abs/2503.11880)                                                                                                                                                          | 2025 | —              | Personal LoRA + global "Rest-of-World" LoRA with adaptive mixing            |
| [LoRA-FAIR: "Federated LoRA Fine-Tuning with Aggregation and Initialization Refinement"](https://openaccess.thecvf.com/content/ICCV2025/papers/Bian_LoRA-FAIR_Federated_LoRA_Fine-Tuning_with_Aggregation_and_Initialization_Refinement_ICCV_2025_paper.pdf) | 2025 | ICCV           | Addresses aggregation bias and client initialization lag                    |
| [SHE-LoRA: "Selective Homomorphic Encryption for Federated Tuning with Heterogeneous LoRA"](https://arxiv.org/html/2505.21051)                                                                                                                               | 2025 | —              | Selective HE for LoRA in FL (our decision: encrypt everything instead)      |
| ["Towards WebAssembly-Based Federated Learning"](https://link.springer.com/chapter/10.1007/978-3-031-84617-5_4)                                                                                                                                              | 2025 | Springer       | Validates FL training in WASM runtimes (directly applicable to Workers)     |

### 13.2 Neuro-Symbolic AI

| Paper                                                                                                                    | Year | Venue      | Relevance                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ---- | ---------- | --------------------------------------------------------------------------------------------------- |
| [FedNSL: "Federated Neuro-Symbolic Learning"](https://arxiv.org/abs/2308.15324)                                          | 2024 | ICML (IBM) | First framework combining neuro-symbolic rules with FL                                              |
| [FedSA: "Unified Representation Learning via Semantic Anchors for Prototype-based FL"](https://arxiv.org/abs/2501.05496) | 2025 | AAAI       | Pre-defined class anchors as stable reference for FL classification — directly maps to Cell anchors |
| ["Knowledge-Driven Federated Graph Learning"](https://arxiv.org/html/2501.12624v3)                                       | 2025 | —          | Knowledge "carriers" as federation medium — schema as shared structure                              |
| ["Neuro-Symbolic AI in 2024: A Systematic Review"](https://arxiv.org/abs/2501.05435)                                     | 2025 | —          | State of the field, growing medical/clinical applications                                           |

### 13.3 Privacy & Encryption

| Paper/Resource                                                                                                                                                                          | Year | Relevance                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| [Cheon et al., "Homomorphic Encryption for Arithmetic of Approximate Numbers" (CKKS)](https://eprint.iacr.org/2016/421)                                                                 | 2017 | CKKS scheme — basis for our FL encryption                                |
| ["Secure Aggregation in Federated Learning using Multiparty HE"](https://arxiv.org/abs/2503.00581)                                                                                      | 2025 | Practical MPHE for FL aggregation                                        |
| [NVIDIA: "Federated Learning with Homomorphic Encryption"](https://developer.nvidia.com/blog/federated-learning-with-homomorphic-encryption/)                                           | —    | ~20% overhead benchmark for HE in FL                                     |
| [PTOPOFL: Persistent Homology for FL Privacy](https://aisecurity-portal.org/en/literature-database/ptopofl-privacy-preserving-personalised-federated-learning-via-persistent-homology/) | 2025 | Replace gradients with topological descriptors — provably non-invertible |
| [OpenFHE: Open-Source FHE Library](https://openfhe.org/)                                                                                                                                | 2022 | CKKS implementation with WASM support                                    |
| [Zama TFHE-rs](https://github.com/zama-ai/tfhe-rs)                                                                                                                                      | 2025 | Rust FHE with WASM client API                                            |
| [Concrete ML: Encrypted LoRA Fine-Tuning](https://docs.zama.org/concrete-ml/llms/lora_training)                                                                                         | 2025 | ML-specific FHE tooling                                                  |
| ["FL Privacy Mechanisms Survey"](https://link.springer.com/article/10.1007/s10462-025-11170-5)                                                                                          | 2025 | Comprehensive survey of DP + HE + MPC in FL                              |
| ["FL Privacy Attacks & Defenses Survey"](https://dl.acm.org/doi/full/10.1145/3724113)                                                                                                   | 2025 | Gradient inversion attacks and countermeasures                           |

### 13.4 Mental Health & FL

| Paper                                                                                                                         | Year | Relevance                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| [FedMentalCare: "Privacy-Preserving Fine-Tuned LLMs for Mental Health"](https://arxiv.org/abs/2503.05786)                     | 2025 | FL + LoRA + MobileBERT/MiniLM for mental health text classification |
| [FedMentor: "Domain-Aware DP for Mental Health"](https://arxiv.org/abs/2509.14275)                                            | 2025 | Domain-aware DP budgets for therapy-related data                    |
| [FedTherapist: "Mental Health Monitoring via FL"](https://openreview.net/forum?id=HFbtrmefx7)                                 | —    | Mobile mental health monitoring using speech + keyboard via FL      |
| ["Federated Depression Detection with Multilingual NLP"](https://www.sciencedirect.com/science/article/pii/S2666389924001053) | 2024 | Cross-institutional FL for mental health NLP                        |

### 13.5 Context Engineering

| Resource                                                                                                                                                    | Year | Relevance                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| [Anthropic: "Effective Context Engineering for AI Agents"](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)               | 2025 | "Intelligence is not the bottleneck — context is." Primary methodology for improving Iris |
| ["A Survey of Context Engineering for LLMs"](https://arxiv.org/abs/2507.13334)                                                                              | 2025 | Formal survey of context engineering techniques                                           |
| ["RAG vs Fine-Tuning for LLMs (2026 Production Guide)"](https://dev.to/umesh_malik/rag-vs-fine-tuning-for-llms-2026-what-actually-works-in-production-10if) | 2026 | Hybrid approach consensus — volatile knowledge in RAG, stable behavior in fine-tuning     |

### 13.6 Clinical Foundations

| Source                                                                                                                               | Relevance                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Beck, A.T. (1979). _Cognitive Therapy and the Emotional Disorders._                                                                  | Foundation of CBT; basis for Emotions Map cell structure and edge types                 |
| Beck, J.S. (2011). _Cognitive Behavior Therapy: Basics and Beyond._                                                                  | Updated CBT model; belief → behavior chains                                             |
| Burns, D.D. (1980). _Feeling Good: The New Mood Therapy._                                                                            | Cognitive distortions; evidence evaluation methodology                                  |
| Young, J.E. (1990). _Cognitive Therapy for Personality Disorders: A Schema-Focused Approach._                                        | Schema therapy; how automatic thoughts become core beliefs                              |
| Bennett-Levy, J. et al. (2004). _Oxford Guide to Behavioural Experiments in Cognitive Therapy._                                      | Behavioral experiments flowing from restructured beliefs                                |
| Padesky, C.A. (1994). "Schema Change Processes in Cognitive Therapy."                                                                | Disconfirming evidence in cognitive restructuring                                       |
| Ehlers, A. & Clark, D.M. (2000). "A Cognitive Model of PTSD."                                                                        | How past events shape future expectations                                               |
| Salkovskis, P.M. (1991). "The Importance of Behaviour in the Maintenance of Anxiety and Panic."                                      | Behavioral feedback loops maintaining beliefs                                           |
| Kielhofner, G. (2008). _Model of Human Occupation (MOHO)._ 4th ed.                                                                   | Foundation of Life Map; volition, habituation, performance capacity across life domains |
| Christiansen, C.H. (1999). "Defining Lives: Occupation as Identity."                                                                 | Occupational identity; basis for Ser (being) ring                                       |
| Wilcock, A.A. (2006). _An Occupational Perspective of Health._                                                                       | Occupational balance; basis for cross-domain edges                                      |
| Backman, C.L. (2004). "Occupational Balance: Exploring the Relationships among Daily Occupations and Their Influence on Well-Being." | Role conflicts; basis for `conflicts-with` edge type                                    |
| Larson, E.A. & Zemke, R. (2003). "Shaping the Temporal Patterns of Our Lives."                                                       | Temporal organization of occupation; basis for domain→temporal edges                    |
| Clark, F. et al. (1991). "Occupational Science: Academic Innovation in the Service of Occupational Therapy's Future."                | Foundation of occupational science informing Life Map design                            |

---

---

**Copyright © 2026 Rafael Rjeille. All rights reserved.**
Barcelona, Spain.

_This specification represents the architectural vision for Iris's neuro-symbolic federated learning system. Implementation follows the phased approach outlined in Section 12, with privacy guarantees strengthening at each phase._
