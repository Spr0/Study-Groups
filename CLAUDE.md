# Study Groups - Claude Cowork Instructions

Platform repo for the Study Groups AI Pilot Workshop demos. Shared review engine
(`demo/packages/core`) + content (`demo/packages/sample-data`) consumed by
independently deployable apps (`demo/apps/*`), each on its own Netlify site.
Read `demo/README.md` for the architecture; this file covers environment setup,
repo hygiene, and the active work queue.

State captured 2026-07-04. Verify anything time-sensitive (branches, deploys)
before acting on it.

---

## 1. Environment: fix these first (one-time)

This Mac has NO Node runtime (no node/npm, no brew, no nvm). Everything in the
normal toolchain (vite, vitest, tsc, eslint, prettier, netlify CLI) is blocked
until that changes.

**Ask Scott to install, in priority order:**

1. **Node 20 LTS** - no Homebrew here, so use the official installer from
   nodejs.org, or install nvm first. This unblocks dev servers, tests,
   typecheck, prettier, and normal builds.
2. **netlify-cli** (`npm i -g netlify-cli`) - auth already exists; the CLI
   token lives in `~/Library/Preferences/netlify/config.json` (do not paste it
   into files or chat).
3. **gh CLI** (optional) - not installed; GitHub work currently goes through
   plain git + the public REST API.

**The bigger idealization: link the Netlify sites to GitHub.** Both sites
currently deploy from CLI uploads only (`deploy_source: "cli"`, no git link),
which is why deploys depend on a local build. In the Netlify UI, link each site
to `github.com/Spr0/Study-Groups` with:
- package directory: `demo/apps/<app>` (monorepo support)
- production branch: `main`
- env var `ANTHROPIC_API_KEY` already set per site; builds use the per-app
  `netlify.toml` (Node 20 in the cloud)

Once linked, a merge to `main` deploys everything with zero local tooling.
That removes the Node barrier from the deploy path entirely; local Node is
then only needed for dev and tests.

### Sandbox quirks (Claude Code on this machine)

- Spawned preview processes can inherit an unreadable cwd; `python3 -m
  http.server --directory X` dies at import time on `os.getcwd()`. Use a
  launcher script that `os.chdir()`s first, or any config that sets cwd
  explicitly.
- The pacing-iq worktree's `.claude/launch.json` gained a session-scoped
  `rfi-app` entry pointing at a temp scratchpad; delete that entry when seen,
  it does not survive the session.

### No-Node fallback playbook (tested, works today)

Use only until Node is installed / sites are git-linked:

- **Build**: the native esbuild binary at `demo/node_modules/.bin/esbuild`
  runs without Node. Production build of an app:
  `cd demo/apps/<app> && ../../node_modules/.bin/esbuild src/main.ts --bundle
  --minify --format=esm --target=es2022 --entry-names=index --outdir=<out>/assets`
  then copy `index.html`, rewrite `/src/main.ts` to `/assets/index.js` and add
  a `<link>` to `/assets/index.css` (esbuild emits imported CSS separately, it
  does not inject it).
- **Preview**: serve the output with `python3` + a chdir launcher script.
- **Deploy**: Netlify API digest deploy. POST
  `api.netlify.com/api/v1/sites/<site_id>/deploys` with
  `{"files": {"/path": "<sha1>"}, "functions": {"draft": "<sha256>"}}`, upload
  whatever comes back in `required` via PUT
  `/deploys/<id>/files/<path>`. For an unchanged serverless function, pass the
  digest from the site's current deploy (`available_functions[].d`) and Netlify
  reuses it from cache: `required_functions` comes back empty and routes are
  preserved. Always do a `?draft=true` deploy first, smoke-test the permalink
  (page, assets, POST `/api/draft` with a bogus body expecting a 400 JSON
  error), then repeat without `draft` to publish. This is exactly how the
  2026-07-04 RFI reskin shipped.

---

## 2. Netlify sites

| App | Site | site_id | Status |
|-----|------|---------|--------|
| RFI Drafter (`demo/apps/rfi`) | studygroupsdemo.netlify.app | `84165156-8ce9-4b57-8d3f-e7a277216824` | live, new skin (2026-07-04) |
| Submittal Review (`demo/apps/submittal`) | studygroups-submittal.netlify.app | `2c97b362-024c-4429-98c8-91ffc13a4e7a` | live, OLD skin |

Each new app gets its own site (same team), package directory
`demo/apps/<name>`, and its own `ANTHROPIC_API_KEY` env var.

---

## 3. Branch cleanup (the "dangling PRs")

There are no open PRs on GitHub; the dangling work is two unmerged, stacked
branches, while production already runs the tip commit:

```
main
 └─ feat/submittal-review        (+2: submittal app, netlify.toml split)
     └─ feat/sg-core-roi-signoff (+3: core ROI/sign-off, RFI-on-core, RFI reskin 699f52b)
```

`feat/sg-core-roi-signoff` is a strict superset of `feat/submittal-review`.
Both deployed sites are built from it. **Action: merge
`feat/sg-core-roi-signoff` into `main` (fast-forward), push, then delete both
feature branches locally and on origin.** If Scott prefers review, open a
single PR from `feat/sg-core-roi-signoff` to `main` instead; do not open two.
After the merge, set the Netlify git-link production branch to `main`
(section 1) so main and production can never drift apart again.

---

## 4. File-structure cleanup

All gitignored or doc-level, safe to do any time:

- Delete the stray nested CLI artifacts `demo/apps/rfi/demo/` and
  `demo/apps/submittal/demo/` (old `netlify deploy` runs wrote their function
  zips into a mirrored path inside each app).
- `demo/apps/*/dist/` are stale local builds (RFI's still has the old skin).
  Delete; they regenerate on build and are gitignored.
- `demo/README.md` is stale: it says the RFI app lives at `demo/app` and omits
  `apps/rfi` from the tree diagram. It has since been migrated to
  `demo/apps/rfi` on the shared core. Update the README when touching it next.
- **`~/Downloads/CLAUDE.md` is a hazard**: it holds instructions for a
  different project (NarrativeOS job-search app) and is inherited by every
  Claude session whose cwd is anywhere under `~/Downloads`, including this
  repo. Ask Scott before moving it, then relocate it into the NarrativeOS repo
  so it stops leaking into unrelated sessions.
- `~/Downloads` also holds overlapping copies of workshop material
  (`Study-Groups/`, `SG workshop/`, `study-groups-kit-src*.zip`). Flag for
  Scott; do not delete on your own.

---

## 5. Design system (the new skin)

The canonical skin is the one shipped on the RFI app, implemented from the
Claude Design handoff `RFI Drafter.dc.html` (project "Logo redesign for RFI
drafter"; a copy of the handoff zip may still be in `~/Downloads`).

Source of truth in code: `demo/apps/rfi/index.html` +
`demo/apps/rfi/src/styles.css` (token overrides on top of core styles).

Core tokens: navy `#14208A` (brand), red `#C4341F` (labels/accents), page
cream `#F4F1EB`, hairline `#DAD5C7`, ink `#171717`, muted `#8C8775`, ROI panel
`#EBEEF5` / `#D7D2C2`, disabled `#B7B2A2`. Type: Helvetica Neue system stack +
IBM Plex Mono (Google Fonts, weights 400/500/700). Flat 3px radii, white cards,
uppercase micro-labels.

Two behavior fixes live in the RFI app CSS and belong in ANY app using this
skin (or better, in core):
1. `[hidden] { display: none !important; }` - core sets `display: flex` on
   `.draft-toolbar`, which defeats the HTML hidden attribute (Edit button
   shows before a draft exists).
2. Re-assert `.panels { grid-template-columns: 1fr }` inside the 920px media
   query if the app overrides the desktop grid, otherwise mobile never stacks.

**Decision needed from Scott before the next two apps:** if all apps adopt
this skin, move the tokens and these fixes into `packages/core/src/styles.css`
once (and restyle submittal), instead of copying the override file per app.
Per-app copies are how the architecture describes "brand chrome", but three
copies of an identical skin is drift waiting to happen.

---

## 6. The two new apps (work queue)

Follow `demo/README.md` "How to add a use case" exactly; it is accurate. Per
app:

1. Content module in `demo/packages/sample-data/src/<use-case>.ts` exporting a
   `UseCase` (reuse `CASCADE_RIDGE`), plus tests beside it (`buildPrompt`
   output, `validateUseCase`, `resolveCase` fallback). Export from the package
   index.
2. App folder `demo/apps/<name>` copied from **`apps/rfi`** (not submittal, so
   the new skin and its two fixes come along): `src/main.ts` wires
   `createReviewApp`, `netlify/functions/draft.ts` wires `createDraftHandler`,
   own `index.html` (update title, masthead purpose line, hero eyebrow/h1/lede,
   footer), `netlify.toml` is app-relative and needs no edits.
3. New Netlify site, package directory `demo/apps/<name>`, env
   `ANTHROPIC_API_KEY`, git-linked to `main` (section 1).
4. Verify before calling it done: example select populates docs + prompt,
   offline-fallback draft renders, review checklist + named signer gates
   Approve/Export/Copy/Print, ROI panel math, mobile stacking at 375px,
   and live `/api/draft` on the deployed site.

Candidate use cases per the workshop kit (confirm with Scott): Contract
Review (worked example exists in the kit uploads) and one more from the kit's
recipe cards.

No em dashes in any app copy or generated text; the repo strips them
deliberately (see commit history). Approval stays framed as an internal named
review, not a signature.
