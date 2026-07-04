import { describe, it, expect } from "vitest";
import { clauseReview, FIVE_CLAUSES } from "./clauses";
import { CASCADE_RIDGE } from "./project";
import { validateUseCase, resolveCase } from "@sg/core";

describe("clause-review use case config", () => {
  it("is a valid use case", () => {
    expect(() => validateUseCase(clauseReview)).not.toThrow();
  });
  it("uses the shared Cascade Ridge project and the clauselens ROI config", () => {
    expect(clauseReview.project).toBe(CASCADE_RIDGE);
    expect(clauseReview.roiAppKey).toBe("clauselens");
  });
  it("uses the canonical internal-approval provenance, never signature language", () => {
    expect(clauseReview.approval.label).toBe("Reviewed and approved by");
    expect(JSON.stringify(clauseReview)).not.toMatch(/verified by a person|signature/i);
  });
  it("has no em or en dashes in any fallback draft or prompt copy", () => {
    for (const inst of clauseReview.instances) {
      expect(inst.fallbackDraft).not.toMatch(/[–—]/);
    }
    expect(clauseReview.freeTextFallback).not.toMatch(/[–—]/);
    expect(clauseReview.systemPrompt).not.toMatch(/[–—]/);
  });
  it("names all five clauses in the system prompt, in order", () => {
    const idx = FIVE_CLAUSES.map((c) => clauseReview.systemPrompt.indexOf(c));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});

describe("the sample fallback (the vetted cached review)", () => {
  const fallback = clauseReview.instances[0]!.fallbackDraft;
  it("marks Liability Cap Not Found and every other clause Found", () => {
    expect(fallback).toContain("## Liability Cap: Not Found");
    for (const c of FIVE_CLAUSES.filter((c) => c !== "Liability Cap")) {
      expect(fallback).toContain(`## ${c}: Found`);
    }
  });
  it("leads the raise list with the missing Liability Cap", () => {
    const raise = fallback.split("# Raise Before Signing")[1] ?? "";
    expect(raise.trim().startsWith("1. No Liability Cap.")).toBe(true);
  });
  it("quotes only language that appears verbatim in the sample contract", () => {
    const contract = clauseReview.instances[0]!.documents[0]!.body;
    const quotes = [...fallback.matchAll(/^"(.+)"$/gm)].map((m) => m[1] ?? "");
    expect(quotes.length).toBeGreaterThanOrEqual(4);
    for (const q of quotes) {
      // The vetted quotes may end a clause early; the closing period is added.
      expect(contract).toContain(q.replace(/\.$/, ""));
    }
  });
});

describe("buildPrompt", () => {
  it("injects the sample contract text for the instance", () => {
    const r = resolveCase(clauseReview, { instanceId: "cascade-ridge-subcontract" });
    const p = clauseReview.buildPrompt(r!.promptInput);
    expect(p).toContain("SUBCONTRACT AGREEMENT");
    expect(p).toContain("Summit Mechanical Services LLC");
    expect(p).toContain("Term, Payment, Termination, Liability Cap, Indemnity");
  });
  it("passes pasted text through as the contract", () => {
    const r = resolveCase(clauseReview, { freeText: "A made up two line contract." });
    const p = clauseReview.buildPrompt(r!.promptInput);
    expect(p).toContain("The contract:\nA made up two line contract.");
  });
});

describe("fallback selection", () => {
  it("the sample instance resolves to the vetted review", () => {
    const r = resolveCase(clauseReview, { instanceId: "cascade-ridge-subcontract" });
    expect(r!.fallbackDraft).toContain("## Liability Cap: Not Found");
    expect(r!.isFreeText).toBe(false);
  });
  it("free text resolves to the generic template fallback", () => {
    const r = resolveCase(clauseReview, { freeText: "some contract" });
    expect(r!.fallbackDraft).toContain("saved example template");
  });
  it("unknown instance resolves to null", () => {
    expect(resolveCase(clauseReview, { instanceId: "nope" })).toBeNull();
  });
});
