# Iris Project

## Automatic Worktree Isolation

You MUST work in an isolated git worktree. Follow these rules:

### On first task
After the user provides their first task (not at session start), BEFORE doing any work:
1. Derive a short, descriptive branch-style name from the task (e.g., `fix-zoom-hit-testing`, `add-label-rotation`, `refactor-snap-system`)
2. Call `EnterWorktree` with that name
3. Then proceed with the task

### On task completion
After finishing a task (code committed, PR created, or user confirms done), ask:
> "Want to start a new task? I'll set up a fresh worktree for it."

If yes, repeat the process with a new worktree name derived from the next task.

This ensures multiple Claude Code instances running in parallel never conflict with each other.
