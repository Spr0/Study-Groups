import { describe, it, expect } from "vitest";
import { rfiDraft } from "./rfi";
import { CASCADE_RIDGE } from "./project";
import { validateUseCase, resolveCase } from "@sg/core";

describe("rfi use case config", () => {
  it("is a valid use case", () => {
    expect(() => validateUseCase(rfiDraft)).not.toThrow();
  });
  it("has the three issues in order", () => {
    expect(rfiDraft.instances.map((i) => i.id)).toEqual([
      "concrete-strength",
      "duct-clash",
      "firestop-missing",
    ]);
  });
  it("uses the shared Cascade Ridge project and the rfi ROI config", () => {
    expect(rfiDraft.project).toBe(CASCADE_RIDGE);
    expect(rfiDraft.roiAppKey).toBe("rfi");
  });
  it("uses the canonical internal-approval provenance, never signature language", () => {
    expect(rfiDraft.approval.provenanceNote).toBe("approved by the named reviewer before issue");
    expect(JSON.stringify(rfiDraft)).not.toMatch(/verified by a person|signature/i);
  });
  it("has no em or en dashes in any fallback draft", () => {
    for (const inst of rfiDraft.instances) {
      expect(inst.fallbackDraft).not.toMatch(/[–—]/);
    }
    expect(rfiDraft.freeTextFallback).not.toMatch(/[–—]/);
  });
});

describe("buildPrompt (instance)", () => {
  it("injects the issue text and cites the relevant reference documents", () => {
    const r = resolveCase(rfiDraft, { instanceId: "concrete-strength" });
    const p = rfiDraft.buildPrompt(r!.promptInput);
    expect(p).toContain("The issue:");
    expect(p).toContain("conflicts between disciplines");
    expect(p).toContain("Spec - 03 30 00 Cast-in-Place Concrete");
    expect(p).toContain("Drawing - S-101 General Structural Notes");
    // The "Issue" carrier doc is not rendered into the documents block.
    expect(p).not.toContain("- Issue\n");
  });
  it("shows the arithmetic source facts for the duct clash", () => {
    const r = resolveCase(rfiDraft, { instanceId: "duct-clash" });
    const p = rfiDraft.buildPrompt(r!.promptInput);
    expect(p).toContain('10\'-2" AFF');
    expect(p).toContain('30" x 12"');
  });
});

describe("buildPrompt (free text)", () => {
  it("passes pasted text through as the issue and includes all reference docs", () => {
    const r = resolveCase(rfiDraft, { freeText: "A made up site conflict" });
    const p = rfiDraft.buildPrompt(r!.promptInput);
    expect(p).toContain("The issue: A made up site conflict");
    expect(p).toContain("Drawing - LS-101 Life Safety");
  });
});

describe("fallback selection", () => {
  it("concrete-strength resolves to RFI No. 001", () => {
    const r = resolveCase(rfiDraft, { instanceId: "concrete-strength" });
    expect(r!.fallbackDraft).toContain("RFI No.: 001");
  });
  it("unknown instance resolves to null", () => {
    expect(resolveCase(rfiDraft, { instanceId: "nope" })).toBeNull();
  });
});
