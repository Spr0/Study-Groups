import { describe, it, expect } from "vitest";
import { buildDraftStreamRequest } from "./index";

describe("draft stream request body", () => {
  const req = buildDraftStreamRequest({
    model: "claude-current",
    maxTokens: 1500,
    systemPrompt: "system prompt",
    prompt: "the user prompt",
  });

  it("sends NO temperature key (deprecated on current models; sending it 400s)", () => {
    expect("temperature" in req).toBe(false);
    expect(Object.keys(req)).not.toContain("temperature");
  });

  it("carries the model, max_tokens, system, and the user message", () => {
    expect(req.model).toBe("claude-current");
    expect(req.max_tokens).toBe(1500);
    expect(req.system).toBe("system prompt");
    expect(req.messages).toEqual([{ role: "user", content: "the user prompt" }]);
  });
});
