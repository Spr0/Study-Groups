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
import {
  FIVE_CLAUSES,
  isValidResult,
  reviewContract,
  SAMPLE_FALLBACK_RESULT,
  type ClauseResult,
} from "@sg/sample-data";
import {
  buildApprovalEmail,
  buildIngestPayload,
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

// Live inference for an arbitrary contract: POST to the shared /api/analyze
// endpoint (the one model call, no duplicate). The recognized demo contract
// never reaches here because reviewContract() short-circuits on the content
// hash first, so this timeout only ever guards a genuine live call. It throws
// on any failure; the caller turns that into a 502 (never a fabricated table).
const LIVE_TIMEOUT_MS = 45_000;
async function liveExtract(origin: string, contractText: string): Promise<ClauseResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "extract", contractText }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as { result?: unknown } | null;
    if (res.ok && data && isValidResult(data.result)) return data.result;
    throw new Error("live review did not return a valid result");
  } finally {
    clearTimeout(timer);
  }
}

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

  // Watched-folder intake: the local watcher POSTs a file it saw land in the
  // demo folder. It runs the SAME shared review entry point as the in-app path
  // (reviewContract: content hash first, vetted result instantly for the demo
  // contract, live inference for anything else), then the SAME sign-off request
  // template and sender. No new email path exists: the reviewer's click remains
  // the signature, exactly as before.
  if (url.pathname.endsWith("/ingest")) {
    if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);
    let body: { fileName?: unknown; contractText?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const contractText = typeof body.contractText === "string" ? body.contractText : "";
    if (!fileName || !contractText.trim()) {
      return json({ error: "fileName and contractText are required." }, 400);
    }
    if (contractText.length > 100_000) {
      return json({ error: "Contract is too long." }, 413);
    }

    let result: ClauseResult;
    let mode: "vetted" | "live";
    try {
      ({ result, mode } = await reviewContract(contractText, (text) =>
        liveExtract(url.origin, text),
      ));
    } catch {
      // Never a false table: an arbitrary file with no live review is skipped.
      return json(
        { error: "Could not review this contract live, and no vetted fallback exists for it." },
        502,
      );
    }

    const payload = buildIngestPayload(fileName, result);
    if (!isCompletePayload(payload)) {
      return json({ error: "Ingest payload failed the sign-off gate." }, 500);
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
    return json({ ok: true, mode, signoffUrl });
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
    "/api/demo/ingest",
    "/api/demo/send-approval",
    "/api/demo/signoff",
  ],
};
