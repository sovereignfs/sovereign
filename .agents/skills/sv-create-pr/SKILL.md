---
name: sv-create-pr
description: Create a Sovereign pull request from the current branch. Use when the user asks Codex to create, open, or prepare a PR, or when a Sovereign workflow reaches PR creation; always creates a GitHub draft PR first.
---

# Sovereign Create PR

Create a GitHub pull request for the current Sovereign branch.

## Workflow

1. Read `AGENTS.md`, `docs/development-workflow.md`, and `CURRENT_TASK.md` if it
   exists.

2. Check the branch and worktree:
   - Run `git branch --show-current`.
   - Run `git status --short`.
   - Do not create a PR from `main`.
   - Do not commit, amend, rebase, or push unless the user has explicitly asked
     for that action in the current session.
   - If the branch has no pushed commits or the working tree still has
     uncommitted task changes, report the blocker instead of inventing a commit.

3. Confirm the PR target:
   - Target `main` until the post-v1 branch model changes.
   - Use the current branch as `--head`.

4. Prepare the PR title and body:
   - Do not include roadmap slot versions or epic task IDs in the title.
   - Summarize what changed and why.
   - Cite relevant SRS/RFC sections when useful.
   - Include verification commands and results.
   - End Codex-authored bodies with:
     `🤖 Generated with [Codex](https://developers.openai.com/codex)`

5. Create the PR as a draft:

   ```bash
   gh pr create --draft --base main --head <branch> --title "<title>" --body-file <body-file>
   ```

6. Report the PR URL and clearly state that it is a draft.

## Invariants

- All agent-created PRs start as GitHub draft PRs, even when the user simply
  says "create the PR".
- Do not mark a PR ready for review unless the human explicitly asks.
- Never merge a PR automatically.
