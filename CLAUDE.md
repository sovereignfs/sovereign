# CLAUDE.md

The conventions for this repository live in [AGENTS.md](AGENTS.md), shared by
every agent. Claude Code loads it through the import below; do not copy its
content here.

@AGENTS.md

Claude Code specifics: the task lifecycle skills are in `.claude/skills/`
(byte-identical copies of `.agents/skills/`), and your commit trailer is
`Co-Authored-By: Claude Code <noreply@anthropic.com>` — model-agnostic, even if
your harness suggests a model-specific one.
