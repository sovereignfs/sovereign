---
name: sv-create-pr
description: Create a Sovereign pull request from the current branch. Use when the user asks to create, open, or prepare a PR, or when a Sovereign workflow reaches PR creation; always creates a GitHub draft PR first.
---

# Sovereign Create PR

Create a GitHub pull request for the current branch.

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it. "Your attribution
> footer" is `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
> for Claude Code or `🤖 Generated with [Codex](https://developers.openai.com/codex)`
> for Codex.

## Workflow

1. Read your instruction file, `docs/development-workflow.md`, and
   `CURRENT_TASK.md` if it exists.

2. Check branch and worktree: `git branch --show-current`, `git status --short`.
   - Never create a PR from `main`.
   - Do not commit, amend, rebase, or push unless the user explicitly asked
     for that action in this session. If the branch has no pushed commits or
     the tree has uncommitted task changes, report the blocker instead of
     inventing a commit.
   - Pushing runs the pre-push hook (`pnpm verify:push`); on a fresh checkout
     run `pnpm generate` first or typecheck fails on missing generated files.

3. Target `main` (until the post-v1 branch model changes); `--head` is the
   current branch.

4. Prepare the title and body:
   - Title says what changed. No roadmap slot versions, doc task numbers, or
     epic IDs anywhere in title or body.
   - Body: what changed and why; relevant SRS/RFC/workstream references;
     verification commands and results; version bumps made.
   - End with your attribution footer.

5. Create as a draft:

   ```bash
   gh pr create --draft --base main --head <branch> --title "<title>" --body-file <body-file>
   ```

6. Report the PR URL and state that it is a draft.

## Invariants

- Every agent-created PR starts as a draft, even when the user just says
  "create the PR".
- Mark ready for review only on explicit instruction.
- Never merge automatically.
