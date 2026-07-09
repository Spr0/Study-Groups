import { describe, it, expect } from "vitest";
import { buildModelRequest } from "./analyze";

describe("analyze model request body", () => {
  const req = buildModelRequest({
    model: "claude-current",
    system: "system prompt",
    userText: "the contract text",
    maxTokens: 3000,
  });

  it("sends NO temperature key (deprecated on current models; sending it 400s)", () => {
    expect("temperature" in req).toBe(false);
    expect(Object.keys(req)).not.toContain("temperature");
  });

  it("carries the model, max_tokens, system, and the user message", () => {
    expect(req.model).toBe("claude-current");
    expect(req.max_tokens).toBe(3000);
    expect(req.system).toBe("system prompt");
    expect(req.messages).toEqual([{ role: "user", content: "the contract text" }]);
  });
});
