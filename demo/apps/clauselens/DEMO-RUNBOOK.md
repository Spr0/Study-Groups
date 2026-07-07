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
   without **either** the key or the model, and the agent then silently falls
   back, so set both to run the review live:
   ```bash
   cd ~/Projects/Study-Groups/demo/apps/clauselens
   export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
   DEMO_AGENT=1 ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=<current-model> netlify dev
   # app + functions on http://localhost:8888
   ```
   Confirm: `curl -s localhost:8888/api/demo/health` returns `"demo":true`.
3. **Seed the fallback mailbox** (terminal 3, once):
   ```bash
   node agent-demo/seed-inbox.mjs
   ```
4. **Open two browser tabs**: `http://localhost:8888` (the app) and
   `http://localhost:8025` (the Mailpit inbox). Put the inbox on the second
   screen or a background tab.
5. **Wifi check**: with wifi ON, the initial review runs live (10-25s, 12s
   timeout). With wifi OFF, the dropped demo PDF is recognized by content
   hash and serves the vetted review instantly. Every beat after the review
   is localhost and does not care about wifi. Rehearse once with wifi off.
6. Have `agent-demo/cascade-ridge-subcontract.pdf` visible in a Finder window,
   ready to drag.

## The run, agent version (watched folder; primary beat 3)

Start the watcher (terminal 4): `node agent-demo/watch-folder.mjs`
It watches `agent-demo/drop/` and logs one line per file.

To prove live on the demo contract in rehearsal, set
`DEMO_AGENT_TIMEOUT_MS=45000` before starting the app; the watcher log reads
`(live)`. Unset it for the stage run to keep the 12s no-stall default.

The watcher watches `agent-demo/drop/` by default. To point it at any folder,
set `DEMO_WATCH_DIR=/absolute/path` before `node agent-demo/watch-folder.mjs`.
It creates the folder and a `processed/` subfolder if missing, picks up `.pdf`
and `.txt` only, and moves handled files to `processed/`.

1. Drag `cascade-ridge-subcontract.pdf` into the `agent-demo/drop/` folder in
   Finder. That is the whole input: the agent acts only on files in this one
   folder you control.
2. Within ~2-3 seconds the sign-off request lands in Mailpit (settle delay is
   0.5s after the file stops growing; review is instant on the recognized
   demo contract, 10-25s live for any other PDF). Switch to the inbox.
3. From here the chain is identical: open the email, click "Sign off and send
   to the signatory", the signed summary renders, the signatory email lands.
4. Processed files move to `agent-demo/drop/processed/`, so each drop runs
   exactly once; dropping the file again later is a deliberate fresh run.
   Non-PDF/TXT files are ignored silently.

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
7. Back to Mailpit: the reviewed summary to Dana Whitfield (fictional
   signatory, Summit Mechanical) is at the top.

## If something breaks

- Review hangs or errors: the fallback fires by itself within 12s for the
  demo PDF. Keep talking; the UI is identical.
- App down entirely: the seeded Mailpit mailbox already holds both emails.
  Narrate the flow from the inbox: open the approval email, describe the
  click, open the signatory email.
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
