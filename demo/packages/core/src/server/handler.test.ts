import { describe, it, expect } from "vitest";
import { createDraftHandler } from "./index";
import type { UseCase } from "../types";

const fakeUseCase: UseCase = {
  id: "t",
  label: "Test",
  outputType: "Review",
  project: { name: "Lakeview", gc: "Cascade", location: "Bellingham, WA" },
  instances: [
    {
      id: "i1",
      label: "Example one",
      documents: [{ title: "D", body: "B" }],
      fallbackDraft: "VETTED FALLBACK ONE",
    },
  ],
  systemPrompt: "system",
  buildPrompt: (input) => input.freeText ?? input.instance?.label ?? "",
  reviewChecklist: ["check"],
  approval: { label: "Reviewed and approved by", provenanceNote: "drafted with AI assistance" },
  standingLine: "a person reviews and sends every response.",
  freeTextFallback: "FREE FALLBACK",
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("createDraftHandler (smoke)", () => {
  // No API key: every call returns the vetted saved-example fallback as JSON.
  const handler = createDraftHandler({ useCases: [fakeUseCase], getApiKey: () => undefined });

  it("rejects non-POST", async () => {
    const res = await handler(new Request("http://localhost/api/draft", { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("returns the instance fallback as JSON when there is no API key", async () => {
    const res = await handler(post({ useCaseId: "t", instanceId: "i1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const data = (await res.json()) as { source: string; draft: string; reason: string };
    expect(data.source).toBe("saved-example");
    expect(data.reason).toBe("no-api-key");
    expect(data.draft).toBe("VETTED FALLBACK ONE");
  });

  it("returns the free-text fallback for free text", async () => {
    const res = await handler(post({ useCaseId: "t", freeText: "hello" }));
    const data = (await res.json()) as { draft: string };
    expect(data.draft).toBe("FREE FALLBACK");
  });

  it("rejects an unknown use case", async () => {
    const res = await handler(post({ useCaseId: "nope" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown instance", async () => {
    const res = await handler(post({ useCaseId: "t", instanceId: "ghost" }));
    expect(res.status).toBe(400);
  });

  it("caps free-text length", async () => {
    const capped = createDraftHandler({
      useCases: [fakeUseCase],
      getApiKey: () => undefined,
      freeTextCap: 10,
    });
    const res = await capped(post({ useCaseId: "t", freeText: "x".repeat(50) }));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid JSON body", async () => {
    const res = await handler(
      new Request("http://localhost/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
