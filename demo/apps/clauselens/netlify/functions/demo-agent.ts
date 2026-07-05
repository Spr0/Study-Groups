// =============================================================================
// ClauseLens agent demo - the local sign-off service. Three routes:
//   GET  /api/demo/health        -> is the demo agent on?
//   POST /api/demo/send-approval -> email the reviewer the sign-off link
//   GET  /api/demo/signoff?p=... -> THE HUMAN CLICK: render the signed summary
//                                   page and email it to the fictional signatory
//
// Hard-gated on DEMO_AGENT=1, which is set only in the local .env used by
// `netlify dev`. Deployed without that env (production), every route returns
// 403 and nothing here can run. Mail goes exclusively to the local Mailpit
// catcher (DEMO_SMTP_HOST/PORT, default localhost:1025) addressed to reserved
// .test domains: zero real external send is possible by construction.
//
// No model call anywhere in this file: the signed summary is templated, so the
// approval-click beat completes in well under two seconds. Nothing persists;
// the sign-off link carries its own payload, gated on all five clauses being
// verified by a named reviewer. The click is the signature; only a human GET
// on the link triggers it.
// =============================================================================
import type { Config, Context } from "@netlify/functions";
import { FIVE_CLAUSES, SAMPLE_FALLBACK_RESULT } from "@sg/sample-data";
import {
  buildApprovalEmail,
  buildSignatoryEmail,
  buildSignoffPageHtml,
  decodePayload,
  encodePayload,
  isCompletePayload,
  type SignoffPayload,
} from "../../src/demo-templates";
import { sendMail } from "./_demo/smtp";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

const smtp = (): { host: string; port: number } => ({
  host: process.env.DEMO_SMTP_HOST ?? "localhost",
  port: Number(process.env.DEMO_SMTP_PORT ?? "1025"),
});

export default async (req: Request, _context: Context): Promise<Response> => {
  if (process.env.DEMO_AGENT !== "1") {
    return json({ error: "Demo agent is off." }, 403);
  }
  const url = new URL(req.url);

  if (url.pathname.endsWith("/health")) {
    return json({ ok: true, demo: true });
  }

  // The canonical rehearsal payload, served so the seed script exercises the
  // exact same path (and the exact same emails) as a stage run. The reviewer
  // is the fictional project reviewer from the sample data.
  if (url.pathname.endsWith("/seed-payload")) {
    const payload: SignoffPayload = {
      source: "cascade-ridge-subcontract.pdf",
      reviewer: {
        name: "J. Alvarez",
        role: "PM",
        date: new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      },
      result: SAMPLE_FALLBACK_RESULT,
      verified: [...FIVE_CLAUSES],
      approvedAtIso: new Date().toISOString(),
    };
    return json({ payload });
  }

  if (url.pathname.endsWith("/send-approval")) {
    if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }
    // The human gate: a named reviewer and all five clauses verified, or no email.
    if (!isCompletePayload(payload)) {
      return json(
        { error: "Sign-off requires a named reviewer and all five clauses verified." },
        400,
      );
    }
    const signoffUrl = `${url.origin}/api/demo/signoff?p=${encodePayload(payload)}`;
    try {
      await sendMail({ ...smtp(), ...buildApprovalEmail(payload, signoffUrl) });
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "Could not reach the local inbox." },
        502,
      );
    }
    return json({ ok: true, signoffUrl });
  }

  if (url.pathname.endsWith("/signoff")) {
    if (req.method !== "GET") return json({ error: "Method Not Allowed" }, 405);
    const p = decodePayload(url.searchParams.get("p") ?? "");
    // Same gate on the way out: the link cannot mint a signature the reviewer
    // did not earn in the app.
    if (!p) {
      return html(
        `<p style="font-family:sans-serif">This sign-off link is incomplete or was not fully verified. Re-run the review.</p>`,
        400,
      );
    }
    try {
      await sendMail({ ...smtp(), ...buildSignatoryEmail(p) });
    } catch (err) {
      return html(
        `<p style="font-family:sans-serif">Signed, but the local inbox is unreachable: ${
          err instanceof Error ? err.message : "unknown"
        }. Start Mailpit and click the link again.</p>`,
        502,
      );
    }
    return html(buildSignoffPageHtml(p));
  }

  return json({ error: "Unknown demo route." }, 404);
};

export const config: Config = {
  path: [
    "/api/demo/health",
    "/api/demo/seed-payload",
    "/api/demo/send-approval",
    "/api/demo/signoff",
  ],
};
