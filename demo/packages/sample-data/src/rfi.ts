// =============================================================================
// RFI drafting - use case content (data + pure functions). Ported from the
// original vanilla RFI app (demo/app/data/issues.js + draft.mjs) onto the
// @sg/core UseCase contract so the RFI app consumes the shared engine, ROI, and
// sign-off. Same fictional project as the submittal review for continuity.
// =============================================================================
import type { Instance, PromptInput, SourceDoc, UseCase } from "@sg/core";
import { CASCADE_RIDGE } from "./project";

const RFI_FORMAT =
  "number, date, to, from, subject, question, suggested resolution, cost / schedule impact.";

// -----------------------------------------------------------------------------
// Shared reference documents (baked in; the issues read from these).
// -----------------------------------------------------------------------------
const DOC: Record<string, SourceDoc> = {
  "spec-0330": {
    id: "spec-0330",
    kind: "ref",
    title: "Spec - 03 30 00 Cast-in-Place Concrete, 2.3 Concrete Mixes",
    body:
      "A. Foundations and footings: normal-weight concrete, min 28-day compressive strength f'c = 4,000 psi.\n" +
      "B. Slabs-on-grade: 4,000 psi, max water-cement ratio 0.45.",
  },
  "spec-0784": {
    id: "spec-0784",
    kind: "ref",
    title: "Spec - 07 84 00 Firestopping, 1.1",
    body: "Provide tested firestop systems at all rated penetrations. (No specific system named.)",
  },
  "s-101": {
    id: "s-101",
    kind: "ref",
    title: "Drawing - S-101 General Structural Notes, 3. Concrete",
    body: "a. All footings and foundation walls: f'c = 3,000 psi at 28 days, unless noted otherwise.",
  },
  "s-301": {
    id: "s-301",
    kind: "ref",
    title: "Drawing - S-301 Framing",
    body: "Beam B-12 over Corridor 1: bottom of steel at 10'-2\" AFF.",
  },
  "m-401": {
    id: "m-401",
    kind: "ref",
    title: "Drawing - M-401 Mechanical",
    body:
      "Main supply duct over Corridor 1: 30\" x 12\", route above ceiling. " +
      "Penetrates Corridor 1 wall at grid C-4.",
  },
  "a-201": {
    id: "a-201",
    kind: "ref",
    title: "Drawing - A-201 Architectural",
    body: "Corridor 1 finished ceiling: 9'-0\" AFF.",
  },
  "ls-101": {
    id: "ls-101",
    kind: "ref",
    title: "Drawing - LS-101 Life Safety",
    body: "Corridor 1 walls: 1-hour fire-rated, continuous to deck.",
  },
};
const ALL_REFERENCE_DOCS = Object.values(DOC);

function ref(id: string): SourceDoc {
  const d = DOC[id];
  if (!d) throw new Error(`Unknown reference doc: ${id}`);
  return d;
}

// The issue description rides as the first document (kind "issue"); the prompt
// builder separates it from the reference docs.
function issueInstance(
  id: string,
  label: string,
  issueText: string,
  docIds: string[],
  fallbackDraft: string,
): Instance {
  return {
    id,
    label,
    documents: [{ kind: "issue", title: "Issue", body: issueText }, ...docIds.map(ref)],
    fallbackDraft,
  };
}

const INSTANCES: Instance[] = [
  issueInstance(
    "concrete-strength",
    "Concrete strength: spec says 4,000 psi, structural says 3,000",
    "The concrete strength requirement for foundations conflicts between disciplines. " +
      "Spec section 03 30 00 (2.3.A) requires foundation and footing concrete at f'c = 4,000 psi, " +
      "while structural general note S-101 (3.a) calls for footings and foundation walls at f'c = 3,000 psi. " +
      "The foundation pour is scheduled for next week, so we need to know which value governs before we batch.",
    ["spec-0330", "s-101"],
    `RFI No.: 001
Date: [today]
To: Lakeview Medical Office - Architect / Structural Engineer of Record
From: Cascade Ridge Construction
Subject: Conflicting foundation concrete strength - Spec 03 30 00 vs. Drawing S-101

Description:
The specified compressive strength for foundation concrete differs between two contract documents.
- Spec 03 30 00, 2.3.A requires foundations and footings at f'c = 4,000 psi (28-day).
- Drawing S-101, General Structural Note 3.a requires footings and foundation walls at f'c = 3,000 psi (28-day), unless noted otherwise.
The foundation pour is scheduled for next week and the two values cannot both be batched.

Question:
Which document governs the foundation concrete strength: the 4,000 psi in Spec 03 30 00 or the 3,000 psi in Drawing S-101?

Suggested Resolution:
We recommend confirming 4,000 psi for foundations and footings to satisfy the more stringent spec requirement and avoid any risk of a non-conforming, lower-strength pour that could require removal and replacement. Please confirm in writing so the mix design can be finalized before batching.

Cost / Schedule Impact:
None if resolved before the scheduled pour. If direction is not received before the pour date, the pour will be held, which would delay the foundation sequence.

Assumptions:
We assumed S-101 Note 3.a is the controlling structural note for these elements and that no separate detail supersedes it.

Draft for your review. A person reviews and sends every RFI.`,
  ),
  issueInstance(
    "duct-clash",
    "Duct vs. beam vs. ceiling: the 30x12 duct won't fit over Corridor 1",
    "Possible vertical interference over Corridor 1. The mechanical main supply duct (M-401) is 30\" x 12\" " +
      "and routes above the corridor ceiling, which is set at 9'-0\" AFF (A-201). Beam B-12 crosses the same " +
      "corridor with bottom of steel at 10'-2\" AFF (S-301). Using typical above-ceiling allowances of about " +
      "2\" for duct insulation plus about 6\" for hangers and clearance on top of the 12\" duct depth, please " +
      "confirm whether the duct can pass beneath Beam B-12 while holding the 9'-0\" ceiling, and advise direction " +
      "if it cannot.",
    ["s-301", "m-401", "a-201"],
    `RFI No.: 002
Date: [today]
To: Lakeview Medical Office - Architect / Mechanical Engineer / Structural Engineer of Record
From: Cascade Ridge Construction
Subject: Duct, beam, and ceiling interference over Corridor 1 at grid C-4

Description:
The main supply duct conflicts with Beam B-12 above the Corridor 1 ceiling. The available space cannot hold all three requirements at once.

Clearance check (bottom of structure required above the 9'-0" ceiling):
- Finished ceiling (A-201): 9'-0" AFF
- Duct depth (M-401, 30" x 12"): 12"
- Duct insulation allowance: about 2"
- Hangers and working clearance allowance: about 6"
- Required bottom of structure: 9'-0" + 12" + 2" + 6" = 9'-0" + 1'-8" = about 10'-8" AFF

Available structure:
- Beam B-12 bottom of steel (S-301): 10'-2" AFF

Shortfall: 10'-8" required minus 10'-2" available = about 6" short. The 30" x 12" duct cannot pass beneath Beam B-12 while maintaining the 9'-0" corridor ceiling.

Question:
How should we resolve the approximately 6-inch interference between the 30" x 12" supply duct and Beam B-12 over Corridor 1 while holding the 9'-0" ceiling?

Suggested Resolution:
Please direct one of the following: (1) raise or modify Beam B-12 to gain the needed depth, (2) reroute or resize the duct over the corridor, for example two shallower parallel runs that fit within the available space, or (3) locally drop the Corridor 1 ceiling below 9'-0" in this area. We can price the option you select.

Cost / Schedule Impact:
If unresolved, ceiling rough-in over Corridor 1 is at risk and mechanical and ceiling trades will be held in this area. Cost and schedule impact depends on the option selected; resolving before duct fabrication and ceiling rough-in avoids rework.

Assumptions:
We assumed about 2" duct insulation and about 6" for hangers and working clearance. If actual insulation or hanger details differ, the required bottom of structure will change accordingly.

Draft for your review. A person reviews and sends every RFI.`,
  ),
  issueInstance(
    "firestop-missing",
    "Rated wall, no firestop: duct penetrates the 1-hour corridor wall at C-4",
    "The 30\" x 12\" mechanical supply duct (M-401) penetrates the Corridor 1 wall at grid C-4. Per LS-101, " +
      "Corridor 1 walls are 1-hour fire-rated and continuous to deck. No fire or smoke damper is shown on the " +
      "drawings at this penetration, and Spec 07 84 00 requires tested firestop systems at rated penetrations but " +
      "names no specific system. Please confirm whether a fire-smoke damper is required and provide the specific " +
      "tested firestop system or detail for this penetration.",
    ["ls-101", "m-401", "spec-0784"],
    `RFI No.: 003
Date: [today]
To: Lakeview Medical Office - Architect / Mechanical Engineer
From: Cascade Ridge Construction
Subject: Rated wall penetration at Corridor 1, grid C-4 - damper and firestop not shown

Description:
The 30" x 12" main supply duct (M-401) penetrates the Corridor 1 wall at grid C-4. Per LS-101, Corridor 1 walls are 1-hour fire-rated and continuous to deck. At this penetration:
- No fire damper or fire-smoke damper is shown on the drawings.
- Spec 07 84 00, 1.1 requires tested firestop systems at all rated penetrations but names no specific system.
We need both items confirmed before the duct and the wall close in.

Question:
Is a fire damper or fire-smoke damper required where the 30" x 12" duct penetrates the 1-hour Corridor 1 wall at grid C-4, and what specific tested (UL) firestop system or detail applies to this penetration?

Suggested Resolution:
Please confirm the damper requirement for this penetration and provide the specific tested firestop system or a penetration detail keyed to the duct size and the 1-hour wall rating. We can then coordinate the damper, access, and firestop scope.

Cost / Schedule Impact:
This affects the mechanical and firestopping subcontractors. Resolving before the wall is closed in avoids cutting open finished work. A required damper not currently carried may add cost and lead time.

Assumptions:
We assumed the wall remains 1-hour rated at grid C-4 and that no damper or firestop detail exists elsewhere in the documents that we have not been issued.

Draft for your review. A person reviews and sends every RFI.`,
  ),
];

const FREE_TEXT_FALLBACK = `RFI No.: [next]
Date: [today]
To: Lakeview Medical Office - Architect / Engineer of Record
From: Cascade Ridge Construction
Subject: Request for information - [short subject]

Description:
[Summary of the issue as described, with reference to the relevant project documents.]

Question:
[One clear question for the design team.]

Suggested Resolution:
[A practical proposed resolution for the design team to confirm.]

Cost / Schedule Impact:
[Impact if unresolved, and the trades affected.]

Assumptions:
[Any assumption made to draft this.]

Draft for your review. A person reviews and sends every RFI.

(Live AI was unavailable, so this is a saved example template. A person reviews and sends every RFI.)`;

// -----------------------------------------------------------------------------
// Prompt assembly (pure, testable). Verbatim template from the original app.
// -----------------------------------------------------------------------------
const PROMPT_TEMPLATE = `You're helping me draft a professional RFI for {{PROJECT}} ({{GC}}).

The issue: {{ISSUE}}
Relevant documents:
{{DOCS}}
Our RFI format: {{FORMAT}}

Draft the RFI in our format. Cite the documents, ask one clear question, and propose a
suggested resolution. Flag any assumption you had to make. Keep it concise and professional.
Return a draft only; a person will review and send it.`;

function renderRefDocs(docs: SourceDoc[]): string {
  return docs.map((d) => `- ${d.title}\n${d.body}`).join("\n\n");
}

export function buildRfiPrompt(input: PromptInput): string {
  const { project } = input;
  let issue: string;
  let docs: SourceDoc[];
  if (input.freeText && input.freeText.trim()) {
    issue = input.freeText.trim();
    docs = ALL_REFERENCE_DOCS;
  } else if (input.instance) {
    const issueDoc = input.instance.documents.find((d) => d.kind === "issue");
    issue = issueDoc?.body ?? input.instance.label;
    docs = input.instance.documents.filter((d) => d.kind !== "issue");
  } else {
    issue = "";
    docs = [];
  }
  return PROMPT_TEMPLATE.replace("{{PROJECT}}", project.name)
    .replace("{{GC}}", project.gc)
    .replace("{{ISSUE}}", issue.trim())
    .replace("{{DOCS}}", renderRefDocs(docs))
    .replace("{{FORMAT}}", RFI_FORMAT);
}

const SYSTEM_PROMPT = `You are a careful construction-document assistant helping a general contractor draft an RFI (Request for Information).

Non-negotiable rules:
- You produce a DRAFT only, for a human to review and send. A person reviews and sends every RFI.
- Use ONLY the documents and facts provided in the message. Never invent document numbers, dimensions, systems, names, dates, or requirements. If a fact is missing, say so or mark it as a bracketed placeholder.
- Cite the specific documents you rely on by their title or number (for example "Spec 03 30 00, 2.3.A" or "Drawing S-301").
- Ask exactly one clear question.
- Propose a concrete suggested resolution.
- Explicitly flag every assumption you had to make.
- Note the cost and schedule impact, and which trades are affected.

When the issue involves a dimensional, vertical, or clearance fit, you MUST show the arithmetic, not summarize it:
- List each component on its own line (ceiling height, duct depth, insulation allowance, hanger and clearance allowance).
- Add them to a single required figure (for example, required bottom of structure above the ceiling).
- Compare that required figure against the available figure from the drawings.
- State the numeric shortfall or surplus in inches. Do not write "does not fit" without the supporting numbers.
- Carry any stated allowances exactly as given and label them as assumptions.

Style:
- Output the RFI in the requested format with clear labeled sections.
- Concise and professional. No marketing language.
- Do not use em dashes or en dashes anywhere. Use a comma, a period, parentheses, or a plain hyphen instead. Plain hyphens are fine inside terms like 10'-2", 30" x 12", 1-hour, and B-12.
- End the draft with the line: "Draft for your review. A person reviews and sends every RFI."`;

// -----------------------------------------------------------------------------
// The use case
// -----------------------------------------------------------------------------
export const rfiDraft: UseCase = {
  id: "rfi-draft",
  label: "RFI draft",
  outputType: "RFI",
  project: CASCADE_RIDGE,
  instances: INSTANCES,
  systemPrompt: SYSTEM_PROMPT,
  buildPrompt: buildRfiPrompt,
  reviewChecklist: [
    "References are right.",
    "One clear question.",
    "Nothing invented.",
    "Cost and schedule noted.",
    "I checked the cited references and confirmed the question and suggested resolution.",
  ],
  approval: {
    label: "Reviewed and approved by",
    provenanceNote: "approved by the named reviewer before issue",
  },
  standingLine: "A person reviews and sends every RFI.",
  freeTextFallback: FREE_TEXT_FALLBACK,
  runLabel: "Draft the RFI",
  inputNoun: "issue",
  freeTextPlaceholder: "Describe the issue and reference the relevant documents, then draft the RFI...",
  roiAppKey: "rfi",
};
