# GC RFI Demo

A single-purpose RFI drafter for one Study Groups General Contractor session. It
takes a real GC headache (conflicting or ambiguous project documents) and drafts
a professional RFI in seconds, with a human still in control.

Augment, not automate: the AI drafts, the person decides, reviews, and sends.

## What it does

- Pick one of three baked issues from a dropdown, or type your own (the encore).
- Watch the actual prompt assemble in the middle panel.
- Watch the RFI draft stream in, titled "Draft for your review."
- Edit the draft inline, tick a short review checklist, then Accept and Copy.
- Nothing is stored. A refresh clears everything.
- If the API or network fails, a vetted saved-example draft appears so the demo
  never dies on stage. There is also a "Simulate offline" checkbox to show that
  path on purpose.

## Structure

```
demo/app/
  index.html                  front end markup
  styles.css                  Study Groups skin
  app.js                      front end logic (no storage)
  data/issues.js              SINGLE SOURCE: docs, 3 issues, prompt, fallbacks
  netlify/functions/draft.mjs serverless function (holds the API key, streams)
  netlify.toml                build + functions config
  package.json
```

All case content lives in `data/issues.js`. A future vertical is a swap of that
one file, not a rebuild. The same module is imported by both the browser and the
serverless function, so the displayed prompt and the sent prompt cannot drift.

## The function

`netlify/functions/draft.mjs` is served at `/api/draft`. It:

- accepts `{ issueId }` or `{ freeText }` (free text is length-capped),
- assembles the exact prompt from `data/issues.js`,
- calls Claude (`claude-sonnet-4-6`) and streams the draft back as text,
- reads the API key only from `process.env` via `Netlify.env.get("ANTHROPIC_API_KEY")`,
- applies a light per-IP rate limit,
- returns a vetted saved-example draft if the call fails.

It uses a plain `fetch` to the Anthropic API rather than the SDK, to keep the
function dependency-free and the deploy bulletproof.

## Run locally

Requires the Netlify CLI and Node 18+.

```bash
cd demo/app
export ANTHROPIC_API_KEY=sk-ant-...   # for live drafts; omit to test the fallback
netlify dev
```

Open the printed local URL. Without a key, every draft returns the saved example,
which is the fallback path the stage demo relies on.

## Deploy (continuous, from this repo)

1. Push this repo to GitHub.
2. In Netlify, create a new project linked to the repo.
3. Set the project **Base directory** to `demo/app`.
4. Add the environment variable `ANTHROPIC_API_KEY` (mark it secret).
5. Deploy. The function reads the key from the Netlify environment; it is never
   in client code or network payloads.
