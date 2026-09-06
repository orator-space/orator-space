# AGENTS.md

Rules for coding agents working in this repository.
Full context is in `SPEC.md`. What follows is the subset that gets broken most often.

## Requirement levels

`SPEC.md` carries over 250 MUST requirements, sorted into three levels (§0.5):

- **`[S]`** — affects the schema or a public contract; required from the first migration.
- **`[L]`** — required before public registration opens.
- **`[G]`** — required once a measured threshold is reached; earlier is premature.

Do not implement `[G]` requirements ahead of time. Do not defer `[S]` ones.

## Before writing code

- Read `SPEC.md`. It is the source of truth for architecture.
- Read `CONTEXT.md` for available resources and the division of responsibility. A resource
  being available is not a reason to introduce it into the architecture.
- Read `PLAN.md` for the order of work. Do not start a phase before its entry criteria are
  met, and respect each phase's "do not do in this phase" section.
- A divergence between the code and `SPEC.md` is either a bug or an ADR that was never
  written. Diverging silently is not an option.
- Changing an architectural decision means an ADR in `docs/adr/` first, then the `SPEC.md`
  edit, then the code.

## Invariants

Each of these would break quietly and cost a data migration.

1. **Identifiers are immutable.** Article, principal and revision ids never change and are
   never reused, including for deleted objects (SPEC §11, §23.2).
2. **One id per entity.** No internal/public pairs. UUIDv7 in Crockford base32 (§12).
3. **No polymorphic reference to an author.** Only `author_principal_id → principals(id)` (§7).
4. **Content lives in revisions, and revisions are immutable.** Do not add
   `content_markdown` to `articles`. Do not modify an existing revision (§16).
5. **Publishing moves the `published_revision_id` pointer**; it never copies content (§16.3).
6. **Content is reached only through `ContentStore`.** Never read `content_ref` directly (§16.2).
7. **A domain write and its outbox row go in one `db.batch()`.** Sending to the queue outside
   the transaction is not a substitute for the outbox (§35).
8. **Every queue consumer is idempotent by `event.id`.** Queues delivers at-least-once and
   does not guarantee order (§34.2).
9. **Cloudflare types do not cross the ports boundary.** `D1Database`, `R2Bucket`, `Queue`,
   `Request`, `Response` belong to `packages/adapters-cf` and `apps/*` only. Enforced in CI (§28.1).
10. **HTTP adapters do not touch storage.** They call application services (§28.1).
11. **Authorisation lives in the application service, not the adapter.** REST, MCP and the
    web app must reach the same verdict (§43.4).
12. **A response carrying `Authorization` is never publicly cacheable** (§33.2).
13. **Sanitisation happens at render time, not on write.** The stored markdown stays exactly
    what the author sent (§57.1).
14. **User media is served only from `media.orator.space`** (§57.4).
15. **Metrics and page views are never written to D1.** Analytics Engine only (§66.2).
16. **Every JSON blob in the database carries `schema_version`** (§46.4).
17. **Cursor pagination, never offset.** A maximum `limit` is mandatory (§44.2, §67).
18. **Errors follow RFC 9457**, with a stable `type` URI and `X-Request-Id` (§45).
19. **Circular foreign keys are not declared.** The key goes on the mandatory side only (§7.4).
20. **`erase` checks references before deleting an R2 object.** Content is deduplicated, so
    an unchecked delete destroys someone else's article (§23.3).
21. **`Vary: Accept` is not used on the HTML path.** Content variants live at separate URLs (§33.5).
22. **A browser session is never accepted on the API.** Tokens only (§9.1).
23. **Every metric carries `audience_class`.** Without it the product hypothesis cannot be
    tested (§66.5).
24. **Content is imported through the public API**, never by inserting into the database (§15.1).
25. **Cross-posting requires `canonical_url`** and exclusion from the sitemap (§15.1).
26. **The core runs on Cloudflare alone.** External services and self-hosted models are
    optional reinforcement, never the only implementation of a port (§66.6, §61).
27. **A validator covers the whole entity, template included.** A response the Worker
    *composes* — a page, a JSON envelope, a policy with its links rewritten — carries the
    build id in its `ETag`; one that is stored bytes and nothing else does not. An ETag over
    the content alone answers "unchanged" to a page a deployment has just rewritten, and the
    edge keeps the old one for its whole `stale-while-revalidate` window (§33.2).
28. **The public web reaches read-only ports, narrowed to the methods it uses.** Not
    `SearchIndex` but `{ query }`, not `AssetStore` but `{ get }`. A write from a page must
    fail to compile rather than fail review (§28, §49).

## Platform constraints that break naive code

- **D1 has no interactive transactions.** There is no `BEGIN … await … COMMIT`, only
  `db.batch()` or a single statement. The Unit of Work pattern is not implementable (§31.1).
- **Invariants are expressed as a `WHERE` condition**, not as a read before a write.
- **D1 permits 100 bound parameters per query.** Bulk inserts, backfills and outbox drains
  must be chunked, or they break silently as volume grows.
- **A queue message is capped at 128 KB.** Events carry identifiers, never content.
- **Migrations are forward-only.** Any incompatible schema change goes through
  expand/contract across several releases (§65).
- **Purge by tag is available on every plan but rate-limited to a few requests a minute.**
  Cache correctness comes from `s-maxage` plus `ETag`, not from purge (§33.1).
- **Image processing in a Worker is not viable** on CPU or memory. Transformations are a
  platform concern (§21.2).
- **The minimum Cron Trigger interval is one minute.** The outbox drain relies on direct
  delivery; cron is the safety net (§35.2).
- **`revision_id` is assigned by the server.** Signing a revision is a two-step protocol:
  create, then sign, then publish (§8.4).
- **A read after a write needs the Sessions API with a bookmark**, or a replica returns
  stale data (§31.2).
- **`tsc` does not read `.astro` files.** `pnpm typecheck` runs `astro check` after it for
  that reason. A page that reads a field the read model no longer has compiles, deploys, and
  renders an empty 200 — the exception is thrown after the status line is sent.

## Threat model

- All content is untrusted, including content produced by the platform's own agents.
- Orator's content ends up inside other models' context. Anything returned that contains
  user text is labelled as untrusted data (§58).
- Never log tokens, email addresses, raw IPs, private article bodies, or prompt contents (§66.3).

## Documentation has two audiences and one text

`docs.orator.space` is built from `apps/docs` (ADR 0013). What goes on it is decided by one
rule, and getting it wrong is cheap to do and expensive to notice.

**A file is rendered into the site when it has two audiences and one text.** The bytes are
copied by `scripts/sync-docs.mjs` into git-ignored destinations, and the site is not where
they are edited:

- `docs/openapi.json` — generated from `packages/protocol`, checked by `pnpm openapi:check`
- `skills/<name>/SKILL.md` — checked by `pnpm skills`
- `examples/research-agent/README.md` — §55's demonstration

**A file is linked when the two audiences want different texts.** `SPEC.md` and `docs/adr/`
are decision records: they carry `[S]`/`[L]`/`[G]` levels, open questions and rejected
alternatives, and they answer "why is it built this way" rather than "what do I do". They are
**not** rendered onto the site and are **not** paraphrased there. A documentation site that
paraphrases a specification produces two specifications, and the one people read is the
paraphrase.

`docs/policies/` is a third case: one text, two audiences, and the audience is a reader of the
network rather than a builder of clients — so it is imported by `apps/web`
(`src/lib/policies.ts`) and served from `orator.space`, not from the documentation site.

**MUST NOT.** Write a page that describes a skill, an ADR, an example or the OpenAPI document
in its own words. Render it, or link it.

**On cross-references.** A comment in code cites `SPEC §NN` — the audience is somebody
changing that code, and the specification is the source of truth. Do not repoint those at a
documentation page: the page is a rendering for a user, and making it the target of an
invariant inverts which document is normative. User-facing text is the opposite case and
should link the documentation site.

**The site builds separately, on purpose.** `apps/docs` is **excluded from `pnpm dev` and
`pnpm build`**. That is not an oversight to fix — `ci` already takes ten minutes and prose
should not add to it, nor wait on an application build.

```sh
pnpm docs:drift      # the written pages against the contract — this one IS in `pnpm check`
pnpm docs:check      # drift, then astro check, then the build with link validation
pnpm --filter @orator/docs dev     # localhost:4323
```

`pnpm docs:drift` is in `pnpm check` because what breaks it is a *code* change: adding a
scope, an error type or an MCP tool falsifies a sentence on a page nothing else would make
anybody open. `pnpm docs:check` is not, because a failing link check should not block a
change to the domain.

## Change discipline

- Monorepo. Do not create separate repositories.
- A new npm package only when it has a different consumer. A module boundary is a rule
  about who may import whom, not a `package.json` (§27, §73).
- A new service only with an ADR describing the measured problem it solves (§27).
- A new provider abstraction only when a second real implementation exists (§26.13, §69).
- OAuth 2.1 for MCP is not implemented: MVP authorisation is a bearer token (§42.3).
- A new dependency needs justification: works in the Workers runtime, maintained, acceptable
  size, compatible licence (§74).
- External systems — analytics, orchestrators, dashboards — stay out of the request path (§66.6).
- No in-house agent runtime until an external orchestrator becomes a measured constraint (§55.1).
- Prefer a simple architecture over a premature abstraction.
- Commit messages carry no `Co-Authored-By` trailer. The history records what changed and
  why, not which tool typed it; git already has an author field, and the project's own
  position on disclosure (§10) is that it belongs on the content, stated once, rather than
  stamped on every artefact.

## Git

This working tree is shared: more than one session works in this checkout at the same time.

### Stage the files you touched, by name

```sh
git status --short          # read it, and account for every line
git add path/one path/two   # the files you edited, named
```

**Never `git add -A`, `git add .`, `git commit -a`, or `git stash`.** The first three sweep up
whatever another session has half-finished; `git stash` is worse, because it *removes* their
work from the tree while they are editing it and the damage is not in the diff you are about
to read. Both were used freely in this repository until 2026-08-30, when a second session
turned out to be verifying backups in the same directory.

If `git status` shows something you did not write, leave it alone and say so. It is not
yours to commit, and pushing to `main` releases — so a stray file is not a messy commit, it
is a deployment of somebody's unfinished work.

### Two things that collide silently between parallel sessions

- **Migration numbers.** `ls packages/db/migrations | tail -1` immediately before creating one,
  and again before pushing. Two sessions both picking `0024` produces a merge nobody notices
  until the schema check fails on a deployment.
- **A migration landing mid-drill.** `restore-drill.mjs` restores an export into a fresh
  database and compares it. An export taken before your migration will not have your column,
  and the drill reports a real difference that means something other than what it looks like —
  not "the backup is broken" but "the schema moved while this was running". Ask before pushing
  a migration if a drill may be in flight.

## The local environment

### The dev server goes stale, and says so obscurely

`pnpm dev` skips starting the web app when one is already running — including one
left over from an earlier session, which holds a module graph from before your
edits. After changing a binding in `wrangler.jsonc` or anything under
`apps/web/src/lib/`, a 500 naming `deps_ssr/...` "does not exist in the optimize
deps directory" means exactly this:

```sh
pnpm --filter @orator/web exec astro dev stop
rm -rf apps/web/node_modules/.vite
pnpm dev
```

### The checkpoint's model-dependent failures are the local environment, not a regression

`node scripts/e2e-phase9.mjs` against a local dev server fails these, and they are not to be
fixed. Observed, not derived — the list is what a run actually prints:

```text
the article is classified                                    Workers AI
and is the produced variant rather than the original ...     Images
a query sharing no token with any article still returns some Workers AI + Vectorize
and they are about what the query asked for ...              Workers AI + Vectorize
the web search page answers the same query, not only the API Workers AI + Vectorize
and MCP answers it too, so all three surfaces agree ...       Workers AI + Vectorize
```

Named rather than counted, deliberately. The heading said "four" until the semantic checks
were rewritten and MCP was added, at which point the number was wrong and two of the four
names described checks that no longer existed — a note that tells a future reader the wrong
thing with total confidence. A list rots visibly; a count rots silently.

The four semantic ones are one absence with four faces: three of them are gated on the first
having returned something, so a deployment with no vector store fails all four together or
none of them.

`apps/edge/wrangler.jsonc` declares `ai`, `images` and `vectorize` per environment and
deliberately not in the top-level block the dev server reads — Workers AI has no local
simulator, and a binding here would turn a hermetic test into a paid network call. Vectorize
follows the same rule for a different reason: semantic search needs the model *and* the store,
so a deployment holding one of the two is a misconfiguration rather than a degraded mode. All
six pass against staging in CI, which is where they mean something. Anything else red locally
is real.

## Deployment

### Pushing to `main` deploys to production

`ci → staging → production` runs on every push (README, "Deployment"), so a push
is a release and not a save. Commit freely, in topics; push in batches, when a
piece of work is finished and `pnpm check` is green. A documentation-only commit
waits for the next batch of code rather than spending a deployment of its own.

### The web Worker's environment is chosen at *build* time, not at deploy time

On 2026-08-29 this overwrote the **production** `orator-web` script:

```sh
pnpm --filter @orator/web build
pnpm --filter @orator/web exec wrangler deploy --env staging
```

It names staging and it deployed production. The Astro adapter writes a *redirected*
configuration — wrangler says so, in a line easy to read past:

```text
Using redirected Wrangler configuration.
 - Configuration being used: "dist/server/wrangler.json"
 - Original user's configuration: "wrangler.jsonc"
```

That generated file is one flattened environment with no `env` blocks in it, so `--env` has
nothing to apply to and is silently inert. Which environment gets baked in is decided by
`CLOUDFLARE_ENV` **during the build**; with the variable unset the build flattens the
top-level block, which carries production's script name and the *local* development vars:

```json
{ "name": "orator-web", "vars": { "ENVIRONMENT": "local", "SITE_HOST": "localhost" } }
```

So the site kept answering 200 while `SITE_HOST` was `localhost` and the `QUOTA`, `AI` and
`VECTORS` bindings were gone. A 200 proves nothing here.

**Use the package scripts. They exist for this reason and they are what CI runs.**

```sh
pnpm --filter @orator/web  deploy:staging    # CLOUDFLARE_ENV=staging, then deploy the built config
pnpm --filter @orator/edge deploy:staging    # the edge Worker has no redirect; --env works there
```

Then read the environment line in the output before believing it. `orator-web-staging` and
`ENVIRONMENT ("staging")` are the confirmation; `orator-web` is production.

### gh and wrangler are authenticated

Production is deployed by GitHub Actions only (CONTEXT.md, §64.3). A local
`wrangler deploy` to production bypasses the release path even when it works.

- local first — `wrangler d1 execute --local`, `pnpm dev`
- staging is the place to try a real deployment
- `orator-docs` is the exception with no staging to try: it has one environment and it is
  production, so a local deploy of it is a production deployment (ADR 0013)
- `--remote` against production, `wrangler secret`, and production migrations
  need an explicit instruction naming the environment
- CI feedback — `gh run watch`, `gh run view --log-failed`
- `wrangler tail` for live Worker logs

Reading production is not a write: `wrangler tail`, the listing commands and a `d1 execute`
whose `--command` is a `SELECT` are fine. `--file` is not a read — what it holds can change
between a check and the run.

## Not without explicit instruction

- Changing production infrastructure.
- Applying migrations to production.
- Publishing packages.
- Committing and pushing, unless asked.
- Adding fields or tables for entities absent from `SPEC.md` — `publications`, for
  instance (§6, §15).
