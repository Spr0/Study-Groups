// =============================================================================
// Submittal compliance review - use case content (data + pure functions).
// Same fictional project as the RFI app for continuity: door hardware is already
// in the Lakeview MOB submittal log (08-01), so this reviews exactly that.
// =============================================================================
import type { Instance, PromptInput, SourceDoc, UseCase } from "@sg/core";
import { CASCADE_RIDGE } from "./project";

// -----------------------------------------------------------------------------
// Shared documents
// -----------------------------------------------------------------------------
const SPEC_08_71_00: SourceDoc = {
  id: "spec-0871",
  kind: "spec",
  title: "Spec - Section 08 71 00 Door Hardware (excerpt)",
  body: [
    "2.1 Locksets: ANSI/BHMA A156.2, Series 4000, Grade 1.",
    "2.2 Hinges: stainless steel, ball-bearing, ANSI/BHMA A156.1.",
    "2.3 Closers: ANSI/BHMA A156.4, Grade 1, adjustable spring power.",
    "2.4 Finish: satin stainless steel, BHMA 630.",
    "2.5 Fire-rated openings: all hardware UL listed for the opening's fire rating; closers and positive-latching devices required at rated doors.",
    "2.6 Accessibility: lever handles operable without tight grasping, pinching, or twisting; maximum interior opening force 5 lbf.",
  ].join("\n"),
};

const SPEC_03_20_00: SourceDoc = {
  id: "spec-0320",
  kind: "spec",
  title: "Spec - Section 03 20 00 Concrete Reinforcing (excerpt)",
  body: [
    "2.1 Reinforcing bars: ASTM A615, Grade 60, deformed.",
    "2.2 Shop drawings: provide bar bending schedules, sizes, spacing, and lap splice lengths in accordance with ACI 318 and the structural drawings.",
    "2.3 Mill certificates: submit for all reinforcing steel.",
  ].join("\n"),
};

const SUBMITTED_REBAR: SourceDoc = {
  id: "sub-rebar",
  kind: "submitted",
  title: "Submittal 03-02 - Reinforcing Steel Shop Drawings (Cascade Rebar Fabricators)",
  body: [
    "Reinforcing bars: ASTM A615, Grade 60, deformed.",
    "Bar sizes, spacing, and lap splice lengths shown to match structural drawings S-101 and S-301.",
    "Bending schedules included; lap lengths per ACI 318.",
    "Mill certificates: attached.",
  ].join("\n"),
};

const SUBMITTED_DOOR_HW: SourceDoc = {
  id: "sub-door-hw",
  kind: "submitted",
  title: "Submittal 08-01 - Door Hardware product data (Northwest Door & Hardware)",
  body: [
    "Locksets: Sentry 4000 Series, ANSI/BHMA A156.2, Grade 2.",
    "Hinges: stainless steel, ball-bearing, ANSI/BHMA A156.1.",
    "Closers: DoorGlide 4000, ANSI/BHMA A156.4, Grade 1, adjustable.",
    "Finish: BHMA 626 (satin chrome).",
    "Levers: lever-style trim, operable without grasping or twisting; opening force set to 5 lbf.",
  ].join("\n"),
};

const SUBMITTED_FIRE_RATED: SourceDoc = {
  id: "sub-fire-rated",
  kind: "submitted",
  title: "Submittal 08-01 - Door Hardware, Fire-Rated Openings (Northwest Door & Hardware)",
  body: [
    "Application: 90-minute rated openings at the Corridor 1 cross-corridor doors and the stair enclosures.",
    "Locksets: Sentry 4000 Series, Grade 2 (positive latching).",
    "Closers: DoorGlide 4000, adjustable.",
    "UL fire listing / label for rated assemblies: not indicated on the submitted data.",
  ].join("\n"),
};

// -----------------------------------------------------------------------------
// Fallback drafts (vetted, offline-safe). No em or en dashes.
// -----------------------------------------------------------------------------
const REBAR_FALLBACK = `Submittal No.: 03-02
Date: [today]
Spec Section: 03 20 00 Concrete Reinforcing
Disposition: Approved

Comments:
1. Material (Spec 2.1). Compliant. Reinforcing bars are ASTM A615, Grade 60, deformed, as specified.
2. Shop drawings (Spec 2.2). Compliant. Bar sizes, spacing, and lap splice lengths match structural drawings S-101 and S-301, with bending schedules and lap lengths per ACI 318.
3. Mill certificates (Spec 2.3). Compliant. Mill certificates are attached.

Summary: The reinforcing steel shop drawings (Submittal 03-02, Cascade Rebar Fabricators) conform to Spec 03 20 00. Approved, no resubmittal required.

Draft for your review. A person reviews and sends every submittal response.`;

const DOOR_HW_FALLBACK = `Submittal No.: 08-01
Date: [today]
Spec Section: 08 71 00 Door Hardware
Disposition: Revise and Resubmit

Comments:
1. Locksets (Spec 2.1). Deviation. Submitted Sentry 4000 Series locksets are Grade 2; Spec 2.1 requires ANSI/BHMA A156.2, Series 4000, Grade 1. Provide Grade 1 locksets and resubmit.
2. Finish (Spec 2.4). Deviation. Submitted finish is BHMA 626 (satin chrome); Spec 2.4 requires BHMA 630 (satin stainless steel). Provide the 630 finish on all hardware and resubmit.
3. Hinges (Spec 2.2). Compliant. Stainless steel, ball-bearing, ANSI/BHMA A156.1 as specified. Approved.
4. Closers (Spec 2.3). Compliant. DoorGlide 4000, ANSI/BHMA A156.4, Grade 1, adjustable as specified. Approved.
5. Accessibility (Spec 2.6). Compliant. Lever-style trim operable without grasping or twisting, within the 5 lbf interior limit. Approved.

Summary: Hinges, closers, and lever operation are approved. The lockset grade and the finish do not meet 08 71 00 and must be corrected. Revise and resubmit the lockset and finish items.

Draft for your review. A person reviews and sends every submittal response.`;

const FIRE_RATED_FALLBACK = `Submittal No.: 08-01 (fire-rated openings)
Date: [today]
Spec Section: 08 71 00 Door Hardware, 2.5
Disposition: Revise and Resubmit

Comments:
1. Fire-rated listing (Spec 2.5). Missing information. Spec 2.5 requires all hardware at rated openings to be UL listed for the opening's fire rating, with closers and positive-latching devices at rated doors. The submitted data for the 90-minute rated openings (Corridor 1 cross-corridor doors and stair enclosures) does not indicate a UL fire listing or label. This is flagged as missing, not assumed compliant.
2. Latching (Spec 2.5). Positive latching is indicated, but without the UL listing the rated assembly cannot be verified.

Action: Provide the UL listings or labeled cut sheets for each hardware item at the 90-minute rated openings, confirming the listing covers the opening's fire rating, then resubmit.

Summary: The rated-opening hardware cannot be approved until the UL fire listings are provided. Revise and resubmit with the listings.

Draft for your review. A person reviews and sends every submittal response.`;

const FREE_TEXT_FALLBACK = `Submittal No.: [next]
Date: [today]
Spec Section: [section]
Disposition: [Approved / Approved as Noted / Revise and Resubmit / Rejected]

Comments:
1. [Cite the spec clause, state compliance or the specific deviation, and propose the action.]
2. [Flag anything missing rather than assuming it complies.]

Summary: [Disposition rationale tied to the comments.]

Draft for your review. A person reviews and sends every submittal response.

(Live AI was unavailable, so this is a saved example template. A person reviews and sends every submittal response.)`;

// -----------------------------------------------------------------------------
// Instances (easy to hard, to show range)
// -----------------------------------------------------------------------------
const INSTANCES: Instance[] = [
  {
    id: "rebar-shop-drawings",
    label: "Reinforcing steel shop drawings vs spec 03 20 00",
    documents: [SPEC_03_20_00, SUBMITTED_REBAR],
    fallbackDraft: REBAR_FALLBACK,
  },
  {
    id: "door-hardware",
    label: "Door hardware submittal vs spec 08 71 00",
    documents: [SPEC_08_71_00, SUBMITTED_DOOR_HW],
    fallbackDraft: DOOR_HW_FALLBACK,
  },
  {
    id: "fire-rated-openings",
    label: "Fire-rated door hardware: UL listing not shown",
    documents: [SPEC_08_71_00, SUBMITTED_FIRE_RATED],
    fallbackDraft: FIRE_RATED_FALLBACK,
  },
];

// -----------------------------------------------------------------------------
// Prompt assembly (pure, testable)
// -----------------------------------------------------------------------------
function renderDocs(docs: SourceDoc[]): string {
  return docs.map((d) => `- ${d.title}\n${d.body}`).join("\n\n");
}

export function buildSubmittalPrompt(input: PromptInput): string {
  const { project } = input;
  const header =
    `You're helping me review a submittal for ${project.name} (${project.gc}).\n` +
    "Compare the submitted product data against the spec requirements and draft the reviewer's response.";

  let middle: string;
  if (input.freeText && input.freeText.trim()) {
    middle = `Submitted material and spec (as provided):\n${input.freeText.trim()}`;
  } else if (input.instance) {
    const spec = input.instance.documents.filter((d) => d.kind === "spec");
    const submitted = input.instance.documents.filter((d) => d.kind === "submitted");
    middle =
      `Spec requirements:\n${renderDocs(spec)}\n\n` + `Submitted product data:\n${renderDocs(submitted)}`;
  } else {
    middle = "";
  }

  const format =
    "Our review format: submittal no., date, spec section, disposition\n" +
    "(Approved / Approved as Noted / Revise and Resubmit / Rejected), then itemized comments.";

  const instructions =
    "For each comment: cite the spec clause, state compliance or the specific deviation, and\n" +
    "propose the action. Flag anything missing rather than assuming it complies. Choose a\n" +
    "disposition that matches the comments. Keep it concise and professional.\n" +
    "Return a draft for human review only.";

  return [header, "", middle, "", format, "", instructions].join("\n");
}

const SYSTEM_PROMPT = `You are a careful construction submittal reviewer helping a general contractor review a product-data submittal against the project specification.

Non-negotiable rules:
- You produce a DRAFT only, for a human to review and send. A person reviews and sends every submittal response.
- Use ONLY the spec requirements and submitted data provided in the message. Never invent product listings, certifications, model numbers, test reports, or compliance that is not shown.
- Compare each submitted item against the relevant spec clause and cite that clause (for example "Spec 2.1" or "Spec 08 71 00, 2.4").
- For each comment: state whether the item is compliant or describe the specific deviation, then propose the action.
- If required information is missing (for example a UL fire listing that is not shown), flag it as missing. Do NOT assume it complies and do NOT fabricate it.
- Choose a disposition that matches your comments: Approved, Approved as Noted, Revise and Resubmit, or Rejected. If there is any unresolved deviation or missing item, do not choose Approved.
- Approve the items that genuinely comply; do not manufacture problems for clean submittals.

Output format:
- submittal no., date, spec section, disposition, then itemized comments, then a short summary.
- Concise and professional. No marketing language.
- Do not use em dashes or en dashes anywhere. Use a comma, a period, parentheses, or a plain hyphen instead. Plain hyphens are fine inside terms like 08-01, A156.2, BHMA 630, and 90-minute.
- End the draft with the line: "Draft for your review. A person reviews and sends every submittal response."`;

// -----------------------------------------------------------------------------
// The use case
// -----------------------------------------------------------------------------
export const submittalReview: UseCase = {
  id: "submittal-review",
  label: "Submittal review",
  outputType: "Submittal review",
  project: CASCADE_RIDGE,
  instances: INSTANCES,
  systemPrompt: SYSTEM_PROMPT,
  buildPrompt: buildSubmittalPrompt,
  reviewChecklist: [
    "Each cited spec clause is correct.",
    "Every deviation is real, not invented.",
    "Missing items are flagged, not assumed compliant.",
    "The disposition matches the comments.",
    "Reviewer name added before issue.",
  ],
  approval: {
    label: "Reviewed and approved by",
    provenanceNote: "drafted with AI assistance",
  },
  standingLine: "A person reviews and sends every submittal response.",
  freeTextFallback: FREE_TEXT_FALLBACK,
  runLabel: "Draft the review",
  inputNoun: "submittal",
  freeTextPlaceholder:
    "Paste the submitted product data and the relevant spec clauses, then draft the review...",
};
