# Aether — Claude Skill

A [Claude skill](https://docs.claude.com/en/docs/claude-code/skills) that teaches Claude **when** and **how** to use the Aether MCP verification tools to catch AI hallucinations. It pairs with the [`mcp-worker/`](../mcp-worker) MCP server: the worker exposes the tools, this skill teaches Claude to reach for them.

## What it does

When installed, Claude auto-activates `aether-verify` whenever you want to fact-check, trust-check, or validate an AI answer, catch a hallucination, or pull a signed warrant — and it knows to:

- call `verify_claim` to run the tribunal and get a verdict + trust score + `verification_id`,
- call `explain_verdict` / `get_warrant` to recap or fetch the full signed proof of a prior check,
- interpret the verdict/trust bands honestly, and
- never touch secrets or fabricate a result when a tool errors.

## Prerequisite

The **Aether MCP server must be connected** to your Claude client first — see [`mcp-worker/README.md`](../mcp-worker/README.md). The skill's tools are `mcp__aether__verify_claim`, `mcp__aether__explain_verdict`, and `mcp__aether__get_warrant`; if the server isn't connected they won't exist and the skill will tell you to connect it.

## Install

Copy the `aether-verify/` folder into your Claude skills directory:

**Claude Code / Claude Desktop (personal, all projects):**

```bash
cp -r aether-verify ~/.claude/skills/
```

**A single project/repo:**

```bash
cp -r aether-verify /path/to/your/project/.claude/skills/
```

Restart Claude (or reload skills). Then in any chat, ask something like *"verify this with Aether"* or *"is this claim trustworthy?"* and the skill fires.

## Files

- `aether-verify/SKILL.md` — the skill (YAML frontmatter + instructions). This is the whole thing; skills are just a folder with a `SKILL.md`.
