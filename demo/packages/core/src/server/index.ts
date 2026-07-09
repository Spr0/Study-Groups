// =============================================================================
// @sg/core/server - the serverless handler factory. This is the ONLY place the
// Anthropic API key is used; it never reaches the browser. The factory is given
// the use cases an app exposes and returns a web-standard request handler that
// Netlify Functions can serve. Streams the draft, with a vetted saved-example
// fallback on any failure so the demo never dies on stage.
// =============================================================================
import Anthropic from "@anthropic-ai/sdk";
import type { DraftRequestBody, UseCase } from "../types";
import { resolveCase, validateUseCase } from "../use-case";
import { DRAFT_SOURCE_HEADER, STREAM_ERROR_MARKER } from "../protocol";
import { createRateLimiter } from "./rate-limit";

export interface DraftHandlerConfig {
  useCases: UseCase[];
  /** Explicit model override. Otherwise read from ANTHROPIC_MODEL env, with NO
   *  hardcoded fallback: a missing model fails loudly so it is caught in config. */
  model?: string;
  maxTokens?: number;
  freeTextCap?: number;
  rateLimit?: { limit: number; windowMs: number };
  /** Reads the API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  getApiKey?: () => string | undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function savedExample(draft: string, reason: string): Response {
  return json({ source: "saved-example", fallback: true, reason, draft });
}

// The exact request body for the streaming draft call. No `temperature`: it is
// deprecated on current models (sending it returns a 400), so the key is
// omitted entirely. Exported so a unit test can assert no temperature is sent.
export function buildDraftStreamRequest(opts: {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  prompt: string;
}): Anthropic.MessageStreamParams {
  return {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.prompt }],
  };
}

export type DraftHandler = (req: Request) => Promise<Response>;

export function createDraftHandler(config: DraftHandlerConfig): DraftHandler {
  config.useCases.forEach(validateUseCase);
  const byId = new Map(config.useCases.map((u) => [u.id, u]));
  const maxTokens = config.maxTokens ?? 1500;
  const freeTextCap = config.freeTextCap ?? 6000;
  const rateLimited = createRateLimiter(
    config.rateLimit?.limit ?? 10,
    config.rateLimit?.windowMs ?? 60_000,
  );
  const getApiKey = config.getApiKey ?? (() => process.env.ANTHROPIC_API_KEY);

  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

    const ip =
      req.headers.get("x-nf-client-connection-ip") ??
      req.headers.get("x-forwarded-for") ??
      "unknown";
    if (rateLimited(ip)) {
      return json({ error: "Too many requests. Wait a minute and try again." }, 429);
    }

    let payload: DraftRequestBody;
    try {
      payload = (await req.json()) as DraftRequestBody;
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }

    const uc: UseCase | undefined = byId.get(payload.useCaseId);
    if (!uc) return json({ error: "Unknown use case." }, 400);

    if (typeof payload.freeText === "string" && payload.freeText.length > freeTextCap) {
      return json({ error: `Input is too long. Limit ${freeTextCap} characters.` }, 400);
    }

    const resolved = resolveCase(uc, {
      instanceId: payload.instanceId,
      freeText: payload.freeText,
    });
    if (!resolved) return json({ error: "Unknown example. Pick one or paste your own." }, 400);

    const prompt = uc.buildPrompt(resolved.promptInput);

    const apiKey = getApiKey();
    if (!apiKey) return savedExample(resolved.fallbackDraft, "no-api-key");

    // Model comes from env with no fallback. A key but no model is a real
    // misconfiguration, so fail loudly rather than silently picking a default.
    const model = config.model ?? process.env.ANTHROPIC_MODEL;
    if (!model) {
      console.error("[draft] missing ANTHROPIC_MODEL");
      return json({ error: "Service is not configured. Try again later." }, 503);
    }

    let messageStream: ReturnType<Anthropic["messages"]["stream"]>;
    try {
      const client = new Anthropic({ apiKey });
      messageStream = client.messages.stream(
        buildDraftStreamRequest({ model, maxTokens, systemPrompt: uc.systemPrompt, prompt }),
      );
    } catch {
      return savedExample(resolved.fallbackDraft, "init-error");
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let emitted = false;
        messageStream.on("text", (text: string) => {
          emitted = true;
          controller.enqueue(encoder.encode(text));
        });
        messageStream.on("error", () => {
          // If we have not emitted any text yet, mark the stream so the client
          // can swap in the local vetted fallback.
          if (!emitted) controller.enqueue(encoder.encode(STREAM_ERROR_MARKER));
          controller.close();
        });
        messageStream.on("end", () => controller.close());
      },
      cancel() {
        messageStream.abort();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        [DRAFT_SOURCE_HEADER]: "live",
        "cache-control": "no-store",
      },
    });
  };
}
