// =============================================================================
// GC RFI Demo - Single source of case content
// =============================================================================
// This is the ONE file to edit for a future vertical swap. It holds:
//   - PROJECT          : the sample project identity
//   - SHARED_DOCS      : the baked sample documents (all issues read from these)
//   - ISSUES           : the three canned issues (+ which docs each one feeds)
//   - PROMPT_TEMPLATE  : the exact prompt the function sends to Claude
//   - vetted fallback drafts (one per issue, plus a generic free-text fallback)
//   - helpers used by BOTH the browser and the Netlify function
//
// It is a plain ES module. The browser imports it via <script type="module">.
// The serverless function imports it with a relative path. Same source, no drift.
// =============================================================================

export const PROJECT = {
  name: "Lakeview Medical Office",
  gc: "Cascade Ridge Construction",
};

// The RFI format line, kept verbatim with the prompt template.
export const RFI_FORMAT =
  "number, date, to, from, subject, question, suggested resolution, cost / schedule impact.";

// -----------------------------------------------------------------------------
// Shared sample documents (baked in, all issues read from these)
// -----------------------------------------------------------------------------
export const SHARED_DOCS = {
  "spec-0330": {
    title: "Spec - 03 30 00 Cast-in-Place Concrete, 2.3 Concrete Mixes",
    body:
      "A. Foundations and footings: normal-weight concrete, min 28-day compressive strength f'c = 4,000 psi.\n" +
      "B. Slabs-on-grade: 4,000 psi, max water-cement ratio 0.45.",
  },
  "spec-0784": {
    title: "Spec - 07 84 00 Firestopping, 1.1",
    body: "Provide tested firestop systems at all rated penetrations. (No specific system named.)",
  },
  "s-101": {
    title: "Drawing - S-101 General Structural Notes, 3. Concrete",
    body: "a. All footings and foundation walls: f'c = 3,000 psi at 28 days, unless noted otherwise.",
  },
  "s-301": {
    title: "Drawing - S-301 Framing",
    body: "Beam B-12 over Corridor 1: bottom of steel at 10'-2\" AFF.",
  },
  "m-401": {
    title: "Drawing - M-401 Mechanical",
    body:
      "Main supply duct over Corridor 1: 30\" x 12\", route above ceiling. " +
      "Penetrates Corridor 1 wall at grid C-4.",
  },
  "a-201": {
    title: "Drawing - A-201 Architectural",
    body: "Corridor 1 finished ceiling: 9'-0\" AFF.",
  },
  "ls-101": {
    title: "Drawing - LS-101 Life Safety",
    body: "Corridor 1 walls: 1-hour fire-rated, continuous to deck.",
  },
};

// -----------------------------------------------------------------------------
// The three canned issues
// -----------------------------------------------------------------------------
export const ISSUES = [
  {
    id: "concrete-strength",
    label: "Concrete strength: spec says one thing, structural says another",
    docIds: ["spec-0330", "s-101"],
    issueText:
      "The concrete strength requirement for foundations conflicts between disciplines. " +
      "Spec section 03 30 00 (2.3.A) requires foundation and footing concrete at f'c = 4,000 psi, " +
      "while structural general note S-101 (3.a) calls for footings and foundation walls at f'c = 3,000 psi. " +
      "The foundation pour is scheduled for next week, so we need to know which value governs before we batch.",
    fallbackDraft: `RFI No.: 001
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
  },
  {
    id: "duct-beam-ceiling",
    label: "Duct won't fit: beam, duct, and ceiling height conflict over the corridor",
    docIds: ["s-301", "m-401", "a-201"],
    issueText:
      "Possible vertical interference over Corridor 1. The mechanical main supply duct (M-401) is 30\" x 12\" " +
      "and routes above the corridor ceiling, which is set at 9'-0\" AFF (A-201). Beam B-12 crosses the same " +
      "corridor with bottom of steel at 10'-2\" AFF (S-301). Using typical above-ceiling allowances of about " +
      "2\" for duct insulation plus about 6\" for hangers and clearance on top of the 12\" duct depth, please " +
      "confirm whether the duct can pass beneath Beam B-12 while holding the 9'-0\" ceiling, and advise direction " +
      "if it cannot.",
    fallbackDraft: `RFI No.: 002
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
  },
  {
    id: "rated-wall-firestop",
    label: "Rated wall gets a duct through it, but no firestop or damper is shown",
    docIds: ["ls-101", "m-401", "spec-0784"],
    issueText:
      "The 30\" x 12\" mechanical supply duct (M-401) penetrates the Corridor 1 wall at grid C-4. Per LS-101, " +
      "Corridor 1 walls are 1-hour fire-rated and continuous to deck. No fire or smoke damper is shown on the " +
      "drawings at this penetration, and Spec 07 84 00 requires tested firestop systems at rated penetrations but " +
      "names no specific system. Please confirm whether a fire-smoke damper is required and provide the specific " +
      "tested firestop system or detail for this penetration.",
    fallbackDraft: `RFI No.: 003
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
  },
];

// Generic fallback for a free-typed issue (the encore), used only if the live
// call fails and there is no issue-specific saved example.
export const FREE_TEXT_FALLBACK = `RFI No.: [next]
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
// The prompt (function sends this to Claude, with the brackets filled).
// Kept verbatim from the build content; do not reword.
// -----------------------------------------------------------------------------
export const PROMPT_TEMPLATE = `You're helping me draft a professional RFI for {{PROJECT}} ({{GC}}).

The issue: {{ISSUE}}
Relevant documents:
{{DOCS}}
Our RFI format: {{FORMAT}}

Draft the RFI in our format. Cite the documents, ask one clear question, and propose a
suggested resolution. Flag any assumption you had to make. Keep it concise and professional.
Return a draft only; a person will review and send it.`;

// -----------------------------------------------------------------------------
// Helpers (shared by browser + function)
// -----------------------------------------------------------------------------

// Return the doc objects for an issue id, in order. Free-text gets all docs.
export function docsForIssue(issueId) {
  const issue = ISSUES.find((i) => i.id === issueId);
  const ids = issue ? issue.docIds : Object.keys(SHARED_DOCS);
  return ids.map((id) => ({ id, ...SHARED_DOCS[id] }));
}

// Render the baked document snippets as the block injected into the prompt.
export function renderDocsBlock(docs) {
  return docs.map((d) => `- ${d.title}\n${d.body}`).join("\n\n");
}

// Build the exact populated prompt shown in the middle panel and sent to Claude.
export function buildPrompt(issueText, docs) {
  return PROMPT_TEMPLATE.replace("{{PROJECT}}", PROJECT.name)
    .replace("{{GC}}", PROJECT.gc)
    .replace("{{ISSUE}}", issueText.trim())
    .replace("{{DOCS}}", renderDocsBlock(docs))
    .replace("{{FORMAT}}", RFI_FORMAT);
}

// Resolve issue text + docs + fallback for either an issueId or free text.
export function resolveCase({ issueId, freeText }) {
  if (freeText && freeText.trim()) {
    const docs = docsForIssue(null);
    return {
      issueText: freeText.trim(),
      docs,
      fallbackDraft: FREE_TEXT_FALLBACK,
      isFreeText: true,
    };
  }
  const issue = ISSUES.find((i) => i.id === issueId);
  if (!issue) return null;
  return {
    issueText: issue.issueText,
    docs: docsForIssue(issue.id),
    fallbackDraft: issue.fallbackDraft,
    isFreeText: false,
  };
}
