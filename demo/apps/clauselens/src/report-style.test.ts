import { describe, it, expect } from "vitest";
import {
  isMaterialGapItem,
  isOneSidedItem,
  normalizeResultCopy,
  styleRaiseItems,
} from "./report-style";
import { SAMPLE_FALLBACK_RESULT, STATUS_FOUND, type ClauseResult } from "@sg/sample-data";

describe("material-gap detection", () => {
  it("flags the raise item naming the Not Found clause", () => {
    expect(isMaterialGapItem(SAMPLE_FALLBACK_RESULT.raise[0]!, SAMPLE_FALLBACK_RESULT)).toBe(true);
  });
  it("does not flag items about Found clauses", () => {
    expect(isMaterialGapItem(SAMPLE_FALLBACK_RESULT.raise[1]!, SAMPLE_FALLBACK_RESULT)).toBe(false);
    expect(isMaterialGapItem(SAMPLE_FALLBACK_RESULT.raise[2]!, SAMPLE_FALLBACK_RESULT)).toBe(false);
  });
});

describe("one-sided detection", () => {
  it("flags the vetted one-direction indemnity and convenience-termination items", () => {
    expect(isOneSidedItem(SAMPLE_FALLBACK_RESULT.raise[1]!)).toBe(true);
    expect(isOneSidedItem(SAMPLE_FALLBACK_RESULT.raise[2]!)).toBe(true);
  });
  it("leaves neutral items unflagged", () => {
    expect(isOneSidedItem("Retainage is 5 percent, released 60 days after acceptance.")).toBe(
      false,
    );
  });
});

describe("styleRaiseItems (presentation order)", () => {
  it("puts material gaps first and preserves order within groups", () => {
    const styled = styleRaiseItems(SAMPLE_FALLBACK_RESULT);
    expect(styled.map((i) => i.materialGap)).toEqual([true, false, false]);
    expect(styled[0]!.text).toMatch(/^No Liability Cap\./);
    expect(styled[1]!.text).toBe(SAMPLE_FALLBACK_RESULT.raise[1]);
  });
  it("reorders when the gap item arrives later in the list", () => {
    const shuffled: ClauseResult = {
      clauses: SAMPLE_FALLBACK_RESULT.clauses,
      raise: [
        SAMPLE_FALLBACK_RESULT.raise[1]!,
        SAMPLE_FALLBACK_RESULT.raise[0]!,
        SAMPLE_FALLBACK_RESULT.raise[2]!,
      ],
    };
    const styled = styleRaiseItems(shuffled);
    expect(styled[0]!.materialGap).toBe(true);
    expect(styled[0]!.text).toMatch(/^No Liability Cap\./);
  });
});

describe("normalizeResultCopy (render-boundary copy hygiene)", () => {
  it("strips em and en dashes from every rendered string, structure unchanged", () => {
    const dirty: ClauseResult = {
      clauses: [
        {
          name: "Term",
          quote: "runs for 18 months — no longer",
          plain: "18 months – hard stop",
          status: STATUS_FOUND,
        },
      ],
      raise: ["One-sided — favors the Contractor"],
    };
    const clean = normalizeResultCopy(dirty);
    expect(JSON.stringify(clean)).not.toMatch(/[–—]/);
    expect(clean.clauses).toHaveLength(1);
    expect(clean.clauses[0]!.status).toBe(STATUS_FOUND);
    expect(clean.raise).toHaveLength(1);
  });
  it("is a no-op on the already-clean vetted result", () => {
    expect(normalizeResultCopy(SAMPLE_FALLBACK_RESULT)).toEqual(SAMPLE_FALLBACK_RESULT);
  });
});
