# GC RFI Demo — Build Content

Single-purpose **RFI drafter** for the General Contractor session. Hard-wired to one sample project (Cascade Ridge Construction / Lakeview Medical Office). Three canned issues in a dropdown, plus a free-type box (the "C encore"). **Augment, not automate.**

This is a demo instrument for one session, not a reusable engine. Keep the case content in one obvious block at the top of the code so a future vertical is a five-minute swap, not a rebuild.

---

## Stack (for Claude Code)

- Static front end (HTML/CSS/JS), Study Groups skin: royal blue `#122A9B`, brick red `#C73C2F`, white, near-black `#1A1C20`. Display font signage-style (Barlow Semi Condensed feel), serif body, mono for the prompt/data.
- One Netlify serverless function holds the **Anthropic API key** (never in the browser). Calls Claude, streams the draft back.
- Light rate-limit on the function. Scripted fallback example if the call fails or wifi dies.
- No storage. Copy-to-clipboard only. Refresh clears everything.

---

## Shared sample documents (baked in, all issues read from these)

**Spec — 03 30 00 Cast-in-Place Concrete, 2.3 Concrete Mixes**
- A. Foundations and footings: normal-weight concrete, min 28-day compressive strength f'c = **4,000 psi**.
- B. Slabs-on-grade: 4,000 psi, max water-cement ratio 0.45.

**Spec — 07 84 00 Firestopping, 1.1**
- Provide tested firestop systems at all rated penetrations. (No specific system named.)

**Drawing — S-101 General Structural Notes, 3. Concrete**
- a. All footings and foundation walls: f'c = **3,000 psi** at 28 days, unless noted otherwise.

**Drawing — S-301 Framing**
- Beam B-12 over Corridor 1: bottom of steel at **10'-2" AFF**.

**Drawing — M-401 Mechanical**
- Main supply duct over Corridor 1: **30" x 12"**, route above ceiling. Penetrates Corridor 1 wall at grid **C-4**.

**Drawing — A-201 Architectural**
- Corridor 1 finished ceiling: **9'-0" AFF**.

**Drawing — LS-101 Life Safety**
- Corridor 1 walls: **1-hour fire-rated**, continuous to deck.

---

## Issue 1 — Spec vs. structural conflict  (warm-up)

**Dropdown label:** "Concrete strength: spec says one thing, structural says another"

**Documents to feed:** Spec 03 30 00 (2.3.A) + S-101 note 3.a

**What the AI should land:** an RFI noting the spec requires 4,000 psi foundation concrete while the structural general notes require 3,000 psi, asking which governs, and proposing 4,000 psi to avoid a re-pour and protect the foundation pour scheduled next week. Cost/schedule impact: none if resolved before the pour.

---

## Issue 2 — Cross-discipline coordination clash  (the "wow")

**Dropdown label:** "Duct won't fit: beam, duct, and ceiling height conflict over the corridor"

**Documents to feed:** S-301 (Beam B-12 at 10'-2") + M-401 (30x12 duct) + A-201 (ceiling 9'-0")

**The conflict (so you can sanity-check the output):** above a 9'-0" ceiling, the 12"-deep duct plus ~2" insulation plus ~6" hangers and clearance needs the bottom of structure at roughly **10'-8" AFF**. Beam B-12 sits at **10'-2"**, about 6 inches short. The duct cannot pass under the beam while holding the 9'-0" ceiling.

**What the AI should land:** an RFI describing the interference, asking for direction among raising Beam B-12, rerouting or resizing the duct (e.g., two shallower runs), or dropping the corridor ceiling locally, and flagging the risk to ceiling rough-in if unresolved.

---

## Issue 3 — Missing requirement / clarification  (the hardest to catch)

**Dropdown label:** "Rated wall gets a duct through it, but no firestop or damper is shown"

**Documents to feed:** LS-101 (1-hr corridor wall) + M-401 (duct penetrates wall at C-4) + Spec 07 84 00 (generic firestop)

**What the AI should land:** an RFI noting the 1-hour corridor wall is penetrated by the 30x12 supply duct at grid C-4, but no fire/smoke damper or specific firestop system is shown on the drawings or named in the spec. Ask whether a fire-smoke damper is required and request the specific tested (UL) firestop system or detail. Note it affects the mechanical and firestopping subcontractors.

---

## The prompt (function sends this to Claude, with the brackets filled)

```
You're helping me draft a professional RFI for Lakeview Medical Office (Cascade Ridge Construction).

The issue: [selected issue, or the user's free-typed description]
Relevant documents:
[the baked snippets for that issue]
Our RFI format: number, date, to, from, subject, question, suggested resolution, cost / schedule impact.

Draft the RFI in our format. Cite the documents, ask one clear question, and propose a
suggested resolution. Flag any assumption you had to make. Keep it concise and professional.
Return a draft only; a person will review and send it.
```

Show this populated prompt in the middle panel, live. The room watches the mechanism, not magic.

---

## The screen — three panels, left to right

1. **Inputs:** the sample documents for the chosen issue, plus the issue text (dropdown selection or free-typed).
2. **Prompt:** the populated prompt above, exactly as sent.
3. **Draft:** the RFI streaming in, labeled **"Draft for your review."**

On a projector or phone, stack them top to bottom: inputs, prompt, draft.

---

## Augment, not automate (the non-negotiable behaviors)

- The output is always titled **"Draft for your review,"** never "Your RFI."
- The draft is **editable** in the panel.
- A short **review checklist** gates the finish: references right / one clear question / nothing invented / cost-schedule noted. Only after the human ticks it does an **"Accept — this is mine"** action unlock.
- That action does nothing but enable **Copy to clipboard.** No saving, no sharing, no database.
- A standing line sits under the output the whole time: **a person reviews and sends every RFI.**

---

## Out of scope for this app (future demos, same pattern, different document)

Submittal compliance review (cut sheet vs. spec), change-order narrative from field facts, daily report or delay notice from a super's notes. Same paste-docs-then-draft workflow, different output. Each is its own recipe card and, if wanted, its own small demo later. Not this build.
