# Create PR

Create a Sovereign pull request for the current branch.

## Steps

1. Read `CLAUDE.md`, `docs/development-workflow.md`, and `CURRENT_TASK.md` if it
   exists.

2. Check branch and worktree state:

   ```bash
   git branch --show-current
   git status --short
   ```

   - Do not create a PR from `main`.
   - Do not commit, amend, rebase, or push unless the developer explicitly asks
     for that action in the current session.
   - If the branch has no pushed commits or the working tree still has
     uncommitted task changes, stop and report what is needed before PR
     creation.

3. Prepare the PR title and body:
   - Describe the work by what changed; do not include roadmap slot versions or
     epic task IDs.
   - Summarize what changed and why.
   - Cite relevant SRS/RFC sections when useful.
   - Include verification commands/results.
   - End Claude-authored bodies with:
     `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

4. Create the PR as a GitHub draft:

   ```bash
   gh pr create --draft --base main --head <branch> --title "<title>" --body-file <body-file>
   ```

5. Report the PR URL and state that it is a draft.

## Rules

- All agent-created PRs start as draft PRs, even when the developer simply says
  "create the PR".
- Mark ready for review only after explicit developer instruction.
- Never merge a PR automatically.
