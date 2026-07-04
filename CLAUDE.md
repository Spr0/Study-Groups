# Study Groups - Claude Operating Manual

Platform repo for the Study Groups AI Pilot Workshop demos. Shared review
engine (`demo/packages/core`) + content (`demo/packages/sample-data`) consumed
by independently deployable apps (`demo/apps/*`), each on its own Netlify
site. Read `demo/README.md` for the architecture. Repo lives at
`~/Projects/Study-Groups`.

Last reconciled 2026-07-04. Verify anything time-sensitive before acting.

---

## Environment (this Mac)

- **Node 20 via nvm** (user-space, no sudo). Non-interactive shells may need:
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"`.
- **netlify-cli** installed globally and authenticated (token in
  `~/Library/Preferences/netlify/config.json`; never print or commit it).
- No Homebrew. No gh CLI (install + `gh auth login` with Scott present if
  needed; GitHub work otherwise goes through plain git and the REST API).
- Claude Code sandbox quirk: spawned preview processes can inherit an
  unreadable cwd; use a launcher that `chdir`s explicitly (a bare
  `python3 -m http.server --directory X` dies at import time).

Workspace commands (from `demo/`): `npm install`, `npm run typecheck`,
`npm test`, `npm run lint`, `npm run dev:submittal`, and per-app
`npm run build` inside `apps/<name>`.

## Netlify sites and deploys

| App | Site | site_id |
|-----|------|---------|
| RFI Drafter (`demo/apps/rfi`) | studygroupsdemo.netlify.app | `84165156-8ce9-4b57-8d3f-e7a277216824` |
| Submittal Review (`demo/apps/submittal`) | studygroups-submittal.netlify.app | `2c97b362-024c-4429-98c8-91ffc13a4e7a` |

Both sites are **git-linked** to `github.com/Spr0/Study-Groups`, production
branch `main`, base directory `demo`, package directory `demo/apps/<app>`.
**A push to main deploys both sites; no local tooling is involved.** Each
site carries its own `ANTHROPIC_API_KEY` env var.

**The netlify.toml quirk (do not regress this):** in package-directory mode,
Netlify reads the app's `netlify.toml` from the package directory and runs
the build command there, but resolves `publish` and `functions.directory`
against the BASE directory (`demo`). Those paths must therefore be written
base-relative (`apps/<name>/dist`, `apps/<name>/netlify/functions`). Writing
`dist` breaks the deploy stage with "Deploy directory 'demo/dist' does not
exist" - this exact bug made every git build fail from 2026-06-30 until
fixed in commit `4e157d1`.

New app checklist: new Netlify site on the same team, git-link it with base
`demo` / package `demo/apps/<name>` / branch `main`, set `ANTHROPIC_API_KEY`,
and copy an existing app's netlify.toml (keeping the base-relative paths).

When deploying by hand (rare now): do a `?draft=true` API deploy or
`netlify deploy` preview first, smoke-test the permalink (page, assets,
`POST /api/draft` with a bogus body returns 400 JSON), then promote.

## Design system

The canonical skin is on the RFI app, implemented from the Claude Design
handoff `RFI Drafter.dc.html` ("Logo redesign for RFI drafter" project).
Source of truth: `demo/apps/rfi/index.html` + `demo/apps/rfi/src/styles.css`
(token overrides on top of core styles).

Tokens: navy `#14208A` (brand), red `#C4341F` (labels/accents), page cream
`#F4F1EB`, hairline `#DAD5C7`, ink `#171717`, muted `#8C8775`, ROI panel
`#EBEEF5` / `#D7D2C2`, disabled `#B7B2A2`. Type: Helvetica Neue system stack
+ IBM Plex Mono (Google Fonts, 400/500/700). Flat 3px radii, white cards,
uppercase micro-labels.

Two behavior fixes live in the RFI app CSS and belong in ANY app using this
skin (or better, in core):
1. `[hidden] { display: none !important; }` - core sets `display: flex` on
   `.draft-toolbar`, defeating the HTML hidden attribute.
2. Re-assert `.panels { grid-template-columns: 1fr }` inside the 920px media
   query if the app overrides the desktop grid, or mobile never stacks.

**Open decision (Scott):** if all apps adopt this skin, move the tokens and
fixes into `packages/core/src/styles.css` once and restyle submittal, rather
than copying the override file per app.

## Work queue

1. **Migrate ClauseLens into the platform** as `demo/apps/clauselens` on
   `@sg/core` (template: commit `eddade2`, which migrated RFI onto core).
   ClauseLens repo: `~/Downloads/ClauseLens_repo` (main @ `8151eca`, already
   conforms to the core sign-off block); site `clauselens.netlify.app`
   (`7341ebf2-7d36-4025-8a91-b8b74763a5d1`), currently git-linked to
   `Spr0/ClauseLens`. Diff its features against core first (e.g. TXT upload,
   raise list); list gaps for Scott before porting. App shell from `apps/rfi`
   so the new skin comes along. Repoint the existing Netlify site to this
   repo (base `demo`, package `demo/apps/clauselens`, branch `main`). Only
   after live verification: archive `Spr0/ClauseLens` (Scott confirms),
   delete `~/Downloads/ClauseLens_repo` and the loose non-git copy
   `~/Downloads/ClauseLens`.
2. **Two new apps** per `demo/README.md` "How to add a use case": content
   module + tests in sample-data, app copied from `apps/rfi`, site per the
   checklist above. Confirm use cases with Scott (Contract Review has a
   worked example in the workshop kit).
3. **Docs**: `demo/README.md` is stale - it still describes the deleted
   `demo/app` and the CLI-only deploy story; update it to the git-linked
   monorepo reality and add ClauseLens when it lands.
4. **Leftover cleanup**: move `~/Downloads/pacing-iq` to `~/Projects/PacingIQ`
   after removing its last worktree (`.claude/worktrees/stoic-cray-964e9f`,
   in use by the 2026-07-04 session; its branch
   `claude/trusting-bartik-d813cf` is fully merged - remove worktree, then
   delete branch). Ask Scott about the untracked `Handoff/` folder there and
   the duplicate workshop material in `~/Downloads` (`SG workshop/`,
   `study-groups-kit-src*.zip`).

## Standing rules

- No em dashes in app copy or generated text. Approval language stays
  "internal named review", never "signature".
- Never commit or print the Netlify token or `ANTHROPIC_API_KEY`.
- Verify before deleting: branches must show 0 commits ahead of main (check
  both local and origin tips) before removal.
- Destructive actions beyond gitignored artifacts (archiving repos, deleting
  folders): confirm with Scott first.
