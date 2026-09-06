# CLAUDE.md

@AGENTS.md
@CONTEXT.md

Everything about the project — invariants, platform constraints, git and deployment
discipline, the local environment, the threat model — is in AGENTS.md, so that any tool
reading it gets the same rules. This file holds only what is specific to this harness.

## SPEC.md and PLAN.md are read in parts

SPEC.md is 306 KB (~76k tokens); PLAN.md is 97 KB. Never read either in full —
`Read` without a range on them is not allowed. "Read `SPEC.md`" in AGENTS.md
means locate the relevant sections:

- table of contents — `grep -n '^## \|^### ' SPEC.md`
- one section — `awk '/^## 33\./,/^## 34\./' SPEC.md`
- one subsection — `awk '/^### 61\.1/,/^## 62\./' SPEC.md`
- one requirement — `grep -n 'MUST.*outbox' SPEC.md`

Most requirements live in subsections, so a table of contents listing only `##`
hides them and the range for one has to end at the next `##`.

Loading the whole specification does not only cost context: it puts the `[G]`
requirements in front of the model alongside the `[S]` ones, and they get built
early.

## No Co-Authored-By trailer

The rule and its reasoning are in AGENTS.md, "Change discipline". Restated here because some
agent harnesses add the trailer by default and would otherwise never consult a project file
about it. Format follows the history.

## The wrangler guard is a hook, and it runs only here

`.claude/hooks/guard-wrangler.sh` blocks the invocations that deploy or overwrite production
by accident, as a `PreToolUse` hook. It is a Claude Code mechanism; the rules it enforces are
in AGENTS.md, "Deployment", and they hold with or without it.

A guard that blocks reading gets turned off, so `wrangler tail`, the listing commands and a
`d1 execute` whose `--command` is a `SELECT` still work against production — it is the writes
that are stopped. `--file` is not a read there: the guard would have to open it, and what it
holds can change between the check and the run. `orator-docs` is denied by name rather than
by demanding an `--env staging` that does not exist for it.

Its decisions are recorded as cases, and they run:

```sh
bash .claude/hooks/guard-wrangler.test.sh   # after editing the guard or its cases
```

## Answers in chat are short and plain

**Replies to the operator only.** Commit messages, `SPEC.md`, `PLAN.md`, ADRs and code
comments are written for a reader a year from now and are not covered by this.

Answer in whatever language the operator writes in, and write it the way somebody speaks that
language — not as a translation of an English sentence. Everything below is about the shape of
the answer and holds in any language.

- **The conclusion first.** The first line says what was done, or what is wrong. Detail
  follows.
- **One thought per sentence.** No nested clauses, no chains of em dashes, no sentence that
  has to be read twice.
- **Length.** An ordinary answer is 3–10 lines. A report on a large piece of work is headings
  and short bullets — not a retelling of what the commits already say.
- **Say a thing once.** The reasoning behind a decision is given in its shortest form; the
  long version belongs in the commit and in `PLAN.md`.
- **Caveats and risks go in one block at the end**, not woven through every sentence.
- File names, commands, tables and columns keep their own spelling, untranslated.

Bad: "Which is exactly what §13.38 describes as the thing using a product finds and testing
does not — four defects in the queue in twenty minutes, after both features had passed tests,
checkpoints and a live verification each."

Good: "Not verified by hand yet. §13.38 says that is where the defects turn up."
