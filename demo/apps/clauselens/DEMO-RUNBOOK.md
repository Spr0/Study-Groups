# ClauseLens Agent Demo - Pre-flight Runbook (one page)

The beat: drop the contract PDF, review with the raise list front and center,
verify the five clauses, approve, the agent emails the report for sign-off,
you click the link in the inbox, the signed summary renders and the signatory
email lands. The agent drafts and routes; **your click is the signature**.

All data is fictional (Cascade Ridge sample). All mail goes only to the local
Mailpit inbox at reserved `.test` addresses. Nothing leaves the laptop, ever.

## One-time setup (already done if rehearsed)

```bash
cd ~/Projects/Study-Groups/demo/apps/clauselens
sh agent-demo/get-mailpit.sh          # downloads the local mail catcher
node agent-demo/make-demo-pdf.mjs     # writes agent-demo/cascade-ridge-subcontract.pdf
printf 'DEMO_AGENT=1\n' > .env        # turns the demo agent on, LOCAL ONLY
```

## Before you walk on stage (5 minutes)

1. **Start Mailpit** (terminal 1). The `--database` file keeps the seeded
   mailbox across restarts:
   ```bash
   cd ~/Projects/Study-Groups/demo/apps/clauselens
   ./agent-demo/.tools/mailpit --database agent-demo/.tools/mailpit-demo.db
   ```
2. **Start the app** (terminal 2). Pass the vars inline; process env always
   wins even when the CLI skips .env injection. `analyze.ts` returns 503
   without **either** the key or the model; the demo contract still renders
   from the vetted result by content hash, but set both so an unrecognized PDF
   can run live:
   ```bash
   cd ~/Projects/Study-Groups/demo/apps/clauselens
   export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
   DEMO_AGENT=1 ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=<current-model> netlify dev
   # app + functions on http://localhost:8888
   ```
   Confirm: `curl -s localhost:8888/api/demo/health` returns `"demo":true`.
3. **Seed and rehearse, then reset to zero** (terminal 3):
   ```bash
   node agent-demo/seed-inbox.mjs
   ```
   This writes the two chain messages (the approval, then the signed summary
   with the reviewer on **Cc**) into the same persistent Mailpit DB. Use it to
   rehearse and to capture the break-glass screenshots. Then, **before the live
   run, clear Mailpit** (Delete all in the inbox UI) so the room starts empty.
   **Confirm: the Mailpit inbox shows 0 messages before you begin.** A clean run
   then shows exactly two: the approval (To: you) and the signed summary (To:
   Dana, Cc: you). If you would rather keep the seeded pair as your live
   fallback, leave them, but expect four in the view and say the first two are
   the seed. (Mailpit is a single catch-all viewer with no per-person mailbox;
   with only these two messages it reads as the reviewer's inbox.)
4. **Open two browser tabs**: `http://localhost:8888` (the app) and
   `http://localhost:8025` (the Mailpit inbox). Put the inbox on the second
   screen or a background tab.
5. **Wifi check**: the dropped demo PDF is recognized by content hash and
   serves the vetted review instantly, wifi ON or OFF, on both the in-app and
   the watched-folder path (no model call, no timeout, no network). Only a
   different, unrecognized PDF goes live (10-25s). Every beat after the review
   is localhost and does not care about wifi. Rehearse once with wifi off to
   confirm the demo contract is unchanged.
6. Have `agent-demo/cascade-ridge-subcontract.pdf` visible in a Finder window,
   ready to drag.

## The run, agent version (watched folder; primary beat 3)

Start the watcher (terminal 4): `node agent-demo/watch-folder.mjs`
It watches `agent-demo/drop/` and logs one line per file.

The demo contract is always served from the vetted result by content hash, so
the watcher log reads `(vetted)` for it. To see the live path in rehearsal,
drop a different (unrecognized) PDF instead; that log line reads `(live)`.

The watcher watches `agent-demo/drop/` by default. To point it at any folder,
set `DEMO_WATCH_DIR=/absolute/path` before `node agent-demo/watch-folder.mjs`.
It creates a `Processed/` subfolder if missing (excluded from the watch), picks
up `.pdf` and `.txt` only, and on success moves the file into `Processed/` with
its original name. A same-named file already there gets a timestamp
(`cascade-ridge-subcontract.2026-07-09T1432.pdf`); nothing is ever overwritten.
A file that fails to process is left in place and logged, not moved.

1. Drag `cascade-ridge-subcontract.pdf` into the `agent-demo/drop/` folder in
   Finder. That is the whole input: the agent acts only on files in this one
   folder you control.
2. Within ~2-3 seconds the sign-off request lands in Mailpit (settle delay is
   0.5s after the file stops growing; review is instant on the recognized
   demo contract, 10-25s live for any other PDF). Switch to the inbox.
3. From here the chain is identical: open the email, click "Sign off and send
   to the signatory", the signed summary renders, the signatory email lands as
   ONE message, To: Dana Whitfield and Cc: the reviewer (you keep a copy).
4. On success the file moves to `agent-demo/drop/Processed/` (original name
   kept; a same-named file gets a timestamp, never overwritten), so each drop
   runs exactly once; dropping it again later is a deliberate fresh run. A file
   that fails is left in place and logged. Non-PDF/TXT files are ignored
   silently.

If the watcher is down, the in-app run below is fallback one; the seeded
inbox is fallback two.

## The run, in-app version (fallback one)

1. Drag the PDF onto the drop zone. (Optional: open "The prompt" peek.)
2. Review the clauses button. Narrate the raise panel: the missing Liability
   Cap leads.
3. Check the five Verified boxes, enter name and role, Approve.
4. "Email for sign-off" button appears (demo mode only). Click it.
5. Switch to the Mailpit tab: the sign-off request is at the top. Open it.
6. Click "Sign off and send to the signatory". The signed summary page
   renders; raise items marked REVIEWED; your click was the signature.
7. Back to Mailpit: the reviewed summary is at the top, one message addressed
   To: Dana Whitfield (fictional signatory, Summit Mechanical) and Cc: the
   reviewer. Your inbox now legitimately holds both beats: the approval request
   (To: you) and the signed summary (Cc: you). The reviewer signed and routed
   it and keeps a copy; it is one message with two recipients, not two.

## If something breaks

- Review hangs or errors: cannot happen for the demo PDF. It is served from
  the vetted result instantly by content hash, with no model call to hang.
  Only an unrecognized PDF makes a live call at all.
- App down entirely: if you kept the seeded pair, narrate the flow from the
  Mailpit inbox (approval, then the signed summary To: Dana / Cc: you). If you
  reset Mailpit to zero for a clean run, narrate from the rehearsal screenshots
  / recording instead (the nuclear option below).
- Mailpit down: restart terminal 1; the database file preserves the seed.
- Nuclear option: the rehearsal screenshots / recording (capture during your
  own rehearsal run).

## Safety facts (say them out loud if asked)

- Fictional contract, fictional reviewer, fictional signatory.
- Every address ends in `.test`, a reserved TLD that cannot resolve on the
  public internet; Mailpit catches them locally and relays nothing.
- No real sending provider exists anywhere in the code or config.
- Nothing persists: refresh clears the app; the only artifact is the local
  Mailpit mailbox file you control.
