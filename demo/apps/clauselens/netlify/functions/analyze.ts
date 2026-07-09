// =============================================================================
// ClauseLens app - analyze function. Two modes on one endpoint:
//   { mode: "extract", contractText }            -> { result: ClauseResult }
//   { mode: "explain", clauseName, quote, plain } -> { explanation: string }
//
// The Anthropic key is read from the server environment only and never reaches
// the browser. The model comes from ANTHROPIC_MODEL with no fallback (fails
// loudly if unset). Contract text is processed in memory, never logged or
// persisted. Errors are sanitized; the client holds the vetted sample fallback.
// No `temperature` is sent: it is deprecated on current models (sending it is a
// 400), so the param is omitted entirely rather than pinned to an older model.
// =============================================================================
import type { Config, Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildExplainPrompt,
  buildExtractPrompt,
  EXPLAIN_SYSTEM_PROMPT,
  EXTRACT_SYSTEM_PROMPT,
  FIVE_CLAUSES,
  isValidResult,
  parseClauseResponse,
  type AnalyzeRequest,
} from "@sg/sample-data";

const MAX_CHARS = 100_000; // ~25k tokens of contract text, a sane ceiling
const EXTRACT_MAX_TOKENS = 3000;
const EXPLAIN_MAX_TOKENS = 400;
const RATE_LIMIT = 15; // requests per IP per window
const RATE_WINDOW_MS = 60_000;

// Light, best-effort in-memory rate limit (per function instance; plenty for a
// single-room demo, not a security control).
const hits = new Map<string, { start: number; count: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// The exact request body for a model call. No `temperature`: it is deprecated
// on current models (sending it returns a 400), so the key is omitted entirely.
// Exported so a unit test can assert the request carries no temperature key.
export function buildModelRequest(opts: {
  model: string;
  system: string;
  userText: string;
  maxTokens: number;
}): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.userText }],
  };
}

async function callModel(opts: {
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  maxTokens: number;
}): Promise<string> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const msg = await client.messages.create(
    buildModelRequest({
      model: opts.model,
      system: opts.system,
      userText: opts.userText,
      maxTokens: opts.maxTokens,
    }),
  );
  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  if (!text) throw new Error("empty model response");
  return text;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const ip =
    req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  if (rateLimited(ip)) {
    return json({ error: "Too many requests. Wait a minute and try again." }, 429);
  }

  let payload: AnalyzeRequest;
  try {
    payload = (await req.json()) as AnalyzeRequest;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) {
    // Fail in config, not silently. Never tell the client which is missing.
    console.error(
      `[analyze] missing config: ${!apiKey ? "ANTHROPIC_API_KEY " : ""}${!model ? "ANTHROPIC_MODEL" : ""}`.trim(),
    );
    return json({ error: "Service is not configured. Try again later." }, 503);
  }

  if (payload?.mode === "extract") {
    const contractText = payload.contractText;
    if (typeof contractText !== "string" || contractText.trim().length === 0) {
      return json({ error: "No contract text received. Drop a readable PDF." }, 400);
    }
    if (contractText.length > MAX_CHARS) {
      return json(
        { error: `Contract is too long. Limit ${MAX_CHARS.toLocaleString()} characters.` },
        413,
      );
    }
    try {
      const raw = await callModel({
        apiKey,
        model,
        system: EXTRACT_SYSTEM_PROMPT,
        userText: buildExtractPrompt(contractText),
        maxTokens: EXTRACT_MAX_TOKENS,
      });
      const result = parseClauseResponse(raw);
      // Gate on a valid, structured result. Anything else is an error, never a
      // false "Not Found" report.
      if (!isValidResult(result)) {
        console.error("[analyze] could not parse a valid result from the model");
        return json({ error: "Could not read a result from the analysis. Try again." }, 502);
      }
      return json({ result });
    } catch (err) {
      // Sanitized log; never the contract body, never raw errors to the client.
      console.error(`[analyze] extract failed: ${err instanceof Error ? err.message : "unknown"}`);
      return json({ error: "Analysis failed. Please try again." }, 502);
    }
  }

  if (payload?.mode === "explain") {
    const { clauseName, quote, plain } = payload;
    if (typeof clauseName !== "string" || !FIVE_CLAUSES.includes(clauseName)) {
      return json({ error: "Unknown clause." }, 400);
    }
    if (typeof quote !== "string" || quote.trim().length === 0 || quote.length > 4000) {
      return json({ error: "No clause text received." }, 400);
    }
    try {
      const explanation = await callModel({
        apiKey,
        model,
        system: EXPLAIN_SYSTEM_PROMPT,
        userText: buildExplainPrompt(
          clauseName,
          quote,
          typeof plain === "string" ? plain : undefined,
        ),
        maxTokens: EXPLAIN_MAX_TOKENS,
      });
      return json({ explanation: explanation.trim() });
    } catch (err) {
      console.error(`[analyze] explain failed: ${err instanceof Error ? err.message : "unknown"}`);
      return json({ error: "Explanation failed. Please try again." }, 502);
    }
  }

  return json({ error: "Unknown mode." }, 400);
};

export const config: Config = {
  path: "/api/analyze",
};
