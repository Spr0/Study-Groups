// =============================================================================
// Client-side draft fetch + stream reader. Knows nothing about the use case.
// =============================================================================
import type { DraftRequestBody } from "./types";
import { STREAM_ERROR_MARKER } from "./protocol";

export interface DraftResult {
  /** True when the server returned a vetted saved-example fallback (JSON). */
  saved: boolean;
  text: string;
}

/**
 * Post a draft request. If the server returns JSON, it is a saved-example
 * fallback. Otherwise the body is streamed; `onUpdate` is called with the
 * accumulated text as it grows. Throws on stream error or empty output so the
 * caller can swap in the local vetted fallback.
 */
export async function fetchDraft(
  endpoint: string,
  body: DraftRequestBody,
  onUpdate: (text: string) => void,
): Promise<DraftResult> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const ctype = res.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const data = (await res.json()) as { draft?: string };
    const text = data.draft ?? "";
    onUpdate(text);
    return { saved: true, text };
  }

  if (!res.body) throw new Error("No response body to stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    if (acc.includes(STREAM_ERROR_MARKER)) throw new Error("Model stream error");
    onUpdate(acc);
  }
  if (!acc.trim()) throw new Error("Empty draft");
  return { saved: false, text: acc };
}
