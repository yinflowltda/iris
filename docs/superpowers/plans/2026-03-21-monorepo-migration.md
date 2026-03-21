# Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Iris and Sara repositories into a single Bun workspaces monorepo at `yinflowltda/yinflow.life`.

**Architecture:** Sara repo is the host. Sara's code moves into `apps/sara/`, Iris is imported via `git subtree add --prefix=apps/iris`. Root workspace config ties them together with Bun workspaces. Each app retains its own build, deploy, and config.

**Tech Stack:** Bun workspaces, git subtree, GitHub CLI (`gh`)

**Spec:** `docs/superpowers/specs/2026-03-21-monorepo-migration-design.md`

**Working directory:** This plan is executed in a local clone of `yinflowltda/sara`. NOT in the Iris repo.

---

## Pre-flight

Before starting any task, verify prerequisites and set up the working environment:

```bash
# Verify gh CLI is authenticated and has access to both repos
gh repo view yinflowltda/sara --json name
gh repo view yinflowltda/iris --json name

# Clone and create branch
cd /Users/rafarj/code
gh repo clone yinflowltda/sara yinflow.life
cd yinflow.life
git checkout -b monorepo-migration
```

All tasks below assume cwd is `/Users/rafarj/code/yinflow.life`.

---

### Task 1: Create `apps/` directory and move Sara app code

**Files:**
- Create: `apps/sara/` (directory)
- Move: all Sara app directories into `apps/sara/`

- [ ] **Step 1: Create the apps directory structure**

```bash
mkdir -p apps/sara
```

- [ ] **Step 2: Move all Sara app code directories**

```bash
git mv app apps/sara/
git mv lib apps/sara/
git mv components apps/sara/
git mv workers apps/sara/
git mv functions apps/sara/
git mv hooks apps/sara/
git mv i18n apps/sara/
git mv messages apps/sara/
git mv artifacts apps/sara/
git mv public apps/sara/
git mv scripts apps/sara/
git mv tests apps/sara/
git mv docs apps/sara/
```

- [ ] **Step 3: Move Sara app config files**

```bash
git mv package.json apps/sara/
git mv tsconfig.json apps/sara/
git mv tsconfig.tsbuildinfo apps/sara/ 2>/dev/null || true
git mv next.config.ts apps/sara/
git mv wrangler.toml apps/sara/
git mv open-next.config.ts apps/sara/
git mv drizzle.config.ts apps/sara/
git mv playwright.config.ts apps/sara/
git mv middleware.ts apps/sara/
git mv instrumentation.ts apps/sara/
git mv components.json apps/sara/
git mv postcss.config.mjs apps/sara/
git mv next-env.d.ts apps/sara/
git mv docker-compose.waha.yml apps/sara/
git mv biome.jsonc apps/sara/
```

- [ ] **Step 4: Move Sara-specific docs and optional files**

```bash
git mv DEPLOYMENT.md apps/sara/
git mv CLOUDFLARE_DEPLOYMENT_SUMMARY.md apps/sara/
git mv CLOUDFLARE_ENV_VARS.md apps/sara/
git mv CLOUDFLARE_GATEWAY_MIGRATION.md apps/sara/
git mv CLOUDFLARE_MIGRATION_GUIDE.md apps/sara/
git mv CLOUDFLARE_QUICKSTART.md apps/sara/
git mv LOCAL_BUILD_TEST.md apps/sara/
git mv REGRESSION_TESTS.md apps/sara/
```

Move vercel configs and env template if they exist:
```bash
git mv vercel.json apps/sara/ 2>/dev/null || true
git mv vercel-template.json apps/sara/ 2>/dev/null || true
git mv .env.example apps/sara/ 2>/dev/null || true
```

- [ ] **Step 5: Remove Sara's root bun.lock (will be replaced by monorepo lockfile later)**

```bash
rm -f bun.lock
```

- [ ] **Step 6: Rename Sara's package.json `name` field and remove `packageManager`**

Edit `apps/sara/package.json`:
- Change `"name": "ai-chatbot"` to `"name": "sara"`
- Remove the `"packageManager": "bun@latest"` field (the root workspace manages this)

- [ ] **Step 7: Verify directory structure**

```bash
ls apps/sara/
# Expected: app/ lib/ components/ workers/ package.json tsconfig.json wrangler.toml next.config.ts ... etc
ls -la | head -30
# Expected: .github/ .gitignore LICENSE README.md lefthook.yml .cursor/ .vscode/ .node-version .npmrc apps/
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move Sara app code into apps/sara/"
```

---

### Task 2: Verify Sara builds from `apps/sara/`

**Files:**
- Modify: `apps/sara/package.json` (if needed)
- Modify: `apps/sara/tsconfig.json` (if needed)

- [ ] **Step 1: Install dependencies from Sara's directory**

Note: This creates a temporary lockfile in `apps/sara/` for verification purposes. It will be removed later when we switch to the root workspace lockfile in Task 7.

```bash
cd apps/sara
bun install
```

- [ ] **Step 2: Run type check**

```bash
bun run type-check
```

Expected: passes (or pre-existing errors). Note any new errors caused by the move.

- [ ] **Step 3: Run build**

```bash
bun run build:skip-migrations
```

Expected: Next.js build succeeds. If it fails, check for path resolution issues in `tsconfig.json`, `next.config.ts`, or `drizzle.config.ts`.

- [ ] **Step 4: Go back to repo root**

```bash
cd ../..
```

- [ ] **Step 5: Fix any build issues and commit**

If there were build errors caused by the move, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve Sara path issues after move to apps/sara/"
```

---

### Task 3: Update CI workflows for monorepo

**Files:**
- Modify: `.github/workflows/lint.yml`
- Modify: `.github/workflows/playwright.yml`
- Modify: `.github/workflows/validate.yml`

- [ ] **Step 1: Rewrite `lint.yml` — migrate from pnpm to Bun + add working-directory**

**Important:** `bun install` must run from repo root (where the workspace `package.json` lives). Only the app-specific commands use `working-directory`.

Replace `.github/workflows/lint.yml` with:

```yaml
name: Lint

on: [push]

jobs:
  lint:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun run lint
        working-directory: apps/sara
```

- [ ] **Step 2: Rewrite `playwright.yml` — migrate from pnpm to Bun + add working-directory**

Replace `.github/workflows/playwright.yml` with:

```yaml
name: Playwright Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    timeout-minutes: 30
    runs-on: ubuntu-22.04
    env:
      AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
      POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
      BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
      REDIS_URL: ${{ secrets.REDIS_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bunx playwright install --with-deps
        working-directory: apps/sara
      - run: bun run test
        working-directory: apps/sara
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: apps/sara/playwright-report/
          retention-days: 30
```

- [ ] **Step 3: Rewrite `validate.yml` — add working-directory for app commands**

Replace `.github/workflows/validate.yml` with:

```yaml
name: Validate

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  validate:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - name: Type check Sara
        run: bun run type-check
        working-directory: apps/sara
        continue-on-error: true
        id: typecheck
      - name: Check type-check result
        if: steps.typecheck.outcome == 'failure'
        run: exit 1
```

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "ci: migrate all workflows to Bun and add monorepo working-directory"
```

---

### Task 4: Update lefthook.yml for monorepo

**Files:**
- Modify: `lefthook.yml`

- [ ] **Step 1: Update lefthook.yml to scope per app**

Replace `lefthook.yml` with:

```yaml
pre-commit:
  parallel: true
  commands:
    sara-type-check:
      glob: "apps/sara/**/*.{ts,tsx}"
      run: cd apps/sara && bun run type-check
      stage_fixed: true

pre-push:
  commands:
    sara-validate:
      glob: "apps/sara/**/*.{ts,tsx}"
      run: cd apps/sara && bun run type-check
    iris-typecheck:
      glob: "apps/iris/**/*.{ts,tsx}"
      run: cd apps/iris && bun run typecheck
```

- [ ] **Step 2: Commit**

```bash
git add lefthook.yml
git commit -m "chore: scope lefthook git hooks per monorepo app"
```

---

### Task 5: Import Iris via git subtree

**Files:**
- Create: `apps/iris/` (entire Iris repo)

- [ ] **Step 1: Add Iris as a remote and fetch**

```bash
git remote add iris https://github.com/yinflowltda/iris.git
git fetch iris
```

- [ ] **Step 2: Import Iris with full history under apps/iris/**

```bash
git subtree add --prefix=apps/iris iris main
```

Expected: merge commit created. All Iris files now under `apps/iris/`.

- [ ] **Step 3: Remove the Iris remote (no longer needed)**

```bash
git remote remove iris
```

- [ ] **Step 4: Verify Iris files are present**

```bash
ls apps/iris/
# Expected: client/ worker/ shared/ package.json vite.config.ts wrangler.toml tsconfig.json ...
git log --oneline -5 apps/iris/client/
# Expected: shows Iris commit history
```

---

### Task 6: Post-import Iris cleanup

**Files:**
- Modify: `apps/iris/package.json`
- Delete: `apps/iris/bun.lock`
- Delete: `apps/iris/.claude/` (if exists)
- Delete: `apps/iris/.gitignore`
- Modify: `apps/iris/CLAUDE.md`

- [ ] **Step 1: Rename Iris package.json name**

Edit `apps/iris/package.json`: change `"name": "tldraw-agent"` to `"name": "iris"`.

- [ ] **Step 2: Remove Iris bun.lock (monorepo root lockfile takes over)**

```bash
rm -f apps/iris/bun.lock
```

- [ ] **Step 3: Remove Iris .claude/ directory (monorepo-level takes over)**

```bash
rm -rf apps/iris/.claude/
```

- [ ] **Step 4: Remove Iris .superpowers/ and .superset/ if present**

```bash
rm -rf apps/iris/.superpowers/ apps/iris/.superset/
```

- [ ] **Step 5: Note Iris .gitignore entries for later merge, then remove**

Read `apps/iris/.gitignore` and note entries not already in root `.gitignore`. Key Iris-specific entries to merge later:
- `.dev.vars` / `*.dev.vars`
- `.wrangler/`
- `dist/`
- `.worktrees/`
- `.superpowers/`
- `tools/prompt-lab/results/`

```bash
rm apps/iris/.gitignore
```

- [ ] **Step 6: Update Iris CLAUDE.md**

Edit `apps/iris/CLAUDE.md` to update the worktree instruction to note this is now part of a monorepo. Replace the "Automatic Worktree Isolation" section header with a note:

```markdown
# Iris App (part of yinflow.life monorepo)

This is the Iris app within the yinflow.life monorepo. Run commands from this directory (`apps/iris/`).

## Development

- `bun run dev` — start dev server
- `bun run build` — production build
- `bun run typecheck` — type check
- `wrangler deploy` — deploy to iris.yinflow.life
```

Keep all the architecture/reference sections intact — just update the header context.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: clean up Iris post-subtree import (rename, remove locks, update docs)"
```

---

### Task 7: Create root workspace config

**Files:**
- Create: `package.json` (root)
- Create: `packages/` (empty directory with .gitkeep)

- [ ] **Step 1: Create root package.json**

Create `package.json` at repo root:

```json
{
  "name": "yinflow.life",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev:sara": "bun --filter sara dev",
    "dev:iris": "bun --filter iris dev",
    "build:sara": "bun --filter sara build",
    "build:iris": "bun --filter iris build",
    "typecheck": "bun --filter '*' typecheck"
  }
}
```

- [ ] **Step 2: Create empty packages directory**

```bash
mkdir -p packages
touch packages/.gitkeep
```

- [ ] **Step 3: Remove temporary lockfiles from apps (root lockfile takes over)**

```bash
rm -f apps/sara/bun.lock apps/iris/bun.lock
```

- [ ] **Step 4: Commit**

```bash
git add package.json packages/
git add -u  # pick up lockfile deletions
git commit -m "chore: add root workspace config with Bun workspaces"
```

---

### Task 8: Resolve dependency conflicts

**Files:**
- Modify: `apps/sara/package.json`

This task attempts to align shared dependency versions. **Time-box to 2 hours.** If Sara's build breaks badly from the upgrades, fall back to per-workspace overrides instead.

- [ ] **Step 1: Upgrade Sara's shared dependencies**

From the repo root, edit `apps/sara/package.json` to update these versions:

| Package | From | To |
|---|---|---|
| `"ai"` | `"5.0.108"` | `"^6.0.90"` |
| `"zod"` | `"^3.25.76"` | `"^4.1.8"` |
| `"react"` | `"19.0.1"` | `"^19.2.1"` |
| `"react-dom"` | `"19.0.1"` | `"^19.2.1"` |
| `"@types/react"` | `"^18.*"` | `"^19.2.7"` |
| `"@types/react-dom"` | `"^18.*"` | `"^19.2.3"` |
| `"workers-ai-provider"` | `"^2.0.0"` | `"^3.1.1"` |
| `"@biomejs/biome"` | `"2.2.2"` | `"^2.4.2"` |

- [ ] **Step 2: Run bun install from root**

```bash
bun install
```

Expected: unified `bun.lock` generated at root. Both apps' dependencies resolved.

- [ ] **Step 3: Check for Sara build errors**

```bash
cd apps/sara
bun run type-check
```

Fix any type errors caused by the upgrades. Common issues:
- `zod` v4: `z.object()` API changes, `.parse()` return type changes
- `ai` v6: streaming API changes, tool call format changes
- `@types/react` v19: stricter event types

- [ ] **Step 4: If upgrades are too disruptive, fall back to overrides**

If Sara's type errors are extensive (50+ errors across core files), abandon the upgrade approach. Revert `apps/sara/package.json` to its original versions. Bun workspaces will resolve different versions per workspace when the semver ranges don't overlap (e.g., `zod@^3` and `zod@^4` have non-overlapping ranges, so each app gets its own version in its `node_modules/`). This is the expected behavior — no special override syntax needed.

- [ ] **Step 5: Verify Iris still builds**

```bash
cd ../iris
bun run typecheck
```

Expected: passes unchanged.

- [ ] **Step 6: Go back to root and commit**

```bash
cd ../..
git add -A
git commit -m "chore: align dependency versions across workspaces"
```

---

### Task 9: Merge .gitignore files

**Files:**
- Modify: `.gitignore` (root)

- [ ] **Step 1: Merge Iris-specific entries into root .gitignore**

Add these entries from Iris's .gitignore (if not already present) to the root `.gitignore`:

```gitignore
# Shared / Iris-specific
dist/
.dev.vars
*.dev.vars
.tsbuild/
.worktrees/
.superpowers/
.superset/
.conductor/
tools/prompt-lab/results/
```

Entries already covered by Sara's .gitignore:
- `node_modules` — already present
- `.wrangler/` — already present
- `test-results/` — already present
- `playwright-report/` — already present

- [ ] **Step 2: Verify .env files are properly ignored**

Confirm these are in `.gitignore`:
- `.env.local` (Next.js convention — Sara)
- `.env.*.local`
- `.dev.vars` (Cloudflare convention — Iris)
- `.env` should NOT be globally ignored (Iris uses `.env` for non-secret config)

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: merge Iris gitignore entries into root"
```

---

### Task 10: Verify full monorepo build

- [ ] **Step 1: Clean install from root**

```bash
rm -rf node_modules apps/sara/node_modules apps/iris/node_modules
bun install
```

- [ ] **Step 2: Build Sara**

```bash
bun --filter sara build:skip-migrations
```

Expected: Next.js build succeeds.

- [ ] **Step 3: Build Iris**

```bash
bun --filter iris build
```

Expected: Vite build succeeds.

- [ ] **Step 4: Type check both apps**

```bash
bun --filter '*' typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: resolve remaining monorepo build issues"
```

(Skip this commit if no changes were needed.)

---

### Task 11: Create root README and CLAUDE.md

**Files:**
- Modify: `README.md` (root)
- Create: `CLAUDE.md` (root)

- [ ] **Step 1: Update root README.md**

Replace root `README.md` with:

```markdown
# yinflow.life

Monorepo for Yinflow applications.

## Apps

| App | Description | URL | Stack |
|-----|-------------|-----|-------|
| [Sara](apps/sara/) | Health triage AI agent + marketing site | sara.yinflow.life | Next.js, LangGraph, PostgreSQL |
| [Iris](apps/iris/) | Cognitive mapping canvas | iris.yinflow.life | React, tldraw, Cloudflare Workers |

## Setup

```bash
bun install          # Install all dependencies
bun run dev:sara     # Start Sara dev server
bun run dev:iris     # Start Iris dev server
```

## Structure

```
apps/
  sara/    — Next.js health triage app
  iris/    — tldraw cognitive mapping app
packages/  — Shared packages (future)
```
```

- [ ] **Step 2: Create root CLAUDE.md**

Create `CLAUDE.md` at repo root:

```markdown
# yinflow.life Monorepo

## Structure

- `apps/sara/` — Next.js health triage AI agent + marketing site (sara.yinflow.life)
- `apps/iris/` — React + tldraw cognitive mapping canvas (iris.yinflow.life)
- `packages/` — Shared packages (none yet)

## Package Manager

Always use `bun` (not npm/pnpm/yarn).

## Commands

Run from repo root:
- `bun install` — install all dependencies
- `bun run dev:sara` / `bun run dev:iris` — start dev servers
- `bun run build:sara` / `bun run build:iris` — production builds
- `bun --filter sara <script>` / `bun --filter iris <script>` — run any app script

Or `cd` into an app directory and run scripts directly.

## Deployment

Each app deploys independently:
- Sara: Cloudflare Pages + Workers (OpenNext) — `cd apps/sara && bun run deploy`
- Iris: Cloudflare Workers (Vite plugin) — `cd apps/iris && wrangler deploy`

## App-Specific Instructions

See `apps/iris/CLAUDE.md` for Iris-specific context.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add monorepo README and CLAUDE.md"
```

---

### Task 12: Rename repo and archive Iris

**Files:** None (GitHub operations only)

- [ ] **Step 1: Push the migration branch**

```bash
git push -u origin monorepo-migration
```

- [ ] **Step 2: Create PR for review**

```bash
gh pr create --title "Monorepo migration: merge Iris into Sara" --body "$(cat <<'EOF'
## Summary
- Moved Sara app code into `apps/sara/`
- Imported Iris repo with full commit history via `git subtree add` into `apps/iris/`
- Set up Bun workspaces at root
- Aligned shared dependency versions
- Updated CI workflows (migrated from pnpm to Bun, added monorepo paths)
- Updated lefthook hooks for per-app scoping
- Merged .gitignore files
- Added root README.md and CLAUDE.md

## Test plan
- [ ] `bun install` from root succeeds
- [ ] `bun --filter sara build:skip-migrations` succeeds
- [ ] `bun --filter iris build` succeeds
- [ ] `bun --filter '*' typecheck` passes
- [ ] `git log --oneline apps/iris/` shows Iris commit history
- [ ] CI workflows pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Update Cloudflare Pages build config for Sara**

In the Cloudflare dashboard (or via Wrangler), update Sara's Pages project:
- Build command: `cd apps/sara && bun run build:workers`
- Build output directory: `apps/sara/.open-next/assets`
- Root directory: `/` (repo root)

- [ ] **Step 4: After PR is merged, rename the repo**

```bash
gh repo rename yinflow.life --repo yinflowltda/sara --yes
```

- [ ] **Step 5: Archive the original Iris repo**

```bash
gh repo archive yinflowltda/iris --yes
```

Update the Iris repo description to point to the monorepo:

```bash
gh repo edit yinflowltda/iris --description "ARCHIVED — moved to yinflowltda/yinflow.life/apps/iris"
```

- [ ] **Step 6: Clone the renamed repo to verify**

```bash
cd /Users/rafarj/code
# Remove or rename the working clone first
mv yinflow.life yinflow.life.migration-backup
gh repo clone yinflowltda/yinflow.life
cd yinflow.life
bun install
bun --filter sara build:skip-migrations
bun --filter iris build
```

Expected: everything builds clean from a fresh clone. Once verified, the backup can be deleted:
```bash
rm -rf /Users/rafarj/code/yinflow.life.migration-backup
```
