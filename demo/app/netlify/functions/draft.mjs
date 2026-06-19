// =============================================================================
// GC RFI Demo - draft function
// =============================================================================
// Holds the Anthropic key (server side only) and drafts an RFI for the chosen
// issue or a free-typed issue. Streams the draft back as text/plain for the live
// effect. If anything fails, returns a vetted saved-example draft as JSON so the
// demo never dies on stage. The API key is read ONLY from the environment.
// =============================================================================

import { PROJECT, buildPrompt, resolveCase } from "../../data/issues.js";

const MODEL = "claude-sonnet-4-6"; // swap to a newer Sonnet when available
const MAX_TOKENS = 1500;
const FREE_TEXT_CAP = 4000; // characters
const RATE_LIMIT = 10; // requests per IP per window
const RATE_WINDOW_MS = 60 * 1000;

// Light, best-effort in-memory rate limit. Per function instance; plenty for a
// single-room demo. Not a security control.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

// System prompt: a careful construction-document assistant. Drafts only, cites
// the documents it was given, asks one clear question, proposes a resolution,
// flags assumptions, never invents facts, and shows clearance arithmetic.
const SYSTEM_PROMPT = `You are a careful construction-document assistant helping a general contractor draft an RFI (Request for Information).

Non-negotiable rules:
- You produce a DRAFT only, for a human to review and send. A person reviews and sends every RFI.
- Use ONLY the documents and facts provided in the message. Never invent document numbers, dimensions, systems, names, dates, or requirements. If a fact is missing, say so or mark it as a bracketed placeholder.
- Cite the specific documents you rely on by their title or number (for example "Spec 03 30 00, 2.3.A" or "Drawing S-301").
- Ask exactly one clear question.
- Propose a concrete suggested resolution.
- Explicitly flag every assumption you had to make.
- Note the cost and schedule impact, and which trades are affected.

When the issue involves a dimensional, vertical, or clearance fit, you MUST show the arithmetic, not summarize it:
- List each component on its own line (ceiling height, duct depth, insulation allowance, hanger and clearance allowance).
- Add them to a single required figure (for example, required bottom of structure above the ceiling).
- Compare that required figure against the available figure from the drawings.
- State the numeric shortfall or surplus in inches. Do not write "does not fit" without the supporting numbers.
- Carry any stated allowances exactly as given and label them as assumptions.

Style:
- Output the RFI in the requested format with clear labeled sections.
- Concise and professional. No marketing language.
- Do not use em dashes or en dashes anywhere. Use a comma, a period, parentheses, or a plain hyphen instead. Plain hyphens are fine inside terms like 10'-2", 30" x 12", 1-hour, and B-12.
- End the draft with the line: "Draft for your review. A person reviews and sends every RFI."`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function fallbackResponse(draft, reason) {
  return json({ source: "saved-example", fallback: true, reason, draft });
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const ip =
    context?.ip ||
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for") ||
    "unknown";
  if (rateLimited(ip)) {
    return json({ error: "Too many requests. Wait a minute and try again." }, 429);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  let { issueId, freeText } = payload || {};
  if (typeof freeText === "string") {
    if (freeText.length > FREE_TEXT_CAP) {
      return json({ error: `Issue text is too long. Limit ${FREE_TEXT_CAP} characters.` }, 400);
    }
  }

  const resolved = resolveCase({ issueId, freeText });
  if (!resolved) {
    return json({ error: "Unknown issue. Pick one from the list or type your own." }, 400);
  }

  const prompt = buildPrompt(resolved.issueText, resolved.docs);

  const apiKey = (typeof Netlify !== "undefined" && Netlify.env.get("ANTHROPIC_API_KEY")) || "";
  if (!apiKey) {
    // No key configured: serve the vetted saved example so the demo still runs.
    return fallbackResponse(resolved.fallbackDraft, "no-api-key");
  }

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return fallbackResponse(resolved.fallbackDraft, "network-error");
  }

  if (!upstream.ok || !upstream.body) {
    return fallbackResponse(resolved.fallbackDraft, `api-status-${upstream.status}`);
  }

  // Proxy the Anthropic SSE stream and re-emit only the text deltas as plain text.
  // A single start-based pump reads the upstream to completion. This avoids the
  // pull re-entrancy trap where upstream events that carry no text (message_start,
  // ping) would otherwise stall the consumer.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let buffer = "";
      let emittedAny = false;

      const emitFrom = (chunk) => {
        buffer += chunk;
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          for (const line of evt.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              emittedAny = true;
              controller.enqueue(encoder.encode(parsed.delta.text));
            }
          }
        }
      };

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            emitFrom(decoder.decode(value, { stream: true }));
          }
          controller.close();
        } catch (err) {
          // If the stream breaks before any text, surface a clear marker the
          // client can swap for the local saved example.
          if (!emittedAny) controller.enqueue(encoder.encode("__STREAM_ERROR__"));
          controller.close();
        }
      })();
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-draft-source": "live",
      "cache-control": "no-store",
    },
  });
};

export const config = {
  path: "/api/draft",
};
