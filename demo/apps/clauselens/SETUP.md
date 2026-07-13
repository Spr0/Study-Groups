# ClauseLens Demo - New-Machine Setup

Two separate things live here: **running the demo** (a Netlify/Vite app plus the
local Mailpit catcher) and **Claude Code** (how you work on it - not required to
run the demo). For the on-stage choreography once it is running, see
[DEMO-RUNBOOK.md](DEMO-RUNBOOK.md).

## 0. Prerequisites

- **macOS** (Apple Silicon or Intel). The Mailpit downloader `get-mailpit.sh` is
  macOS-only (it handles `darwin-arm64` / `darwin-amd64`). On Linux/Windows,
  grab a Mailpit binary manually into `agent-demo/.tools/mailpit`.
- **Node 20** (the app pins `NODE_VERSION=20`). Install from nodejs.org or
  `nvm install 20 && nvm use 20`.
- **git**, and an **Anthropic API key** (`sk-ant-...`) - only needed for the
  live path (see Notes).

## 1. Get the code

```bash
git clone https://github.com/Spr0/Study-Groups.git ~/projects/Study-Groups
cd ~/projects/Study-Groups/demo      # the npm workspace root
npm install                          # installs @sg/core, @sg/sample-data, the app
npm test                             # optional: should be all green
```

## 2. One-time demo setup

The demo PDFs are committed (no need to generate them). You only recreate the
gitignored bits - the Mailpit binary and `.env`:

```bash
cd ~/projects/Study-Groups/demo/apps/clauselens
sh agent-demo/get-mailpit.sh         # downloads Mailpit into agent-demo/.tools/ (gitignored)
printf 'DEMO_AGENT=1\n' > .env        # turns the local agent routes on (LOCAL ONLY; .env is gitignored)
```

Gitignored, so expected to be missing/fresh on a new clone: `.env`,
`agent-demo/.tools/` (Mailpit binary + seeded inbox DB), `agent-demo/drop/`,
`.netlify/`, `node_modules/`.

## 3. Install and set up Claude Code

```bash
npm install -g @anthropic-ai/claude-code
cd ~/projects/Study-Groups
claude                               # first run walks you through auth
```

- **Auth**: on first launch pick your Claude subscription (opens a browser) or an
  Anthropic Console API key - via the onboarding prompt or `/login` in-session.
  This is separate from the demo's `ANTHROPIC_API_KEY`; they can be the same key
  or different.
- **Context loads automatically**: the repo ships a root `CLAUDE.md`, which
  Claude Code reads on start, so it already knows the project. (`.claude/launch
  .json` is gitignored / machine-specific, and you do not need it - the demo runs
  via `netlify dev`, not the preview tool.)
- Claude Code is **not required to run the demo**; it is how you edit and extend
  it. Run `claude` from `~/projects/Study-Groups` so it sees the whole monorepo.
- Netlify CLI installs as a project dependency. To put `netlify` on your PATH
  globally: `npm install -g netlify-cli`.

## 4. Run the demo (4 terminals, from `demo/apps/clauselens`)

Full sequence in [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md); the short version:

```bash
# terminal 1 - Mailpit (SMTP 1025, inbox UI http://localhost:8025)
./agent-demo/.tools/mailpit --database agent-demo/.tools/mailpit-demo.db

# terminal 2 - the app + functions on http://localhost:8888
DEMO_AGENT=1 ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-sonnet-5 netlify dev

# terminal 3 - seed the fallback inbox (once the app + Mailpit are up)
node agent-demo/seed-inbox.mjs

# terminal 4 - the watched-folder agent
node agent-demo/watch-folder.mjs
```

Open two browser tabs: `http://localhost:8888` (app) and `http://localhost:8025`
(Mailpit). Per the runbook, clear Mailpit to zero before a clean run, then drop
`agent-demo/cascade-ridge-subcontract.pdf` (or `...-rev-b.pdf`) into
`agent-demo/drop/`.

## 5. Sanity checks

```bash
curl -s localhost:8888/api/demo/health         # -> {"ok":true,"demo":true}
curl -s localhost:8025/api/v1/messages | head  # Mailpit reachable
```

## Notes

- **The two demo contracts do not need the API key.** Both vetted contracts (the
  original and Rev B) short-circuit to their frozen review with no model call, so
  the core beats work even with a bad/absent key or wifi off. The key and
  `ANTHROPIC_MODEL` only matter when you drop a non-vetted PDF to show the live
  path.
- **Model**: `analyze.ts` reads `ANTHROPIC_MODEL` with no fallback (503 if unset).
  `claude-sonnet-5` is a good default for the extraction; any current model works.
  Do not set `temperature` anywhere - it is deprecated on current models and 400s.
- **Rev B never logs `(live)`** - it is frozen. For live-path checks, use any
  throwaway (non-vetted) PDF.
