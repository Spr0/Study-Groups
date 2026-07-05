import { describe, it, expect } from "vitest";
import {
  buildApprovalEmail,
  buildIngestPayload,
  buildSignatoryEmail,
  buildSignedSummaryText,
  buildSignoffPageHtml,
  decodePayload,
  encodePayload,
  FICTIONAL_REVIEWER_EMAIL,
  FICTIONAL_SENDER,
  FICTIONAL_SIGNATORY,
  FICTIONAL_WATCH_REVIEWER,
  isCompletePayload,
  type SignoffPayload,
} from "./demo-templates";
import {
  FIVE_CLAUSES,
  SAMPLE_FALLBACK_RESULT,
  fingerprintContract,
  SAMPLE_CONTRACT_TEXT,
  normalizeForFingerprint,
} from "@sg/sample-data";

const payload: SignoffPayload = {
  source: "cascade-ridge-subcontract.pdf",
  reviewer: { name: "J. Alvarez", role: "PM", date: "July 4, 2026" },
  result: SAMPLE_FALLBACK_RESULT,
  verified: [...FIVE_CLAUSES],
  approvedAtIso: "2026-07-04T20:00:00.000Z",
};

describe("the human gate (isCompletePayload)", () => {
  it("accepts a complete, five-times-verified payload", () => {
    expect(isCompletePayload(payload)).toBe(true);
  });
  it("rejects a payload missing any verified clause", () => {
    expect(isCompletePayload({ ...payload, verified: FIVE_CLAUSES.slice(1) })).toBe(false);
    expect(isCompletePayload({ ...payload, verified: [] })).toBe(false);
  });
  it("rejects a payload without a named reviewer", () => {
    expect(isCompletePayload({ ...payload, reviewer: { name: " ", role: "PM", date: "x" } })).toBe(
      false,
    );
  });
});

describe("payload codec (the stateless sign-off link)", () => {
  it("round-trips through base64url", () => {
    const encoded = encodePayload(payload);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodePayload(encoded)).toEqual(payload);
  });
  it("returns null for garbage and for gated-out payloads", () => {
    expect(decodePayload("not-base64!!!")).toBeNull();
    const unverified = encodePayload({ ...payload, verified: [] });
    expect(decodePayload(unverified)).toBeNull();
  });
});

describe("the signed summary (templated, deterministic)", () => {
  const text = buildSignedSummaryText(payload);
  it("marks every raise item reviewed", () => {
    const reviewedMarks = text.match(/\[REVIEWED\]/g) ?? [];
    expect(reviewedMarks.length).toBe(payload.result.raise.length);
  });
  it("carries the human signature line", () => {
    expect(text).toContain("Signed off by J. Alvarez, PM, on July 4, 2026");
    expect(text).toContain("The signature is human.");
  });
  it("is deterministic", () => {
    expect(buildSignedSummaryText(payload)).toBe(text);
  });
});

describe("the two emails", () => {
  const url = "http://localhost:8888/api/demo/signoff?p=abc";
  const approval = buildApprovalEmail(payload, url);
  const signatory = buildSignatoryEmail(payload);

  it("approval email goes to the fictional reviewer and carries the sign-off link", () => {
    expect(approval.to.email).toBe(FICTIONAL_REVIEWER_EMAIL);
    expect(approval.text).toContain(url);
    expect(approval.html).toContain(url);
    expect(approval.subject).toContain("Sign-off requested");
  });
  it("signatory email goes to the fictional signatory with reviewed raise items", () => {
    expect(signatory.to.email).toBe(FICTIONAL_SIGNATORY.email);
    expect(signatory.text).toContain("[REVIEWED]");
    expect(signatory.text).toContain("No Liability Cap");
    expect(signatory.html).toContain("[REVIEWED]");
  });
  it("every address in the system is on the reserved .test TLD (unroutable)", () => {
    for (const addr of [
      approval.to.email,
      approval.from.email,
      signatory.to.email,
      signatory.from.email,
      FICTIONAL_SENDER.email,
    ]) {
      expect(addr).toMatch(/\.test$/);
    }
  });
  it("has no em or en dashes anywhere", () => {
    const all = approval.text + approval.html + signatory.text + signatory.html;
    expect(all).not.toMatch(/[–—]/);
  });
});

describe("the sign-off page", () => {
  it("renders the reviewed raise items and the human-signature line", () => {
    const html = buildSignoffPageHtml(payload);
    expect(html).toContain("Signed and sent");
    expect(html).toContain("[REVIEWED]");
    expect(html).toContain("The signature is human.");
    expect(html).toContain(FICTIONAL_SIGNATORY.name);
  });
});

describe("the watched-folder ingest path", () => {
  const p = buildIngestPayload("dropped-contract.pdf", SAMPLE_FALLBACK_RESULT);
  it("builds a payload that passes the human sign-off gate", () => {
    expect(isCompletePayload(p)).toBe(true);
    expect(p.source).toBe("dropped-contract.pdf");
    expect(p.reviewer.name).toBe(FICTIONAL_WATCH_REVIEWER.name);
    expect(p.verified).toEqual(FIVE_CLAUSES);
  });
  it("routes through the existing emails only: every address stays on .test", () => {
    const approval = buildApprovalEmail(p, "http://localhost:8888/api/demo/signoff?p=x");
    const signatory = buildSignatoryEmail(p);
    for (const addr of [
      approval.from.email,
      approval.to.email,
      signatory.from.email,
      signatory.to.email,
    ]) {
      expect(addr).toMatch(/\.test$/);
    }
  });
  it("still requires the human click: the payload alone signs nothing", () => {
    // The signature line only exists in artifacts generated AFTER the
    // sign-off link is opened; the approval email must not contain it.
    const approval = buildApprovalEmail(p, "http://localhost:8888/api/demo/signoff?p=x");
    expect(approval.text).not.toContain("Signed off by");
    expect(approval.text).toContain("Your click is the signature.");
  });
});

describe("content fingerprint (the demo-PDF recognizer)", () => {
  it("is stable across whitespace, line breaks, and punctuation rendering", async () => {
    const a = await fingerprintContract(SAMPLE_CONTRACT_TEXT);
    const mangled = SAMPLE_CONTRACT_TEXT.replace(/\n/g, "  \n ")
      .replace(/"/g, "“")
      .replace(/ /g, "   ");
    expect(await fingerprintContract(mangled)).toBe(a);
  });
  it("differs for different content", async () => {
    const a = await fingerprintContract(SAMPLE_CONTRACT_TEXT);
    expect(await fingerprintContract(SAMPLE_CONTRACT_TEXT + " extra clause")).not.toBe(a);
  });
  it("normalization keeps only lowercase alphanumerics", () => {
    expect(normalizeForFingerprint('A-1 "b" C_2!')).toBe("a1bc2");
  });
});
