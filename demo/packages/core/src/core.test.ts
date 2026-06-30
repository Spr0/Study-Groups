import { describe, it, expect } from "vitest";
import { normalizeDashes, renderMarkdown, markdownToPlainText } from "./markdown";
import { buildApprovalLine, buildCopyText } from "./approval";
import { validateUseCase, resolveCase, UseCaseConfigError } from "./use-case";
import type { ApprovalConfig, UseCase } from "./types";

const approval: ApprovalConfig = {
  label: "Reviewed and approved by",
  provenanceNote: "approved by the named reviewer before issue",
};
const approver = { name: "Pat Morgan", role: "Project Manager", date: "June 30, 2026" };

function makeUseCase(overrides: Partial<UseCase> = {}): UseCase {
  return {
    id: "t",
    label: "T",
    outputType: "Review",
    project: { name: "Lakeview", gc: "Cascade", location: "Bellingham, WA" },
    instances: [
      { id: "i1", label: "Example one", documents: [{ title: "D", body: "B" }], fallbackDraft: "ONE" },
    ],
    systemPrompt: "system",
    buildPrompt: (input) => input.freeText ?? input.instance?.label ?? "",
    reviewChecklist: ["check one"],
    approval,
    standingLine: "a person reviews and sends every response.",
    freeTextFallback: "FREE",
    ...overrides,
  };
}

describe("normalizeDashes", () => {
  it("replaces em and en dashes with hyphens", () => {
    expect(normalizeDashes("a – b — c")).toBe("a - b - c");
  });
  it("preserves legitimate hyphens", () => {
    expect(normalizeDashes(`10'-2" and 1-hour and A156.2`)).toBe(`10'-2" and 1-hour and A156.2`);
  });
});

describe("renderMarkdown", () => {
  it("renders bold, lists, and tables", () => {
    const html = renderMarkdown("**Bold**\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<table");
    expect(html).toContain("<td>1</td>");
  });
  it("escapes HTML", () => {
    expect(renderMarkdown("<script>")).toContain("&lt;script&gt;");
  });
});

describe("markdownToPlainText", () => {
  it("strips markdown markers and dashes", () => {
    const out = markdownToPlainText("## Heading\n\n**bold** and a — dash");
    expect(out).toContain("Heading");
    expect(out).not.toContain("##");
    expect(out).not.toContain("**");
    expect(out).not.toMatch(/[–—]/);
  });
});

describe("approval block", () => {
  const CANON =
    "Reviewed and approved by Pat Morgan, Project Manager, on June 30, 2026. Drafted with AI assistance; approved by the named reviewer before issue.";
  it("builds the canonical approval line with name, role, and date", () => {
    expect(buildApprovalLine(approval, approver)).toBe(CANON);
  });
  it("never uses signature language", () => {
    expect(buildApprovalLine(approval, approver)).not.toMatch(/verified by a person|signature/i);
  });
  it("inserts the approval block into the copied output only when approved", () => {
    const body = "Draft body **here**.";
    expect(buildCopyText(body, approval, null)).not.toContain("Reviewed and approved by");
    const copied = buildCopyText(body, approval, approver);
    expect(copied).toContain("Draft body here.");
    expect(copied).toContain(CANON);
  });
});

describe("validateUseCase", () => {
  it("accepts a well-formed use case", () => {
    expect(() => validateUseCase(makeUseCase())).not.toThrow();
  });
  it("rejects a use case with no instances", () => {
    expect(() => validateUseCase(makeUseCase({ instances: [] }))).toThrow(UseCaseConfigError);
  });
  it("rejects duplicate instance ids", () => {
    const dup = makeUseCase({
      instances: [
        { id: "x", label: "a", documents: [{ title: "t", body: "b" }], fallbackDraft: "f" },
        { id: "x", label: "b", documents: [{ title: "t", body: "b" }], fallbackDraft: "f" },
      ],
    });
    expect(() => validateUseCase(dup)).toThrow(/duplicate/);
  });
});

describe("resolveCase", () => {
  const uc = makeUseCase();
  it("resolves an instance to its fallback", () => {
    const r = resolveCase(uc, { instanceId: "i1" });
    expect(r?.fallbackDraft).toBe("ONE");
    expect(r?.isFreeText).toBe(false);
  });
  it("resolves free text to the free-text fallback", () => {
    const r = resolveCase(uc, { freeText: "hello" });
    expect(r?.isFreeText).toBe(true);
    expect(r?.fallbackDraft).toBe("FREE");
  });
  it("returns null for an unknown instance", () => {
    expect(resolveCase(uc, { instanceId: "nope" })).toBeNull();
  });
});
