# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# MediFind Backend

Express + Mongoose REST API. [README.md](README.md) documents every endpoint, the data model and the
known issues; [docs/backend-readiness.md](docs/backend-readiness.md) records what was actually
measured. Read those rather than inferring behaviour from the handlers.

## `MONGO_URI` has no database name — read this before running anything

`MONGO_URI` ends at the host, so **a bare `npm start` connects to mongo's default `test` database,
which is where the production data lives.** There is no guard against this.

- **Never point a manual run at the raw `.env` value** if it might write.
- `npm run smoke` is safe on its own: `smokeUri()` in [smoke.js](smoke.js) rewrites the URI to a
  throwaway `medifind_smoke` database and empties it afterwards.
- For anything else, set `MONGO_URI` explicitly to a database you are willing to lose.

## Verification

```bash
PORT=3100 npm run smoke      # 3000 is often held by an unrelated next-server
```

**Baseline: 21/21 pass.** Anything less is a regression — compare against the table in the readiness
report rather than assuming a failure is pre-existing.

Two checks are gated on live external services, and both gates are deliberate:

| Gate | Effect |
|---|---|
| `SKIP_OCR=1` | Skips the `POST /nlp` happy path, the only call to the Azure OCR container. The missing-file crash check still runs. |
| `OPENAI_API_KEY` unset or placeholder | Skips `GET /chatBot`. A real key means the run makes a live, billed call. |

`npm test` exits 1 by design. There are no unit tests; the smoke suite is the only automated coverage.

## Working on this codebase

- **The known issues in the README are catalogued deliberately, not overlooked.** Several are load-bearing
  for the existing client — the `"sccuess"` typo, the doubly-nested `reply.reply`, `GET /chatBot`
  reading a body. Do not fix them incidentally while doing something else; changing one is an API
  break that needs its own decision.
- **The layout is flat on purpose** — routes in [app.js](app.js), every handler in
  [component.js](component.js). Don't introduce `routes/` or `controllers/` without being asked.
- **`vie.json` is 57 MB and parsed at require time.** Loading it in a throwaway script costs ~230 ms
  and a ~319 MB memory peak, so prefer `--max-old-space-size` headroom over assuming it will fit.
- The frontend is a sibling repo at `../medifind-fe-v2` (Expo/React Native). It is not yet wired to
  this API; the gap between what it expects and what this serves is mapped in the readiness report.
