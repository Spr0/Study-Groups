import { describe, it, expect } from "vitest";
import { submittalReview } from "./submittal";
import { CASCADE_RIDGE } from "./project";
import { validateUseCase, resolveCase } from "@sg/core";

describe("submittal use case config", () => {
  it("is a valid use case", () => {
    expect(() => validateUseCase(submittalReview)).not.toThrow();
  });
  it("has the three instances in order, easy to hard", () => {
    expect(submittalReview.instances.map((i) => i.id)).toEqual([
      "rebar-shop-drawings",
      "door-hardware",
      "fire-rated-openings",
    ]);
  });
  it("uses the shared Cascade Ridge project", () => {
    expect(submittalReview.project).toBe(CASCADE_RIDGE);
    expect(submittalReview.project.gc).toBe("Cascade Ridge Construction");
  });
  it("has no em or en dashes in any fallback draft", () => {
    for (const inst of submittalReview.instances) {
      expect(inst.fallbackDraft).not.toMatch(/[–—]/);
    }
    expect(submittalReview.freeTextFallback).not.toMatch(/[–—]/);
  });
});

describe("buildPrompt (instance)", () => {
  it("splits spec requirements from submitted product data and cites the right facts", () => {
    const r = resolveCase(submittalReview, { instanceId: "door-hardware" });
    const p = submittalReview.buildPrompt(r!.promptInput);
    expect(p).toContain("Spec requirements:");
    expect(p).toContain("Submitted product data:");
    expect(p).toContain("2.1 Locksets: ANSI/BHMA A156.2, Series 4000, Grade 1.");
    expect(p).toContain("Sentry 4000 Series, ANSI/BHMA A156.2, Grade 2");
    expect(p).toContain("BHMA 626 (satin chrome)");
    expect(p).toContain("Revise and Resubmit");
    expect(p).toContain("Flag anything missing");
  });
  it("includes the UL gap for the fire-rated instance", () => {
    const r = resolveCase(submittalReview, { instanceId: "fire-rated-openings" });
    const p = submittalReview.buildPrompt(r!.promptInput);
    expect(p).toContain("UL fire listing / label for rated assemblies: not indicated");
    expect(p).toContain("2.5 Fire-rated openings");
  });
});

describe("buildPrompt (free text)", () => {
  it("passes pasted text through as the submitted material", () => {
    const r = resolveCase(submittalReview, { freeText: "Paste of a random submittal and spec" });
    const p = submittalReview.buildPrompt(r!.promptInput);
    expect(p).toContain("Submitted material and spec (as provided):");
    expect(p).toContain("Paste of a random submittal and spec");
  });
});

describe("fallback selection", () => {
  it("rebar resolves to an Approved fallback", () => {
    const r = resolveCase(submittalReview, { instanceId: "rebar-shop-drawings" });
    expect(r!.fallbackDraft).toContain("Disposition: Approved");
    expect(r!.fallbackDraft).toContain("03-02");
  });
  it("door hardware resolves to a Revise and Resubmit citing 2.1 and 2.4", () => {
    const r = resolveCase(submittalReview, { instanceId: "door-hardware" });
    expect(r!.fallbackDraft).toContain("Disposition: Revise and Resubmit");
    expect(r!.fallbackDraft).toContain("Spec 2.1");
    expect(r!.fallbackDraft).toContain("Spec 2.4");
  });
  it("fire-rated resolves to a fallback that flags the missing UL listing", () => {
    const r = resolveCase(submittalReview, { instanceId: "fire-rated-openings" });
    expect(r!.fallbackDraft).toContain("Disposition: Revise and Resubmit");
    expect(r!.fallbackDraft).toMatch(/UL/);
    expect(r!.fallbackDraft).toContain("Missing information");
  });
  it("unknown instance resolves to null", () => {
    expect(resolveCase(submittalReview, { instanceId: "nope" })).toBeNull();
  });
});
