import { describe, it, expect, vi } from "vitest";
import {
  buildExplainPrompt,
  buildExtractPrompt,
  CONTRACT_OPTIONS,
  EXPLAIN_SYSTEM_PROMPT,
  EXTRACT_SYSTEM_PROMPT,
  FIVE_CLAUSES,
  foundCount,
  isValidResult,
  isVettedContract,
  NOT_FOUND,
  parseClauseResponse,
  reviewContract,
  SAMPLE_CONTRACT_TEXT,
  SAMPLE_EXPLAIN_FALLBACKS,
  SAMPLE_FALLBACK_RESULT,
  STATUS_FOUND,
  STATUS_NOT_FOUND,
  type ClauseResult,
} from "./clauses";

describe("the vetted sample fallback (the cached review the demo relies on)", () => {
  it("is a valid, gated result", () => {
    expect(isValidResult(SAMPLE_FALLBACK_RESULT)).toBe(true);
    expect(foundCount(SAMPLE_FALLBACK_RESULT)).toBe(4);
  });
  it("marks Liability Cap Not Found and every other clause Found", () => {
    for (const c of SAMPLE_FALLBACK_RESULT.clauses) {
      if (c.name === "Liability Cap") {
        expect(c.status).toBe(STATUS_NOT_FOUND);
        expect(c.quote).toBe(NOT_FOUND);
        expect(c.plain).toBe("");
      } else {
        expect(c.status).toBe(STATUS_FOUND);
      }
    }
  });
  it("leads the raise list with the missing Liability Cap", () => {
    expect(SAMPLE_FALLBACK_RESULT.raise[0]).toMatch(/^No Liability Cap\./);
  });
  it("quotes only language that appears verbatim in the sample contract", () => {
    for (const c of SAMPLE_FALLBACK_RESULT.clauses) {
      if (c.status !== STATUS_FOUND) continue;
      // The vetted quotes may end a clause early; the closing period is added.
      expect(SAMPLE_CONTRACT_TEXT).toContain(c.quote.replace(/\.$/, ""));
    }
  });
  it("is wired to the sample contract option", () => {
    const opt = CONTRACT_OPTIONS.find((o) => o.id === "cascade-ridge-subcontract");
    expect(opt).toBeDefined();
    expect(opt!.contractText).toBe(SAMPLE_CONTRACT_TEXT);
    expect(opt!.fallbackResult).toBe(SAMPLE_FALLBACK_RESULT);
  });
  it("carries a vetted explanation for every clause", () => {
    for (const name of FIVE_CLAUSES) {
      expect(SAMPLE_EXPLAIN_FALLBACKS[name]).toBeTruthy();
    }
  });
  it("has no em or en dashes anywhere in the vetted copy or prompts", () => {
    const all = JSON.stringify({
      SAMPLE_FALLBACK_RESULT,
      SAMPLE_EXPLAIN_FALLBACKS,
      EXTRACT_SYSTEM_PROMPT,
      EXPLAIN_SYSTEM_PROMPT,
    });
    expect(all).not.toMatch(/[–—]/);
  });
});

describe("prompt builders (pure; the extract prompt is shown verbatim)", () => {
  it("extract prompt names the five clauses and carries the contract", () => {
    const p = buildExtractPrompt(SAMPLE_CONTRACT_TEXT);
    expect(p).toContain("Term, Payment, Termination, Liability Cap, Indemnity");
    expect(p).toContain("SUBCONTRACT AGREEMENT");
    expect(p).toContain("Summit Mechanical Services LLC");
  });
  it("explain prompt carries the clause, quote, and optional plain line", () => {
    const p = buildExplainPrompt("Term", "the exact words", "a plain line");
    expect(p).toContain("Clause: Term");
    expect(p).toContain("the exact words");
    expect(p).toContain("Plain restatement: a plain line");
    expect(buildExplainPrompt("Term", "q")).not.toContain("Plain restatement:");
  });
});

describe("parseClauseResponse (the gate against a false table)", () => {
  const goodJson = JSON.stringify({
    clauses: FIVE_CLAUSES.map((name) => ({
      name,
      quote: name === "Liability Cap" ? "Not Found." : `Exact ${name} words.`,
      plain: name === "Liability Cap" ? "" : `Plain ${name}.`,
      status: name === "Liability Cap" ? "Not Found" : "Found",
    })),
    raise: ["No Liability Cap.", "  ", "One-way indemnity."],
  });

  it("parses a clean JSON response into canonical order", () => {
    const r = parseClauseResponse(goodJson);
    expect(isValidResult(r)).toBe(true);
    expect(r!.clauses.map((c) => c.name)).toEqual(FIVE_CLAUSES);
    expect(r!.raise).toEqual(["No Liability Cap.", "One-way indemnity."]);
  });
  it("parses JSON wrapped in prose or fences", () => {
    const r = parseClauseResponse("Here you go:\n```json\n" + goodJson + "\n```\nDone.");
    expect(isValidResult(r)).toBe(true);
  });
  it("normalizes a missing or blank clause entry to Not Found", () => {
    const partial = JSON.stringify({
      clauses: [{ name: "Term", quote: "words", plain: "p", status: "Found" }],
      raise: [],
    });
    const r = parseClauseResponse(partial);
    expect(isValidResult(r)).toBe(true);
    expect(r!.clauses.filter((c) => c.status === STATUS_NOT_FOUND)).toHaveLength(4);
    expect(r!.clauses[1]!.quote).toBe(NOT_FOUND);
  });
  it('treats "not found" phrasings and empty quotes as absent', () => {
    const j = JSON.stringify({
      clauses: [
        { name: "Term", quote: "NOT FOUND", plain: "x", status: "Found" },
        { name: "Payment", quote: "   ", plain: "x", status: "Found" },
      ],
      raise: [],
    });
    const r = parseClauseResponse(j);
    expect(r!.clauses[0]!.status).toBe(STATUS_NOT_FOUND);
    expect(r!.clauses[0]!.plain).toBe("");
    expect(r!.clauses[1]!.status).toBe(STATUS_NOT_FOUND);
  });
  it("returns null on garbage, non-JSON, and non-object payloads", () => {
    expect(parseClauseResponse("no json here")).toBeNull();
    expect(parseClauseResponse("{ broken json")).toBeNull();
    expect(parseClauseResponse(undefined)).toBeNull();
    expect(parseClauseResponse(42 as unknown as string)).toBeNull();
  });
});

describe("isVettedContract (content-hash recognition of the demo contract)", () => {
  it("recognizes the sample contract, and a whitespace/case variant of it", async () => {
    expect(await isVettedContract(SAMPLE_CONTRACT_TEXT)).toBe(true);
    // Only [a-z0-9] survive normalization, so reflowed whitespace, line breaks,
    // and case (as a dropped PDF's extracted text differs) still match.
    const reflowed = SAMPLE_CONTRACT_TEXT.replace(/\s+/g, " ").toUpperCase().trim();
    expect(await isVettedContract(reflowed)).toBe(true);
  });
  it("does not recognize any other contract", async () => {
    expect(await isVettedContract("Some other agreement between two other parties.")).toBe(false);
    expect(await isVettedContract("")).toBe(false);
  });
});

describe("reviewContract (the single shared entry point for both paths)", () => {
  const liveResult: ClauseResult = {
    clauses: FIVE_CLAUSES.map((name) => ({
      name,
      quote: `Live ${name} language.`,
      plain: `Live ${name}.`,
      status: STATUS_FOUND,
    })),
    raise: ["A live finding.", "Another live finding.", "A third.", "A fourth.", "A fifth."],
  };

  it("short-circuits the demo contract to the vetted result WITHOUT any inference attempt", async () => {
    const runLive = vi.fn(async () => liveResult);
    const outcome = await reviewContract(SAMPLE_CONTRACT_TEXT, runLive);
    // The hash short-circuit precedes any inference: runLive is never reached.
    expect(runLive).not.toHaveBeenCalled();
    expect(outcome.mode).toBe("vetted");
    expect(outcome.result).toBe(SAMPLE_FALLBACK_RESULT);
    // Byte-for-byte the canonical three findings, regardless of path.
    expect(outcome.result.raise).toEqual(SAMPLE_FALLBACK_RESULT.raise);
    expect(outcome.result.raise).toHaveLength(3);
  });

  it("short-circuits a whitespace/case variant of the demo contract too", async () => {
    const runLive = vi.fn(async () => liveResult);
    const reflowed = SAMPLE_CONTRACT_TEXT.replace(/\s+/g, " ").toUpperCase().trim();
    const outcome = await reviewContract(reflowed, runLive);
    expect(runLive).not.toHaveBeenCalled();
    expect(outcome.mode).toBe("vetted");
    expect(outcome.result).toBe(SAMPLE_FALLBACK_RESULT);
  });

  it("runs live for any other contract and returns that result unchanged", async () => {
    const runLive = vi.fn(async () => liveResult);
    const outcome = await reviewContract("A wholly different contract.", runLive);
    expect(runLive).toHaveBeenCalledTimes(1);
    expect(runLive).toHaveBeenCalledWith("A wholly different contract.");
    expect(outcome.mode).toBe("live");
    expect(outcome.result).toBe(liveResult);
  });

  it("propagates a live failure (arbitrary contracts are never given a fabricated table)", async () => {
    const runLive = vi.fn(async () => {
      throw new Error("live review failed");
    });
    await expect(reviewContract("Another different contract.", runLive)).rejects.toThrow(
      "live review failed",
    );
  });
});

describe("isValidResult", () => {
  it("rejects wrong clause order, missing fields, and non-arrays", () => {
    expect(isValidResult(null)).toBe(false);
    expect(isValidResult({})).toBe(false);
    const shuffled = {
      clauses: [...SAMPLE_FALLBACK_RESULT.clauses].reverse(),
      raise: [],
    };
    expect(isValidResult(shuffled)).toBe(false);
    const noRaise = { clauses: SAMPLE_FALLBACK_RESULT.clauses };
    expect(isValidResult(noRaise)).toBe(false);
  });
});
