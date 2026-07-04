// =============================================================================
// Contract clause review (ClauseLens) - use case content (data + pure
// functions). Ported from the standalone ClauseLens app (Spr0/ClauseLens) onto
// the @sg/core UseCase contract so it consumes the shared engine, ROI, and
// sign-off. Same fictional project as the other use cases for continuity.
//
// The five clauses, the sample subcontract, and the vetted fallback review are
// carried over verbatim from ClauseLens's sampleContract.js: the sample is
// deliberately missing a Liability Cap so the demo shows the "Not Found."
// signal honestly, and that gap leads the raise-before-signing list.
//
// Deferred from the standalone app (decide before retiring it): PDF/DOCX/TXT
// upload with client-side text extraction, per-clause inline edit, and the
// per-clause "explain" call. The paste path, the sample, the fallback, the
// ROI numbers, and the sign-off gate all carry over.
// =============================================================================
import type { PromptInput, SourceDoc, UseCase } from "@sg/core";
import { CASCADE_RIDGE } from "./project";

export const FIVE_CLAUSES = ["Term", "Payment", "Termination", "Liability Cap", "Indemnity"];

// -----------------------------------------------------------------------------
// The Cascade Ridge sample subcontract (fictional; no Liability Cap on purpose).
// -----------------------------------------------------------------------------
const SAMPLE_CONTRACT: SourceDoc = {
  id: "cascade-ridge-subcontract",
  kind: "contract",
  title: "Cascade Ridge - Lakeview Medical Office Subcontract (sample)",
  body: `SUBCONTRACT AGREEMENT

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

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.`,
};

// The canonical, vetted review of the sample: four clauses present, no
// Liability Cap, and that gap is the headline raise item. Markdown, because the
// engine renders the draft as a document. Must never drift (regression-tested).
const SAMPLE_FALLBACK = `# Clause Review: Cascade Ridge Subcontract, Summit Mechanical Services

## Term: Found
"This Agreement shall commence on the Effective Date and shall remain in effect until Subcontractor's work is finally completed and accepted, but in no event later than eighteen (18) months from the Effective Date."

Plain: The contract runs until the work is finished and accepted, and no later than 18 months from the start date.

## Payment: Found
"Contractor shall pay Subcontractor for work satisfactorily completed within thirty (30) days following Contractor's receipt of Subcontractor's approved monthly application for payment. Contractor shall retain five percent (5%) of each progress payment as retainage."

Plain: Payment is due within 30 days of an approved monthly invoice, with 5 percent held back as retainage until final acceptance.

## Termination: Found
"Contractor may terminate this Agreement, in whole or in part, for its convenience upon seven (7) days written notice to Subcontractor. Contractor may terminate for cause immediately if Subcontractor fails to cure a material default within three (3) days of written notice."

Plain: The Contractor can end the contract for convenience on 7 days notice, or immediately for cause if a default is not cured within 3 days.

## Liability Cap: Not Found
No liability cap clause appears in this contract.

## Indemnity: Found
"To the fullest extent permitted by law, Subcontractor shall indemnify, defend, and hold harmless Contractor and the Owner from and against any claims, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or resulting from the performance of the Subcontractor's work, but only to the extent caused by the negligent acts or omissions of the Subcontractor."

Plain: The Subcontractor covers the Contractor and Owner for claims caused by the Subcontractor's own negligence, but only to that extent.

# Raise Before Signing
1. No Liability Cap. The contract sets no ceiling on the Subcontractor's total liability, so exposure is open-ended. Raise this before signing.
2. Indemnity runs one direction only. The Subcontractor indemnifies the Contractor and Owner, with no reciprocal protection for the Subcontractor.
3. Termination for convenience favors the Contractor. Seven days notice with payment only for work performed leaves the Subcontractor little recourse.

Draft for your review. A person verifies every clause against the contract.`;

const FREE_TEXT_FALLBACK = `# Clause Review

## Term: [Found or Not Found]
"[Exact contract language, quoted verbatim.]"

Plain: [One plain sentence.]

## Payment: [Found or Not Found]
## Termination: [Found or Not Found]
## Liability Cap: [Found or Not Found]
## Indemnity: [Found or Not Found]

# Raise Before Signing
1. [Anything missing or one-sided, biggest exposure first.]

Draft for your review. A person verifies every clause against the contract.

(Live AI was unavailable, so this is a saved example template. A person verifies every clause against the contract.)`;

// -----------------------------------------------------------------------------
// Prompt assembly (pure, testable). This exact text is shown in panel 2 and
// sent to the model.
// -----------------------------------------------------------------------------
const PROMPT_TEMPLATE = `You're helping me review a contract for {{PROJECT}} ({{GC}}).

Pull these five clauses, one at a time: Term, Payment, Termination, Liability Cap, Indemnity. For each one: quote the exact language from the contract, restate it in one plain sentence, and if it is not present say Not Found. Then list anything missing or one-sided to raise before signing.

The contract:
{{CONTRACT}}

Return a draft review only; a person verifies every clause against the contract.`;

export function buildClausePrompt(input: PromptInput): string {
  const { project } = input;
  let contract: string;
  if (input.freeText && input.freeText.trim()) {
    contract = input.freeText.trim();
  } else if (input.instance) {
    const doc = input.instance.documents.find((d) => d.kind === "contract");
    contract = doc?.body ?? "";
  } else {
    contract = "";
  }
  return PROMPT_TEMPLATE.replace("{{PROJECT}}", project.name)
    .replace("{{GC}}", project.gc)
    .replace("{{CONTRACT}}", contract);
}

const SYSTEM_PROMPT = `You are a contract clause reviewer helping a person do a first read of a contract. You produce a DRAFT review only; a person verifies every clause against the contract before anyone relies on it.

Non-negotiable rules:
- Pull exactly these five clauses, in this order: Term, Payment, Termination, Liability Cap, Indemnity.
- For each clause, quote the exact language from the contract. Never paraphrase inside the quote, never trim words that change meaning, and never write a clause that is not there.
- If a clause is not present, mark it "Not Found" and state plainly that it does not appear. A missing clause is a finding, not a failure.
- After the quote, restate the clause in one plain sentence a non-lawyer can read.
- Then list anything missing or one-sided to raise before signing, biggest exposure first. A missing Liability Cap is a material gap and must be the first raise item.
- Do not give legal advice and do not decide whether to sign. This is a first read for a person to verify.

Format the review exactly like this, in markdown:
- A title line: "# Clause Review: [short contract name]"
- One heading per clause: "## [Clause]: Found" or "## [Clause]: Not Found"
- Under a Found clause: the exact quote in quotation marks, a blank line, then "Plain: [one sentence]".
- Under a Not Found clause: one sentence stating it does not appear.
- Then "# Raise Before Signing" with a numbered list.
- End with the line: "Draft for your review. A person verifies every clause against the contract."

Style:
- Concise and professional. No marketing language.
- Do not use em dashes or en dashes anywhere. Use a comma, a period, parentheses, or a plain hyphen instead.`;

// -----------------------------------------------------------------------------
// The use case
// -----------------------------------------------------------------------------
export const clauseReview: UseCase = {
  id: "clause-review",
  label: "Contract clause review",
  outputType: "Clause review",
  project: CASCADE_RIDGE,
  instances: [
    {
      id: "cascade-ridge-subcontract",
      label: "Cascade Ridge subcontract: Summit Mechanical, Liability Cap absent on purpose",
      documents: [SAMPLE_CONTRACT],
      fallbackDraft: SAMPLE_FALLBACK,
    },
  ],
  systemPrompt: SYSTEM_PROMPT,
  buildPrompt: buildClausePrompt,
  reviewChecklist: [
    "Every quote appears verbatim in the contract.",
    "Not Found statuses checked against the document.",
    "Plain restatements match the quoted language.",
    "The raise list leads with the biggest exposure.",
    "I checked each extracted clause against the original contract.",
  ],
  approval: {
    label: "Reviewed and approved by",
    provenanceNote: "approved by the named reviewer before use",
  },
  standingLine: "A person verifies every clause against the contract.",
  freeTextFallback: FREE_TEXT_FALLBACK,
  runLabel: "Review the clauses",
  inputNoun: "contract",
  freeTextPlaceholder: "Paste the contract text, then review the five key clauses...",
  roiAppKey: "clauselens",
};
