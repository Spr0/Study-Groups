// =============================================================================
// Contract clause review (ClauseLens) - use-case content and pure logic.
//
// ClauseLens deliberately diverges from the RFI and submittal apps: contract
// review wants a structured, clause-by-clause result (with a dominant
// raise-before-signing list, per-clause explain, and per-clause verification),
// not a markdown document. So instead of the @sg/core UseCase contract, this
// module exports data plus pure functions for the structured path:
//
//   - the Cascade Ridge sample subcontract (Liability Cap absent on purpose)
//   - the vetted, cached ClauseResult the demo falls back to offline
//   - the extract prompt (JSON-returning) and the per-clause explain prompt
//   - the response parser and the result gate ("never show a false table"),
//     shared by the serverless function and the client and unit-tested here
//
// The parser, gate, sample, and vetted result are carried over from the
// standalone ClauseLens app (Spr0/ClauseLens) verbatim in behavior.
// =============================================================================
import { CASCADE_RIDGE } from "./project";

// -----------------------------------------------------------------------------
// Types and constants
// -----------------------------------------------------------------------------
export const FIVE_CLAUSES = ["Term", "Payment", "Termination", "Liability Cap", "Indemnity"];
export const NOT_FOUND = "Not Found.";
export const STATUS_FOUND = "Found";
export const STATUS_NOT_FOUND = "Not Found";

export interface Clause {
  name: string;
  /** Exact contract language, or "Not Found." */
  quote: string;
  /** One plain sentence, empty when Not Found. */
  plain: string;
  status: typeof STATUS_FOUND | typeof STATUS_NOT_FOUND;
}

export interface ClauseResult {
  clauses: Clause[];
  /** Anything missing or one-sided to raise before signing, biggest first. */
  raise: string[];
}

/** Client/server wire shapes for /api/analyze. */
export interface ExtractRequest {
  mode: "extract";
  contractText: string;
}
export interface ExplainRequest {
  mode: "explain";
  clauseName: string;
  quote: string;
  plain?: string;
}
export type AnalyzeRequest = ExtractRequest | ExplainRequest;

// -----------------------------------------------------------------------------
// The Cascade Ridge sample subcontract (fictional; no Liability Cap on purpose).
// -----------------------------------------------------------------------------
export const SAMPLE_CONTRACT_NAME = "Cascade Ridge - Lakeview Medical Office Subcontract (sample)";

export const SAMPLE_CONTRACT_TEXT = `SUBCONTRACT AGREEMENT

This Subcontract Agreement ("Agreement") is entered into between Cascade Ridge Construction ("Contractor") and Summit Mechanical Services LLC ("Subcontractor") for work on the Lakeview Medical Office project located in Bellingham, WA.

1. SCOPE OF WORK
Subcontractor shall furnish all labor, materials, and equipment necessary to complete the HVAC and plumbing rough-in for the Lakeview Medical Office, in accordance with the Contract Documents and the project schedule.

2. TERM
This Agreement shall commence on the Effective Date and shall remain in effect until Subcontractor's work is finally completed and accepted, but in no event later than eighteen (18) months from the Effective Date, unless extended by written change order signed by both parties.

3. PAYMENT
Contractor shall pay Subcontractor for work satisfactorily completed within thirty (30) days following Contractor's receipt of Subcontractor's approved monthly application for payment. Contractor shall retain five percent (5%) of each progress payment as retainage, to be released within sixty (60) days of final acceptance.

4. TERMINATION
Contractor may terminate this Agreement, in whole or in part, for its convenience upon seven (7) days written notice to Subcontractor. Contractor may terminate for cause immediately if Subcontractor fails to cure a material default within three (3) days of written notice. Upon termination, Subcontractor shall be paid for work properly performed through the date of termination.

5. INSURANCE
Subcontractor shall maintain commercial general liability insurance with limits of not less than $1,000,000 per occurrence and shall name Contractor as an additional insured.

6. INDEMNIFICATION
To the fullest extent permitted by law, Subcontractor shall indemnify, defend, and hold harmless Contractor and the Owner from and against any claims, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or resulting from the performance of the Subcontractor's work, but only to the extent caused by the negligent acts or omissions of the Subcontractor.

7. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Washington.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.`;

/** The contract types the dropdown offers. One sample today; add more here. */
export interface ContractOption {
  id: string;
  label: string;
  contractText: string;
  /** Vetted, offline-safe result used when the model call is unavailable. */
  fallbackResult: ClauseResult;
}

// The canonical, vetted extraction for the sample: four clauses present, no
// Liability Cap, and that gap is the headline raise item. Must never drift
// (regression-tested below in clauses.test.ts).
export const SAMPLE_FALLBACK_RESULT: ClauseResult = {
  clauses: [
    {
      name: "Term",
      quote:
        "This Agreement shall commence on the Effective Date and shall remain in effect until Subcontractor's work is finally completed and accepted, but in no event later than eighteen (18) months from the Effective Date.",
      plain:
        "The contract runs until the work is finished and accepted, and no later than 18 months from the start date.",
      status: STATUS_FOUND,
    },
    {
      name: "Payment",
      quote:
        "Contractor shall pay Subcontractor for work satisfactorily completed within thirty (30) days following Contractor's receipt of Subcontractor's approved monthly application for payment. Contractor shall retain five percent (5%) of each progress payment as retainage.",
      plain:
        "Payment is due within 30 days of an approved monthly invoice, with 5 percent held back as retainage until final acceptance.",
      status: STATUS_FOUND,
    },
    {
      name: "Termination",
      quote:
        "Contractor may terminate this Agreement, in whole or in part, for its convenience upon seven (7) days written notice to Subcontractor. Contractor may terminate for cause immediately if Subcontractor fails to cure a material default within three (3) days of written notice.",
      plain:
        "The Contractor can end the contract for convenience on 7 days notice, or immediately for cause if a default is not cured within 3 days.",
      status: STATUS_FOUND,
    },
    {
      name: "Liability Cap",
      quote: NOT_FOUND,
      plain: "",
      status: STATUS_NOT_FOUND,
    },
    {
      name: "Indemnity",
      quote:
        "To the fullest extent permitted by law, Subcontractor shall indemnify, defend, and hold harmless Contractor and the Owner from and against any claims, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or resulting from the performance of the Subcontractor's work, but only to the extent caused by the negligent acts or omissions of the Subcontractor.",
      plain:
        "The Subcontractor covers the Contractor and Owner for claims caused by the Subcontractor's own negligence, but only to that extent.",
      status: STATUS_FOUND,
    },
  ],
  raise: [
    "No Liability Cap. The contract sets no ceiling on the Subcontractor's total liability, so exposure is open-ended. Raise this before signing.",
    "Indemnity runs one direction only. The Subcontractor indemnifies the Contractor and Owner, with no reciprocal protection for the Subcontractor.",
    "Termination for convenience favors the Contractor. Seven days notice with payment only for work performed leaves the Subcontractor little recourse.",
  ],
};

export const CONTRACT_OPTIONS: ContractOption[] = [
  {
    id: "cascade-ridge-subcontract",
    label: "Subcontract: Cascade Ridge / Summit Mechanical (Liability Cap absent on purpose)",
    contractText: SAMPLE_CONTRACT_TEXT,
    fallbackResult: SAMPLE_FALLBACK_RESULT,
  },
];

// Vetted per-clause explanations for the sample, used when the live explain
// call is unavailable so the demo never dies on stage.
export const SAMPLE_EXPLAIN_FALLBACKS: Record<string, string> = {
  Term: "This language was selected because it sets both ends of the engagement: work-complete-and-accepted, with a hard outer limit of 18 months. The outer limit matters because without it, an open-ended term leaves the Subcontractor carrying obligations indefinitely.",
  Payment:
    "This language was selected because it fixes the payment clock (30 days from an approved monthly application) and the retainage (5 percent held until 60 days after final acceptance). Both numbers directly affect the Subcontractor's cash flow on the job.",
  Termination:
    "This language was selected because it gives the Contractor two exits: convenience on 7 days notice, and cause with only a 3-day cure window. Short cure windows are a common pressure point; a reviewer should confirm the Subcontractor can realistically cure in 3 days.",
  "Liability Cap":
    "No clause caps the Subcontractor's total liability anywhere in this contract. That is why it is marked Not Found and why it leads the raise list: without a cap, exposure on a claim is open-ended.",
  Indemnity:
    "This language was selected because it is the one-way indemnity: the Subcontractor covers the Contractor and Owner, limited to the Subcontractor's own negligence. The limitation ('but only to the extent') is protective; the one-way direction is worth raising.",
};

// -----------------------------------------------------------------------------
// Prompts (pure, testable). The extract prompt is shown verbatim in the UI's
// prompt peek and sent to the model.
// -----------------------------------------------------------------------------
export const EXTRACT_SYSTEM_PROMPT = `You are a contract clause reviewer for the reviewing organization. When given a contract, pull these clauses one at a time: Term, Payment, Termination, Liability Cap, Indemnity. For each one: quote the exact language from the contract, restate it in one plain sentence, and if it is not present say Not Found. Do not write a clause that is not there. Then list anything missing or one-sided to raise before signing. Do not give legal advice and do not decide whether to sign. This is a first read for a person to verify. Do not use em dashes or en dashes anywhere.

Return ONLY a valid JSON object, with no preamble, no markdown fences, and no explanation. Use exactly this shape:
{
  "clauses": [
    { "name": "Term", "quote": "<exact contract language, or Not Found.>", "plain": "<one plain sentence, or empty string if Not Found>", "status": "Found" or "Not Found" },
    { "name": "Payment", "quote": "...", "plain": "...", "status": "..." },
    { "name": "Termination", "quote": "...", "plain": "...", "status": "..." },
    { "name": "Liability Cap", "quote": "...", "plain": "...", "status": "..." },
    { "name": "Indemnity", "quote": "...", "plain": "...", "status": "..." }
  ],
  "raise": [ "<short item to raise before signing>", "<another>" ]
}
Include all five clauses, in that order. If a clause is absent, set quote to "Not Found.", plain to "", and status to "Not Found". A missing Liability Cap is a material gap and should be the first item in raise.`;

export function buildExtractPrompt(contractText: string): string {
  return `You're helping me review a contract for ${CASCADE_RIDGE.name} (${CASCADE_RIDGE.gc}). Pull the five key clauses: Term, Payment, Termination, Liability Cap, Indemnity.

The contract:

${contractText.trim()}`;
}

export const EXPLAIN_SYSTEM_PROMPT = `You explain a single extracted contract clause to a non-lawyer reviewer. In two to four sentences: why this specific language was selected for this clause, what it means in practice, and what a careful reviewer would double-check. If the clause was Not Found, explain what its absence means in practice. Do not give legal advice and do not decide whether to sign. Do not use em dashes or en dashes anywhere. Return plain prose only, no headings, no lists.`;

export function buildExplainPrompt(clauseName: string, quote: string, plain?: string): string {
  const plainLine = plain && plain.trim() ? `\nPlain restatement: ${plain.trim()}` : "";
  return `Clause: ${clauseName}
Extracted language: ${quote.trim()}${plainLine}

Explain this section for the reviewer.`;
}

// -----------------------------------------------------------------------------
// Parse + gate (pure; shared by the serverless function and the client).
// "Never show a false table": the report renders only on a valid result.
// -----------------------------------------------------------------------------
function isAbsentQuote(quote: unknown): boolean {
  if (typeof quote !== "string") return true;
  const q = quote.trim();
  if (!q) return true;
  return /^not\s+found\.?$/i.test(q);
}

/**
 * Parse the model's raw text into a normalized ClauseResult over the five
 * fixed clauses, in canonical order. Returns null when the text carries no
 * usable JSON object; a null is what gates the report off.
 */
export function parseClauseResponse(text: unknown): ClauseResult | null {
  if (typeof text !== "string") return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as { clauses?: unknown; raise?: unknown };

  const byName = new Map<string, { quote?: unknown; plain?: unknown }>();
  if (Array.isArray(obj.clauses)) {
    for (const entry of obj.clauses) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { name?: unknown }).name === "string"
      ) {
        byName.set(
          (entry as { name: string }).name.trim().toLowerCase(),
          entry as { quote?: unknown; plain?: unknown },
        );
      }
    }
  }

  const clauses: Clause[] = FIVE_CLAUSES.map((name) => {
    const entry = byName.get(name.toLowerCase()) ?? {};
    const absent = isAbsentQuote(entry.quote);
    const plain = typeof entry.plain === "string" && entry.plain.trim() ? entry.plain.trim() : "";
    return {
      name,
      quote: absent ? NOT_FOUND : (entry.quote as string).trim(),
      plain: absent ? "" : plain,
      status: absent ? STATUS_NOT_FOUND : STATUS_FOUND,
    };
  });

  const raise = Array.isArray(obj.raise)
    ? obj.raise.map((r) => (typeof r === "string" ? r.trim() : "")).filter(Boolean)
    : [];

  return { clauses, raise };
}

/** True only when the result carries all five clauses in canonical shape. */
export function isValidResult(result: unknown): result is ClauseResult {
  if (!result || typeof result !== "object") return false;
  const r = result as ClauseResult;
  if (!Array.isArray(r.clauses) || r.clauses.length !== FIVE_CLAUSES.length) return false;
  if (!Array.isArray(r.raise)) return false;
  return FIVE_CLAUSES.every((name, i) => {
    const c = r.clauses[i];
    return (
      !!c &&
      c.name === name &&
      typeof c.quote === "string" &&
      c.quote.length > 0 &&
      typeof c.plain === "string" &&
      (c.status === STATUS_FOUND || c.status === STATUS_NOT_FOUND)
    );
  });
}

/** How many clauses were actually found. */
export function foundCount(result: unknown): number {
  if (!isValidResult(result)) return 0;
  return result.clauses.filter((c) => c.status === STATUS_FOUND).length;
}

// -----------------------------------------------------------------------------
// Content fingerprint: recognize the demo contract by CONTENT, however it
// arrives (a dropped PDF's extracted text differs from the canonical string in
// whitespace, line breaks, and punctuation rendering). Only [a-z0-9] survive
// normalization, so the fingerprint is stable across those variations. A match
// arms the vetted fallback and the short live-call timeout; any other content
// goes to the model as usual.
// -----------------------------------------------------------------------------
export function normalizeForFingerprint(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** SHA-256 hex of the normalized content. Works in the browser, Node 20, and vitest. */
export async function fingerprintContract(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeForFingerprint(text));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
