// =============================================================================
// ClauseLens agent demo - pure templates and payload codec. No network, no
// model calls, no side effects: everything here is deterministic so the
// sign-off beat renders in well under two seconds and reads identically every
// run.
//
// FICTIONAL DATA ONLY. Every address in this file uses the reserved .test
// top-level domain, which cannot resolve on the public internet. Mail to these
// addresses exists only inside the local Mailpit catcher. There is no real
// recipient anywhere in this demo.
// =============================================================================
import type { Approver } from "@sg/core";
import type { ClauseResult } from "@sg/sample-data";
import { FIVE_CLAUSES, STATUS_NOT_FOUND } from "@sg/sample-data";

// ---- The fictional cast (all .test: unroutable by design) ----
export const FICTIONAL_REVIEWER_EMAIL = "reviewer@cascaderidge.test";
export const FICTIONAL_SENDER = {
  name: "Contract Review Agent (demo)",
  email: "contract-review-agent@cascaderidge.test",
};
export const FICTIONAL_SIGNATORY = {
  name: "Dana Whitfield",
  title: "VP Contracts, Summit Mechanical Services LLC",
  email: "d.whitfield@summitmechanical.test",
};

// ---- The watched-folder path (ticket: agent beat without the in-app click) ----
// The watcher ingests a file the facilitator controls and routes it for the
// SAME human sign-off as the in-app path: the reviewer named here receives the
// sign-off request, and nothing is signed until that human clicks. The
// fictional project reviewer matches the seed payload.
export const FICTIONAL_WATCH_REVIEWER = { name: "J. Alvarez", role: "PM" };

export function buildIngestPayload(
  fileName: string,
  result: ClauseResult,
  now: Date = new Date(),
): SignoffPayload {
  return {
    source: fileName,
    reviewer: {
      ...FICTIONAL_WATCH_REVIEWER,
      date: now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    },
    result,
    verified: [...FIVE_CLAUSES],
    approvedAtIso: now.toISOString(),
  };
}

// ---- The sign-off payload carried in the approval link (stateless) ----
export interface SignoffPayload {
  /** Source label shown on the review (file name or sample label). */
  source: string;
  reviewer: Approver;
  result: ClauseResult;
  /** The clause names the reviewer checked. Must be all five. */
  verified: string[];
  approvedAtIso: string;
}

/** The human gate, enforced wherever the payload is consumed. */
export function isCompletePayload(p: unknown): p is SignoffPayload {
  if (!p || typeof p !== "object") return false;
  const x = p as SignoffPayload;
  return (
    typeof x.source === "string" &&
    x.source.length > 0 &&
    !!x.reviewer &&
    typeof x.reviewer.name === "string" &&
    x.reviewer.name.trim().length > 0 &&
    typeof x.reviewer.role === "string" &&
    x.reviewer.role.trim().length > 0 &&
    typeof x.reviewer.date === "string" &&
    Array.isArray(x.verified) &&
    FIVE_CLAUSES.every((c) => x.verified.includes(c)) &&
    !!x.result &&
    Array.isArray(x.result.clauses) &&
    x.result.clauses.length === FIVE_CLAUSES.length &&
    Array.isArray(x.result.raise)
  );
}

// base64url so the payload survives inside a URL query parameter.
export function encodePayload(p: SignoffPayload): string {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = "";
  for (const b of jsonBytes) bin += String.fromCharCode(b);
  const b64 = (globalThis as { btoa?: (s: string) => string }).btoa
    ? btoa(bin)
    : Buffer.from(jsonBytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePayload(s: string): SignoffPayload | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const json = (globalThis as { atob?: (s: string) => string }).atob
      ? new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      : Buffer.from(b64, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    return isCompletePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// The final reviewed summary (TEMPLATED, no model call). Raise items are
// marked reviewed; the signature is the human reviewer's click.
// -----------------------------------------------------------------------------
export function buildSignedSummaryText(p: SignoffPayload): string {
  const lines: string[] = [];
  lines.push("REVIEWED CONTRACT SUMMARY");
  lines.push(`Contract: ${p.source}`);
  lines.push(`Project: Lakeview Medical Office (Cascade Ridge Construction)`);
  lines.push("");
  lines.push("RAISE BEFORE SIGNING (each item reviewed by the named reviewer)");
  if (p.result.raise.length === 0) {
    lines.push("Nothing flagged. [REVIEWED]");
  } else {
    p.result.raise.forEach((item, i) => lines.push(`${i + 1}. [REVIEWED] ${item}`));
  }
  lines.push("");
  lines.push("CLAUSE FINDINGS (all five verified against the contract)");
  for (const c of p.result.clauses) {
    lines.push(`- ${c.name}: ${c.status}${c.plain ? `. ${c.plain}` : "."}`);
  }
  lines.push("");
  lines.push(
    `Signed off by ${p.reviewer.name}, ${p.reviewer.role}, on ${p.reviewer.date}. ` +
      "Drafted and routed with AI assistance; reviewed, verified clause by clause, " +
      "and signed by the named reviewer. The signature is human.",
  );
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Email 1: approval request to the reviewer, carrying the sign-off link.
// -----------------------------------------------------------------------------
export interface EmailContent {
  from: { name: string; email: string };
  to: { name: string; email: string };
  subject: string;
  text: string;
  html: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EMAIL_CSS = `font-family:'Helvetica Neue',Arial,sans-serif;color:#171717;line-height:1.6;`;
const NAVY = "#14208a";
const BRICK = "#c4341f";

export function buildApprovalEmail(p: SignoffPayload, signoffUrl: string): EmailContent {
  const raiseCount = p.result.raise.length;
  const subject = `Sign-off requested: clause review of ${p.source} (${raiseCount} item${raiseCount === 1 ? "" : "s"} to raise)`;
  const text = [
    `${p.reviewer.name},`,
    "",
    `The clause review of "${p.source}" is complete and verified clause by clause.`,
    `${raiseCount} item${raiseCount === 1 ? "" : "s"} to raise before signing:`,
    ...p.result.raise.map((r, i) => `${i + 1}. ${r}`),
    "",
    "To sign off and send the reviewed summary to the signatory, open:",
    signoffUrl,
    "",
    "The agent drafted and routed this review. Your click is the signature.",
    "(Fictional demo data. This mail exists only in the local Mailpit inbox.)",
  ].join("\n");

  const html = `
<div style="${EMAIL_CSS}max-width:560px">
  <div style="border-bottom:2px solid ${NAVY};padding-bottom:8px;margin-bottom:16px">
    <strong style="color:${NAVY};font-size:16px">Contract review</strong>
    <span style="color:#8c8775;font-size:12px"> &middot; sign-off requested</span>
  </div>
  <p>${esc(p.reviewer.name)},</p>
  <p>The clause review of <strong>${esc(p.source)}</strong> is complete and verified clause by clause.</p>
  <div style="background:#f7ece9;border:2px solid ${BRICK};border-radius:3px;padding:14px 18px;margin:16px 0">
    <div style="color:${BRICK};font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.05em;margin-bottom:8px">
      Raise before signing (${raiseCount})</div>
    <ol style="margin:0;padding-left:20px">
      ${p.result.raise.map((r) => `<li style="margin-bottom:6px">${esc(r)}</li>`).join("")}
    </ol>
  </div>
  <p style="margin:20px 0">
    <a href="${esc(signoffUrl)}" style="background:${NAVY};color:#ffffff;text-decoration:none;
      padding:12px 22px;border-radius:3px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:13px">
      Sign off and send to the signatory</a>
  </p>
  <p style="color:#8c8775;font-size:12px">The agent drafted and routed this review. Your click is the signature.<br>
  Fictional demo data. This mail exists only in the local Mailpit inbox.</p>
</div>`;

  return {
    from: FICTIONAL_SENDER,
    to: { name: p.reviewer.name, email: FICTIONAL_REVIEWER_EMAIL },
    subject,
    text,
    html,
  };
}

// -----------------------------------------------------------------------------
// Email 2: the signed, reviewed summary to the fictional signatory.
// -----------------------------------------------------------------------------
export function buildSignatoryEmail(p: SignoffPayload): EmailContent {
  const subject = `Reviewed contract summary: ${p.source} (signed off by ${p.reviewer.name})`;
  const text = [
    `${FICTIONAL_SIGNATORY.name},`,
    "",
    "Please find the reviewed contract summary below. Every clause was verified and",
    "the raise items were reviewed and signed off by the named reviewer.",
    "",
    buildSignedSummaryText(p),
    "",
    "(Fictional demo data. This mail exists only in the local Mailpit inbox.)",
  ].join("\n");

  const html = `
<div style="${EMAIL_CSS}max-width:560px">
  <div style="border-bottom:2px solid ${NAVY};padding-bottom:8px;margin-bottom:16px">
    <strong style="color:${NAVY};font-size:16px">Contract review</strong>
    <span style="color:#8c8775;font-size:12px"> &middot; reviewed contract summary</span>
  </div>
  <p>${esc(FICTIONAL_SIGNATORY.name)},</p>
  <p>Please find the reviewed contract summary for <strong>${esc(p.source)}</strong>. Every clause was
  verified and the raise items were reviewed and signed off by the named reviewer.</p>
  <div style="background:#f7ece9;border:2px solid ${BRICK};border-radius:3px;padding:14px 18px;margin:16px 0">
    <div style="color:${BRICK};font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.05em;margin-bottom:8px">
      Raise before signing (each item reviewed)</div>
    <ol style="margin:0;padding-left:20px">
      ${p.result.raise
        .map(
          (r) =>
            `<li style="margin-bottom:6px"><strong style="color:${BRICK}">[REVIEWED]</strong> ${esc(r)}</li>`,
        )
        .join("")}
    </ol>
  </div>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin:14px 0">
    ${p.result.clauses
      .map(
        (c) => `<tr>
      <td style="border:1px solid #dad5c7;padding:6px 10px;font-weight:700">${esc(c.name)}</td>
      <td style="border:1px solid #dad5c7;padding:6px 10px;color:${c.status === STATUS_NOT_FOUND ? BRICK : NAVY};font-weight:700">${esc(c.status)}</td>
      <td style="border:1px solid #dad5c7;padding:6px 10px">${esc(c.plain || "Does not appear in this contract.")}</td>
    </tr>`,
      )
      .join("")}
  </table>
  <p style="border-top:2px solid ${NAVY};padding-top:10px;font-weight:600;font-size:13px">
    Signed off by ${esc(p.reviewer.name)}, ${esc(p.reviewer.role)}, on ${esc(p.reviewer.date)}.<br>
    <span style="font-weight:400;color:#3a372f">Drafted and routed with AI assistance; reviewed, verified clause by clause,
    and signed by the named reviewer. The signature is human.</span></p>
  <p style="color:#8c8775;font-size:12px">Fictional demo data. This mail exists only in the local Mailpit inbox.</p>
</div>`;

  return {
    from: FICTIONAL_SENDER,
    to: { name: FICTIONAL_SIGNATORY.name, email: FICTIONAL_SIGNATORY.email },
    subject,
    text,
    html,
  };
}

// -----------------------------------------------------------------------------
// The sign-off confirmation page (rendered by the function after the click).
// -----------------------------------------------------------------------------
export function buildSignoffPageHtml(p: SignoffPayload): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signed: ${esc(p.source)}</title></head>
<body style="margin:0;background:#f4f1eb;${EMAIL_CSS}">
<div style="max-width:680px;margin:0 auto;padding:40px 24px">
  <div style="border-bottom:1.5px solid ${NAVY};padding-bottom:12px;margin-bottom:24px">
    <span style="background:${NAVY};color:#fff;font-weight:700;font-size:13px;padding:6px 9px;border-radius:4px">SG</span>
    <strong style="color:${NAVY};font-size:16px;margin-left:8px">Contract review</strong>
    <span style="color:#8c8775;font-size:12px;text-transform:uppercase;letter-spacing:.05em"> &middot; sign-off complete</span>
  </div>
  <h1 style="font-size:26px;letter-spacing:-0.02em;margin:0 0 6px">Signed and sent</h1>
  <p style="color:#3a372f;margin:0 0 20px">The reviewed summary of <strong>${esc(p.source)}</strong> was signed by
  ${esc(p.reviewer.name)} and emailed to ${esc(FICTIONAL_SIGNATORY.name)}, ${esc(FICTIONAL_SIGNATORY.title)}.</p>
  <div style="background:#f7ece9;border:2px solid ${BRICK};border-radius:3px;padding:18px 22px;margin-bottom:18px">
    <div style="color:${BRICK};font-weight:800;text-transform:uppercase;font-size:14px;letter-spacing:.04em;margin-bottom:10px">
      Raise before signing: reviewed</div>
    <ol style="margin:0;padding-left:20px">
      ${p.result.raise
        .map(
          (r) =>
            `<li style="margin-bottom:8px"><strong style="color:${BRICK}">[REVIEWED]</strong> ${esc(r)}</li>`,
        )
        .join("")}
    </ol>
  </div>
  <div style="background:#fff;border:1px solid #dad5c7;border-radius:3px;padding:18px 22px">
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.7;margin:0">${esc(buildSignedSummaryText(p))}</pre>
  </div>
  <p style="color:#8c8775;font-size:12px;margin-top:18px">The agent drafted and routed. The click above was the signature: human, named, on the record.<br>
  Fictional demo data; both emails live only in the local Mailpit inbox.</p>
</div>
</body></html>`;
}
