# Study Groups - document-review platform

A small, well-architected platform that turns one fictional construction project
(Cascade Ridge Construction / Lakeview Medical Office) into multiple AI document-review
use cases that each demo and deploy on their own. The headline is not "a second demo";
it is "a platform that generalizes": adding a use case is a new module, not a rewrite.

Augment, not automate: the AI drafts, a named human reviews and approves. Nothing is
stored; a refresh clears everything.

## Architecture (one paragraph)

Shared packages are consumed by independently deployable apps. `packages/core` is the
review engine: the three-panel UI, the prompt-assembly contract, the streaming model call,
the human-in-the-loop gate, copy-out, and the serverless handler factory. It knows nothing
specific about any one use case. `packages/sample-data` holds the one fictional project and
the per-use-case content (documents, instances, prompt builder, checklist, fallbacks). Each
app under `apps/*` imports those two packages, supplies its use case(s), and ships its own
Vite build and its own Netlify Function instance, to its own Netlify site. Apps never import
one another. The API key lives only in the function's environment and never reaches the
browser.

```
demo/
  packages/
    core/          shared review engine + @sg/core/server handler factory
    sample-data/   Cascade Ridge project + per-use-case content
  apps/
    submittal/     standalone deployable app  -> its own Netlify site
  app/             the original RFI app (separate, independently deployed; untouched)
```

The contract every use case implements lives in `packages/core/src/types.ts` (`UseCase`).
A use case is **data plus a few pure functions**; it never touches core internals.

## How to add a use case

1. **Write the content module** in `packages/sample-data/src/<your-use-case>.ts` that
   exports a `UseCase`:
   - `id`, `label`, `outputType`, `project` (reuse `CASCADE_RIDGE`).
   - `instances`: the dropdown options, each with `documents` and a vetted `fallbackDraft`.
   - `systemPrompt`: the careful-reviewer instructions for the model.
   - `buildPrompt(input)`: a **pure** function that assembles the exact prompt (this same
     string is shown in panel 2 and sent to the model, so there is one source of truth).
   - `reviewChecklist`, `approval`, `standingLine`, `freeTextFallback`.
   - Optional UI polish: `runLabel`, `inputNoun`, `freeTextPlaceholder`.
   Export it from `packages/sample-data/src/index.ts`.
2. **Add tests** next to it: `buildPrompt` output, config validity (`validateUseCase`),
   and fallback selection (`resolveCase`).
3. **Create the app** `apps/<name>/` (copy `apps/submittal` as a template):
   - `src/main.ts`: `createReviewApp(root, { useCase: yourUseCase })`.
   - `netlify/functions/draft.ts`: `createDraftHandler({ useCases: [yourUseCase] })`.
   - its own `index.html`, `vite.config.ts`, brand chrome in `src/styles.css`.
4. **Give it a Netlify site** of its own (see Deploy). The other apps are unaffected.

No core code changes are required to add a use case. That is the point.

## Develop

```bash
cd demo
npm install                 # workspaces: links @sg/core and @sg/sample-data
npm run typecheck           # tsc strict, whole workspace
npm run lint                # eslint
npm test                    # vitest: buildPrompt, config, fallback, approval, handler
npm run dev:submittal       # vite dev for the submittal app
```

To run the full app with its function locally (vetted fallback when no key is set):

```bash
cd apps/submittal
netlify dev                 # serves the client and /api/draft
# export ANTHROPIC_API_KEY=sk-ant-...  for live drafts
```

## Deploy (each app to its own Netlify site)

The submittal app deploys as a **monorepo package**. In Netlify, set the site's
**package directory to `demo/apps/submittal`**; Netlify installs dependencies at the
workspace root (so `@sg/core` and `@sg/sample-data` resolve), then builds only this app.
Config lives in `apps/submittal/netlify.toml`:

- Build command: `npm run build` (Vite)
- Publish: `dist`
- Functions: `netlify/functions`
- Env var: `ANTHROPIC_API_KEY`, set in the site settings (never committed).

CLI (this is what produced the preview): from `demo/apps/submittal`, run
`netlify deploy --build --site <id>` for a draft deploy, then add `--prod` to promote.

The RFI app is a separate Netlify site with base directory `demo/app`; it reads its own
`demo/app/netlify.toml` and is unaffected by the submittal site.

## Security and safety

- The Anthropic key is read only from `ANTHROPIC_API_KEY` in the function environment; it
  is never in client code or any payload sent to the browser.
- Input length is capped; a light per-IP rate limit is applied.
- Any model or network failure falls back to a vetted saved-example draft.
- No persistence of any kind.
