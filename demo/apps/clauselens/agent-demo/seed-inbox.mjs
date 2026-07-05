/* eslint-disable no-console -- CLI script; stdout is the interface */
// Rehearsal seed: runs one clean pass of the agent path against the RUNNING
// local stack (netlify dev + Mailpit) so the persistent Mailpit mailbox ends
// up holding both emails. If the app ever fails on stage, the seeded inbox
// still lets the demo narrate from the approval email onward.
//
// Usage: node agent-demo/seed-inbox.mjs   (netlify dev and Mailpit must be up)
const APP = process.env.DEMO_APP_URL ?? "http://localhost:8888";
const MAILPIT = process.env.DEMO_MAILPIT_URL ?? "http://localhost:8025";

const fail = (msg) => {
  console.error(`SEED FAILED: ${msg}`);
  process.exit(1);
};

const t0 = Date.now();
const mark = (label, since) => console.log(`${label}: ${Date.now() - since} ms`);

// 1. Preconditions: Mailpit and the demo agent are up.
const mp = await fetch(`${MAILPIT}/api/v1/messages`).catch(() => null);
if (!mp?.ok) fail(`Mailpit not reachable at ${MAILPIT}. Run get-mailpit.sh and start it.`);
const health = await fetch(`${APP}/api/demo/health`).catch(() => null);
if (!health?.ok)
  fail(`Demo agent not up at ${APP}. Start 'netlify dev' with DEMO_AGENT=1 in .env.`);

// 2. The canonical payload, from the same code path the app uses.
const seedRes = await fetch(`${APP}/api/demo/seed-payload`);
if (!seedRes.ok) fail("Could not fetch the seed payload.");
const { payload } = await seedRes.json();

// 3. Beat one: the agent emails the reviewer the sign-off link.
const t1 = Date.now();
const send = await fetch(`${APP}/api/demo/send-approval`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});
const sendBody = await send.json().catch(() => ({}));
if (!send.ok || !sendBody.ok) fail(`send-approval failed: ${sendBody.error ?? send.status}`);
mark("approval email (approve-click to inbox)", t1);

// 4. Beat two: the HUMAN CLICK (simulated here only for seeding; on stage the
// reviewer clicks the link in Mailpit). Renders the page + sends email two.
const t2 = Date.now();
const signoff = await fetch(sendBody.signoffUrl);
if (!signoff.ok) fail(`signoff failed: ${signoff.status}`);
const page = await signoff.text();
if (!page.includes("Signed and sent")) fail("signoff page did not render the signed summary.");
mark("sign-off click to signatory email", t2);

// 5. Verify both messages are in the mailbox.
const inbox = await (await fetch(`${MAILPIT}/api/v1/messages?limit=10`)).json();
const subjects = inbox.messages.map((m) => m.Subject);
const hasApproval = subjects.some((s) => s.startsWith("Sign-off requested"));
const hasSignatory = subjects.some((s) => s.startsWith("Reviewed contract summary"));
if (!hasApproval || !hasSignatory) fail(`inbox incomplete. Subjects: ${JSON.stringify(subjects)}`);

console.log(
  `Mailbox seeded: ${inbox.messages_count ?? inbox.total} message(s), both beats present.`,
);
mark("total seed run", t0);
console.log("All recipients are .test addresses inside Mailpit. Nothing left this laptop.");
