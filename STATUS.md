# Study Groups Platform — Status

_Last updated: 2026-06-30_

Monorepo (`demo/` workspace `study-groups-platform`) for the Study Groups document-review demos.
`@sg/core` is the single source of truth (logic + copy); each app renders in its own stack.

## Layout
- **`demo/packages/core`** (`@sg/core`) — shared review engine (`createReviewApp`), serverless handler
  factory (`@sg/core/server`), markdown, the **ROI module** (`roi.ts`), and the **sign-off / approval**
  module. Framework-agnostic TS.
- **`demo/packages/sample-data`** (`@sg/sample-data`) — the Cascade Ridge / Lakeview MOB project and the
  per-use-case content: `submittalReview`, `rfiDraft`.
- **`demo/apps/submittal`** (`@sg/submittal`) — Vite + TS. `createReviewApp(root, { useCase: submittalReview })`.
- **`demo/apps/rfi`** (`@sg/rfi`) — Vite + TS. `createReviewApp(root, { useCase: rfiDraft })`. Migrated
  from the old vanilla `demo/app` (now removed) onto `@sg/core`.

## §8 rollout (this change)
- **ROI** lives in `@sg/core` (`roi.ts`): `computeRoi(appKey, …)` + `ROI_CONFIG` for `clauselens` / `rfi`
  / `submittal` + `ROI_HEADLINE`. `createReviewApp` renders the ROI panel when a use-case sets `roiAppKey`.
  Anchors: ClauseLens $12k base / $132k with risk; submittal 30 hrs / $3,600 (10 runs × $120); rfi
  96 hrs / $10,600 (40 runs × $110).
- **Sign-off** is canonical: gate requires **name + role + attestation**, then enables **Export / Copy /
  Print**, appending verbatim:
  `Reviewed and approved by {name}, {role}, on {date}. Drafted with AI assistance; approved by the named reviewer before issue.`
  Internal approval, not a legal signature.
- **Model from env, fail-loud:** `@sg/core/server` no longer falls back to a hardcoded model; a missing
  `ANTHROPIC_MODEL` returns 503 (the no-API-key offline fallback still works as a demo feature).

## Verification
`npm test` (49 passing), `npm run typecheck`, `npm run build --workspaces` all green. ROI math, the
sign-off gate, and the canonical block were verified in-browser for both apps. No key in the client
bundles; no em dashes in UI copy.

## Deploy / ops (manual)
- Each app is its own Netlify site (monorepo package dir): submittal → `demo/apps/submittal`,
  **rfi → `demo/apps/rfi`** (repoint the existing `studygroupsdemo.netlify.app` site from the old
  `demo/app` to this package dir).
- Set `ANTHROPIC_MODEL` (and `ANTHROPIC_API_KEY`) in each Netlify site's env. No hardcoded fallback.

## Related
- ClauseLens lives in a separate repo (`Spr0/ClauseLens`, React + Vite) and conforms to this canonical
  sign-off + ROI by behaviour and copy.
