# New-Machine Bring-Up

A concise checklist to get this repo running and developable on a fresh Mac. For
the demo's full setup and on-stage run, see
[`demo/apps/clauselens/SETUP.md`](../demo/apps/clauselens/SETUP.md) and
[`demo/apps/clauselens/DEMO-RUNBOOK.md`](../demo/apps/clauselens/DEMO-RUNBOOK.md).

## Prerequisites

- **macOS** (Apple Silicon or Intel).
- **Homebrew**.

## 1. Tooling

```bash
brew install node@20 gh
npm install -g netlify-cli @anthropic-ai/claude-code
```

Node 20 specifically — the app pins `NODE_VERSION=20`.

## 2. Clone

```bash
git clone https://github.com/Spr0/Study-Groups.git ~/projects/Study-Groups
cd ~/projects/Study-Groups/demo
npm install
npm test          # optional sanity check: should be all green
```

If the repo is private, authenticate first (`gh auth login`) or the clone fails.

## 3. Demo setup and run

Follow [`demo/apps/clauselens/SETUP.md`](../demo/apps/clauselens/SETUP.md): it
creates `.env`, downloads the pinned Mailpit binary, and starts the four local
processes. The demo PDFs are committed, so there is no generation step.

## 4. Claude Code

```bash
cd ~/projects/Study-Groups
claude            # then /login (Claude subscription or Anthropic API key)
```

Claude Code config and memory do **not** transfer between machines, and you do
not need them to: the repo ships a root `CLAUDE.md`, which Claude Code loads on
start, so it already has the project context. Running `claude` from the repo
root lets it see the whole monorepo.

## Notes

- **Keyless-friendly.** The two vetted demo contracts short-circuit to a frozen
  review with no model call, so the core demo runs with **no `ANTHROPIC_API_KEY`
  at all**. Set a key (and `ANTHROPIC_MODEL`, e.g. `claude-sonnet-5`) only to
  show the live path on a non-vetted PDF.
- **Never commit secrets.** `.env` is gitignored; pass the key inline on the
  `netlify dev` command rather than committing it.
- **Do not send `temperature`** to the model — it is deprecated on current
  models and returns a 400.
