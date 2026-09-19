# AGENTS.md

Instructions for any AI agent (or human) working in this repo. Read this first.

## 📋 Bookkeeping rules (do this every session — non-negotiable)

1. **When you finish a task, tick it in [`TODO.md`](./TODO.md)** — change `[ ]`/`[x]`, and add a time dated line to the **Done log** for bigger updates at the bottom.
2. **When you start a task, mark it `[~]`** so teammates don't collide.
3. **When the plan or architecture changes, update [`project.md`](./project.md)** —
   decisions table, architecture diagram, or phases — in the *same* change that makes
   the change real. Never let the plan drift from the code.
4. Keep both files terse and scannable. They are the team's shared source of truth.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
