---
name: agent-rules
description: Analyse an existing Next.js project (including ones started in Lovable, v0, Bolt or Cursor, often with Supabase) and write a tailored AGENTS.md — the single rules file read by Cursor, Codex, Copilot and others — plus a CLAUDE.md that imports it for Claude Code. Rules come from the real project (package manager, exact commands, folder layout, auth, database, validation, env vars) instead of generic advice, and existing CLAUDE.md, AGENTS.md, .cursorrules, .cursor/rules and Copilot instructions are merged, not overwritten. Use when the user asks to write, improve or update CLAUDE.md or AGENTS.md, "set up rules for my coding agent", "make Cursor/Claude follow our conventions", or says "my agent keeps breaking X" / "keeps using the wrong command".
---

# Agent rules

Write an `AGENTS.md` that tells coding agents how **this** project works, and a `CLAUDE.md`
that imports it. The bundled script gathers facts; **you** confirm them by reading the code,
fill in what only the user knows, and write concise rules.

## 1. Gather facts

```bash
node <this-skill-dir>/scripts/inspect.mjs <project-path>
```

- Node 18+, no dependencies, read-only. `--json` for machine-readable output, `--out file` to
  save it (the only time it writes anything).
- It reports: package manager and lockfile, monorepo/workspaces, Node engine; Next/React/
  TypeScript versions and `strict` flags; App vs Pages Router, `src/`, `middleware.ts`/`proxy.ts`;
  libraries by area (ORM, DB client, auth, payments, validation, styling, shadcn/ui, state,
  email, testing, lint); every package.json script with the exact command to run it; a
  depth-2 directory map and where route handlers, server actions, schema, migrations,
  components and tests live; env var **names** from `.env.example` (values are never read) and
  the env validation module; existing agent instruction files; and gaps worth asking about.

## 2. Confirm by reading code

Detection is a starting point, not the truth. Before writing a rule, open the files it is about:

- The auth helper actually used in server actions and route handlers (e.g. `auth.api.getSession`,
  `auth()`, `supabase.auth.getUser()`), and how permissions/roles are checked, if at all.
- How queries are scoped: by `userId`, `organizationId`, Supabase RLS, or not at all.
- The db client and schema files; how migrations are generated and applied.
- One or two components and one server action, to see naming, import alias and form handling.
- `middleware.ts`/`proxy.ts`: what its matcher really protects.
- CI workflows: the commands CI runs are the ones that must pass.
- Every existing agent file listed in "Existing agent instructions".

If what you read contradicts the code's own patterns (half the actions validate input, half
don't), write the rule for the **intended** pattern and tell the user which files don't follow it.

## 3. Ask only what you can't infer

Ask in one short message, with your best guess for each so the user can just confirm:

- What the product does and for whom (one or two sentences).
- Non-negotiables: things an agent must never do here (touch billing without tests, change
  the schema without a migration, edit generated `components/ui`…).
- Anything recurring that agents get wrong ("my agent keeps breaking X") — those become rules.
- Gaps the script reported that need a decision (no typecheck script, `strict` off, no env
  validation): should the rule describe today's state or the target?

Don't ask about anything the facts or the code already answer.

## 4. Write AGENTS.md

Start from `<this-skill-dir>/templates/AGENTS.md`. Replace placeholders, delete sections that
don't apply, remove the template comments.

- **Concise:** aim for under 150 lines. Agents read the whole file every session; every line
  costs attention. Prefer one precise line to a paragraph.
- **Specific beats generic:** "Validate input with Zod (`src/server/*.ts` shows the pattern)" is
  a rule; "write clean code" is noise. Leave out anything that is true of every project.
- **Commands that actually work:** copy them from the facts (`Run with` column), using the
  detected package manager. For Vitest, make sure the test command doesn't start watch mode.
  In a monorepo, say where to run them from.
- **Real paths:** name the files and folders that exist, and the helpers by their real names.
- **Explain the non-obvious:** add a short reason when a rule isn't self-evident ("money is
  stored in cents — floats lose precision"), so the agent can apply it to cases you didn't list.
- **Security rules adapted to the stack:** auth + permission check + input validation in every
  server action and route handler; every query scoped by user/organization; secrets
  server-side only, never `NEXT_PUBLIC_`; verify webhook signatures; validate env at startup;
  no `any` without a reason. Name the project's helpers; drop rules for things it doesn't use.
- **No secrets:** list env var names only. Never copy values from any `.env*` file.
- Describe what is true **now**. If the user wants a target state (e.g. "move all env access to
  `src/env.ts`"), phrase it as a rule for new code and list the known exceptions.

## 5. Write CLAUDE.md

Use `<this-skill-dir>/templates/CLAUDE.md`: the first line is `@AGENTS.md` (Claude Code
imports the file, so rules live in one place). Add a "Claude Code specifics" section only for
things that are actually Claude-specific; otherwise the file is just the import.

## 6. Merge, don't overwrite

When `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*`, `.github/copilot-instructions.md`,
`.windsurfrules` or similar already exist:

- Read them all. Move every rule that is still true and useful into `AGENTS.md`; drop generic
  persona text ("You are an expert in…") and rules contradicted by the code (tell the user).
- An existing `CLAUDE.md` with real content: move its rules into `AGENTS.md`, then reduce it to
  `@AGENTS.md` plus Claude-specific notes.
- Don't delete the other tools' files without asking. Suggest replacing their content with a
  pointer ("Follow AGENTS.md") so the rules can't drift apart; `.cursorrules` is deprecated in
  favour of `.cursor/rules/` and Cursor reads `AGENTS.md` directly.
- In a monorepo, a root `AGENTS.md` covers everything; add a package-level one only for rules
  that differ there.
- Before writing, show a short diff summary per file: sections added, rules changed, rules
  removed and why. Write after the user agrees.

## 7. Finish

Report in a few lines:

- Files written or changed.
- **Inferred** from the code (stack, commands, paths, conventions) vs **asked** (purpose,
  non-negotiables) vs **assumed** (anything you guessed — ask the user to check those lines).
- Inconsistencies found (files that break a rule, rules from old files you dropped).
- Suggested fixes outside the rules files, e.g. add a `typecheck` script, enable `strict`,
  add `src/env.ts` — offer, don't do them unasked.
