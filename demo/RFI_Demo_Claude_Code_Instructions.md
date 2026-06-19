# Claude Code Build Brief — GC RFI Demo App

Build and deploy a small web app for a live workshop demo. The case content, sample documents, three issues, the prompt, and the brand colors live in the companion file **`RFI_Demo_Build_Content.md`**. Read it first; transcribe its data verbatim into the app. This file tells you *why* you are building it, *what* to build, and *how* to ship it.

---

## Intent (why this exists)

This is a **live demonstration instrument** for a single Study Groups session of general contractors in July. Its only job is to make one thing undeniable to a skeptical room: that a problem GCs live with every day, conflicting or ambiguous project documents, can be handled by AI in seconds, with a human still in control, and that **they could do it themselves next week**.

It is the "show me how, then teach me to do it again" payoff. It is **not** a product, not reusable infrastructure, not a universal tool. Build it single-purpose and a little disposable. Keep all case content in one data module so a future vertical is a five-minute swap, not a rebuild. Do not add a config system, auth, accounts, analytics, or a database.

The behavioral spine is **augment, not automate**: the AI drafts, the human decides. The screen must make that division impossible to miss.

## Expected outcome (definition of done)

A public Netlify URL, no login, where a facilitator can:

1. Pick one of three GC issues from a dropdown, or type their own (the encore).
2. Watch the **actual prompt** assemble in a middle panel, then watch a professional **RFI draft stream in** against the sample project documents.
3. See the draft labeled **"Draft for your review,"** edit it inline, and tick a short review checklist that unlocks **Copy to clipboard**.
4. Nothing is stored; a refresh clears everything.
5. If the network or API fails, a **vetted fallback draft** appears so the demo never dies on stage.

Styled to match the Study Groups kit. The room should leave thinking "I could run that on my own project."

---

## Stack

- Plain static front end: `index.html`, `styles.css`, `app.js`. No framework.
- One **Netlify serverless function** that holds the Anthropic key and calls Claude. The key is **never** in the browser.
- `@anthropic-ai/sdk`, model **`claude-sonnet-4-6`** (swap to a newer Sonnet if available). `max_tokens` ~1500, low temperature for consistency.
- Prefer **streaming** the draft for the live effect. If streaming through the function is awkward on the platform, fall back to a single non-streamed call with a "Drafting…" state and a brief reveal animation. Reliability beats the typewriter effect.

## Repo structure

```
/index.html
/styles.css
/app.js
/data/issues.js          <- the 3 issues, shared sample docs, prompt template (from the content file)
/netlify/functions/draft.js
/netlify.toml
/package.json            <- depends on @anthropic-ai/sdk
/README.md               <- run + deploy notes
```

Put **all** case content in `/data/issues.js`: the shared sample documents, the three issues (id, dropdown label, which documents apply, the issue text), and the prompt template. This is the one file to edit for a future swap.

## The function (`/netlify/functions/draft.js`)

- Accepts `{ issueId }` or `{ freeText }`.
- Assembles the prompt from `issues.js`: project name (Lakeview Medical Office), the issue text, the relevant baked documents, and the RFI format. Use the exact prompt in the content file.
- System prompt: a careful construction-document assistant that drafts RFIs as **drafts only** for human review, cites the documents it was given, asks one clear question, proposes a resolution, flags assumptions, and never invents facts.
- Returns the draft (streamed or whole).
- **Guardrails:** validate input length (cap free-text), a light per-IP rate limit (e.g., 10/min) is plenty, key read only from `process.env.ANTHROPIC_API_KEY`, same-origin only.
- **Fallback:** if the API call throws, return a pre-written vetted draft for that issue (store one per issue in `issues.js`) with a flag so the UI can note it is a saved example.

## The screen (front end)

Three panels, left to right; stack top-to-bottom on narrow screens / projectors:

1. **Inputs** — the sample documents for the chosen issue, plus the issue text (dropdown selection or free-typed).
2. **Prompt** — the populated prompt exactly as sent to the model. This panel is the teaching point; never hide it.
3. **Draft** — the RFI, titled **"Draft for your review,"** editable, streaming in.

Augment-not-automate behaviors (non-negotiable):

- Output always titled "Draft for your review," never "Your RFI."
- Draft is editable in the panel.
- A review checklist gates the finish: references right / one clear question / nothing invented / cost-schedule noted. Only after the human ticks all boxes does an **"Accept — this is mine"** button enable.
- That button only enables **Copy to clipboard**. No save, no share, no storage.
- A standing line sits under the output the whole time: **"A person reviews and sends every RFI."**

## Brand (match the kit)

- Colors: royal blue `#122A9B` (brand / structure / masthead bar), brick red `#C73C2F` (one hot accent: labels, the active state, the prompt variables), near-black `#1A1C20` (text and dark panels), white `#FFFFFF` ground, light panel `#F3F5FB`, hairline `#DBE0EA`.
- Fonts via Google Fonts: **Barlow Semi Condensed** (display/headers, 600–800), **Spectral** (body), **Space Mono** (the prompt and any data/numbers).
- Masthead: a full-width royal-blue bar with a white "SG  Study Groups" lockup left and the page purpose right, matching the PDFs. Footer: "Study Groups" left, nothing center, no other attribution.

## Deploy (you have GitHub and Netlify connected)

1. Create a **new GitHub repo** and push the project.
2. Create a **new Netlify project** linked to that repo. Do not reuse an existing site.
3. Set the env var **`ANTHROPIC_API_KEY`** in the new Netlify project's settings.
4. Trigger a deploy and confirm the function works: test all three issues and one free-typed issue, and confirm the fallback path by simulating an API failure.
5. Return the live URL and the repo link.

## Acceptance criteria

- Public URL loads with no login and matches the Study Groups look.
- Each of the three issues drafts a correct, professional RFI that cites the right documents and asks one clear question. For Issue 2, the draft should show the clearance arithmetic, not hand-wave it.
- The populated prompt is visible before and during drafting.
- The draft is editable; the review checklist gates the Accept/Copy step; nothing persists across a refresh.
- The fallback draft appears when the API is unavailable.
- The key is absent from all client-side code and network payloads.

## Out of scope (do not build)

Auth, user accounts, saved/shared drafts, a database, analytics, multi-case config UI, other document types (submittal review, change orders, daily reports). Those are separate future demos. This is one room, one workflow, one session.
