// =============================================================================
// The shared review engine (client). Renders the three-panel UI, assembles and
// shows the prompt, streams the draft, and runs the human-in-the-loop gate. It
// is driven entirely by a UseCase; it knows nothing about RFIs or submittals.
//
// Augment, not automate: the AI drafts, a named human reviews and approves.
// Nothing is stored; a refresh clears everything (no localStorage).
// =============================================================================
import type { UseCase } from "./types";
import { resolveCase, validateUseCase } from "./use-case";
import { escapeHtml, normalizeDashes, renderMarkdown } from "./markdown";
import { buildApprovalLine, buildCopyText } from "./approval";
import { fetchDraft } from "./client";
import { DRAFT_ENDPOINT } from "./protocol";

export interface ReviewAppOptions {
  useCase: UseCase;
  /** Defaults to "/api/draft". */
  endpoint?: string;
}

export function createReviewApp(container: HTMLElement, options: ReviewAppOptions): void {
  const uc = options.useCase;
  validateUseCase(uc);
  const endpoint = options.endpoint ?? DRAFT_ENDPOINT;
  const noun = uc.inputNoun ?? "item";
  const runLabel = uc.runLabel ?? `Draft the ${uc.outputType.toLowerCase()}`;
  const placeholder =
    uc.freeTextPlaceholder ?? `Paste your own ${noun} and the relevant requirements...`;

  container.innerHTML = template(uc, { noun, runLabel, placeholder });

  // ---- Element handles ----
  const $ = <T extends HTMLElement>(sel: string): T => {
    const el = container.querySelector<T>(sel);
    if (!el) throw new Error(`Missing element: ${sel}`);
    return el;
  };
  const select = $<HTMLSelectElement>("#instance-select");
  const freeText = $<HTMLTextAreaElement>("#free-text");
  const runBtn = $<HTMLButtonElement>("#run-btn");
  const offline = $<HTMLInputElement>("#simulate-offline");
  const docsEl = $("#docs");
  const instanceText = $("#instance-text");
  const promptView = $("#prompt-view");
  const savedBanner = $("#saved-banner");
  const status = $("#draft-status");
  const toolbar = $("#draft-toolbar");
  const editToggle = $<HTMLButtonElement>("#edit-toggle");
  const editHint = $("#edit-hint");
  const rendered = $("#draft-rendered");
  const draftHeading = $("#draft-h");
  const draftArea = $<HTMLTextAreaElement>("#draft-text");
  const reviewBlock = $("#review-block");
  const signerName = $<HTMLInputElement>("#signer-name");
  const acceptBtn = $<HTMLButtonElement>("#accept-btn");
  const copyBtn = $<HTMLButtonElement>("#copy-btn");
  const copyNote = $("#copy-note");
  const checks = (): HTMLInputElement[] =>
    Array.from(container.querySelectorAll<HTMLInputElement>(".review-check"));

  // ---- State ----
  let busy = false;
  let editMode = false;
  let rawDraft = "";
  let approvedName: string | null = null;

  // ---- Populate the instance dropdown ----
  for (const inst of uc.instances) {
    const opt = document.createElement("option");
    opt.value = inst.id;
    opt.textContent = inst.label;
    select.append(opt);
  }

  // ---- Inputs preview ----
  const currentResolved = () => {
    const ft = freeText.value.trim();
    if (ft) return resolveCase(uc, { freeText: ft });
    if (select.value) return resolveCase(uc, { instanceId: select.value });
    return null;
  };

  function renderDocs(docs: { title: string; body: string }[]): void {
    docsEl.replaceChildren();
    for (const d of docs) {
      const card = document.createElement("div");
      card.className = "doc";
      const title = document.createElement("p");
      title.className = "doc-title";
      title.textContent = d.title;
      const body = document.createElement("p");
      body.className = "doc-body";
      body.textContent = d.body;
      card.append(title, body);
      docsEl.append(card);
    }
  }

  function refreshPreview(): void {
    const c = currentResolved();
    if (!c) {
      docsEl.innerHTML = `<p class="muted">Pick an example to see the documents the draft will read from.</p>`;
      instanceText.textContent = "Nothing selected yet.";
      instanceText.classList.add("muted");
      promptView.textContent = "The populated prompt will appear here.";
      promptView.classList.add("muted");
      return;
    }
    renderDocs(c.promptInput.instance?.documents ?? []);
    instanceText.textContent = c.isFreeText
      ? (c.promptInput.freeText ?? "")
      : (c.promptInput.instance?.label ?? "");
    instanceText.classList.remove("muted");
    promptView.textContent = uc.buildPrompt(c.promptInput);
    promptView.classList.remove("muted");
  }

  // ---- Draft rendering ----
  function approvalHtml(): string {
    if (!approvedName) return "";
    return (
      `<div class="approval"><p class="approval-line">` +
      escapeHtml(buildApprovalLine(uc.approval, approvedName)) +
      `</p></div>`
    );
  }
  function renderDraft(): void {
    rendered.innerHTML = renderMarkdown(rawDraft) + approvalHtml();
  }
  function updateDraft(text: string): void {
    rawDraft = normalizeDashes(text);
    if (!editMode) {
      renderDraft();
      rendered.hidden = false;
      rendered.scrollTop = rendered.scrollHeight;
    }
  }

  // ---- Gate ----
  function canApprove(): boolean {
    return checks().every((c) => c.checked) && signerName.value.trim().length > 0 && !approvedName;
  }
  function refreshGate(): void {
    acceptBtn.disabled = !canApprove();
    if (acceptBtn.disabled && !approvedName) {
      copyBtn.disabled = true;
      copyNote.hidden = true;
    }
  }
  function resetReview(): void {
    checks().forEach((c) => (c.checked = false));
    approvedName = null;
    acceptBtn.disabled = true;
    copyBtn.disabled = true;
    copyNote.hidden = true;
  }

  // ---- Edit / Preview ----
  function setEditMode(on: boolean): void {
    editMode = on;
    if (on) {
      draftArea.value = rawDraft;
      draftArea.hidden = false;
      rendered.hidden = true;
      editToggle.textContent = "Preview";
      editToggle.setAttribute("aria-pressed", "true");
      editHint.hidden = false;
      draftArea.focus();
    } else {
      rawDraft = normalizeDashes(draftArea.value);
      renderDraft();
      draftArea.hidden = true;
      rendered.hidden = false;
      editToggle.textContent = "Edit";
      editToggle.setAttribute("aria-pressed", "false");
      editHint.hidden = true;
    }
  }

  // ---- Lifecycle UI ----
  function startDraftUI(): void {
    savedBanner.hidden = true;
    reviewBlock.hidden = true;
    resetReview();
    editMode = false;
    rawDraft = "";
    approvedName = null;
    draftArea.hidden = true;
    rendered.hidden = true;
    toolbar.hidden = true;
    editToggle.textContent = "Edit";
    editHint.hidden = true;
    status.textContent = "Drafting...";
    status.classList.add("working");
  }
  function finishDraftUI(saved: boolean): void {
    status.textContent = saved
      ? "Saved example draft ready. Review and approve."
      : "Draft ready. Review and approve.";
    status.classList.remove("working");
    savedBanner.hidden = !saved;
    toolbar.hidden = false;
    rendered.hidden = false;
    draftArea.hidden = true;
    reviewBlock.hidden = false;
    draftHeading.focus(); // move focus to the result for screen-reader users
  }

  // ---- Run ----
  async function run(): Promise<void> {
    if (busy) return;
    const c = currentResolved();
    if (!c) {
      status.textContent = "Pick an example or paste your own first.";
      return;
    }
    busy = true;
    runBtn.disabled = true;
    runBtn.setAttribute("aria-busy", "true");
    startDraftUI();

    const body = c.isFreeText
      ? { useCaseId: uc.id, freeText: c.promptInput.freeText }
      : { useCaseId: uc.id, instanceId: select.value };

    if (offline.checked) {
      updateDraft(c.fallbackDraft);
      finishDraftUI(true);
      busy = false;
      runBtn.disabled = false;
      runBtn.removeAttribute("aria-busy");
      return;
    }

    try {
      const result = await fetchDraft(endpoint, body, updateDraft);
      finishDraftUI(result.saved);
    } catch {
      // Any failure: the local vetted fallback keeps the demo alive.
      updateDraft(c.fallbackDraft);
      finishDraftUI(true);
    } finally {
      busy = false;
      runBtn.disabled = false;
      runBtn.removeAttribute("aria-busy");
    }
  }

  // ---- Approve + copy ----
  function onApprove(): void {
    if (!canApprove()) return;
    if (editMode) setEditMode(false);
    approvedName = signerName.value.trim();
    renderDraft();
    acceptBtn.disabled = true;
    copyBtn.disabled = false;
    status.textContent = `Approved by ${approvedName}. Ready to copy.`;
  }
  async function onCopy(): Promise<void> {
    const text = buildCopyText(rawDraft, uc.approval, approvedName);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const tmp = document.createElement("textarea");
      tmp.value = text;
      container.append(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
    }
    copyNote.hidden = false;
  }

  // ---- Wiring ----
  select.addEventListener("change", () => {
    freeText.value = "";
    refreshPreview();
  });
  freeText.addEventListener("input", () => {
    if (freeText.value.trim()) select.selectedIndex = 0;
    refreshPreview();
  });
  runBtn.addEventListener("click", () => void run());
  editToggle.addEventListener("click", () => setEditMode(!editMode));
  acceptBtn.addEventListener("click", onApprove);
  copyBtn.addEventListener("click", () => void onCopy());
  signerName.addEventListener("input", refreshGate);
  container.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList?.contains("review-check")) refreshGate();
  });
  draftArea.addEventListener("input", () => {
    rawDraft = normalizeDashes(draftArea.value);
    if (approvedName || !copyBtn.disabled) {
      approvedName = null;
      copyBtn.disabled = true;
      copyNote.hidden = true;
      status.textContent = "Draft edited. Re-approve before copying.";
    }
    refreshGate();
  });

  refreshPreview();
}

// -----------------------------------------------------------------------------
// Markup (semantic + accessible). Dynamic text is escaped.
// -----------------------------------------------------------------------------
function template(
  uc: UseCase,
  ui: { noun: string; runLabel: string; placeholder: string },
): string {
  const esc = escapeHtml;
  const checklist = uc.reviewChecklist
    .map(
      (item, i) =>
        `<label class="check"><input type="checkbox" class="review-check" data-i="${i}" /> ${esc(item)}</label>`,
    )
    .join("");
  return `
  <div class="panels">
    <section class="panel" aria-labelledby="inputs-h">
      <div class="panel-head"><span class="panel-num" aria-hidden="true">1</span><h2 id="inputs-h">Inputs</h2></div>

      <label class="field-label" for="instance-select">Choose an example</label>
      <select id="instance-select" class="select">
        <option value="" disabled selected>Select an example...</option>
      </select>

      <div class="or-row" aria-hidden="true"><span>or paste your own (the encore)</span></div>

      <label class="field-label" for="free-text">Paste your own ${esc(ui.noun)}</label>
      <textarea id="free-text" class="free-text" rows="3" placeholder="${esc(ui.placeholder)}"></textarea>

      <div class="controls">
        <button id="run-btn" class="btn btn-primary" type="button">${esc(ui.runLabel)}</button>
        <label class="offline-toggle"><input type="checkbox" id="simulate-offline" /> <span>Simulate offline (show fallback)</span></label>
      </div>

      <h3 class="subhead">Documents in play</h3>
      <div id="docs" class="docs"><p class="muted">Pick an example to see the documents the draft will read from.</p></div>

      <h3 class="subhead">What we are reviewing</h3>
      <p id="instance-text" class="instance-text muted">Nothing selected yet.</p>
    </section>

    <section class="panel" aria-labelledby="prompt-h">
      <div class="panel-head"><span class="panel-num" aria-hidden="true">2</span><h2 id="prompt-h">Prompt</h2></div>
      <p class="panel-note">This is exactly what gets sent to the model. No magic, just the mechanism.</p>
      <pre id="prompt-view" class="prompt-view muted" tabindex="0" aria-label="Populated prompt">The populated prompt will appear here.</pre>
    </section>

    <section class="panel" aria-labelledby="draft-h">
      <div class="panel-head"><span class="panel-num" aria-hidden="true">3</span><h2 id="draft-h" tabindex="-1">Draft for your review</h2></div>

      <div id="saved-banner" class="saved-banner" role="status" hidden>Showing a saved example draft. Live AI was unavailable, so the demo keeps going.</div>

      <p id="draft-status" class="draft-status muted" role="status" aria-live="polite">Your draft will appear here.</p>

      <div id="draft-toolbar" class="draft-toolbar" hidden>
        <button id="edit-toggle" class="btn-link" type="button" aria-pressed="false">Edit</button>
        <span id="edit-hint" class="edit-hint muted" hidden>Editing raw text. Select Preview when done.</span>
      </div>

      <article id="draft-rendered" class="draft-rendered" aria-label="Draft document" hidden></article>
      <textarea id="draft-text" class="draft-text" rows="18" aria-label="Editable draft" hidden></textarea>

      <p class="standing-line">${esc(uc.standingLine)}</p>

      <div id="review-block" class="review-block" hidden>
        <h3 class="subhead">Review before you approve</h3>
        <fieldset class="checklist">
          <legend class="sr-only">Review checklist</legend>
          ${checklist}
        </fieldset>

        <label class="field-label" for="signer-name">${esc(uc.approval.label)}</label>
        <input id="signer-name" class="signer-name" type="text" autocomplete="off" placeholder="e.g. Pat Morgan, Project Manager" />

        <div class="accept-row">
          <button id="accept-btn" class="btn btn-accept" type="button" disabled>Approve this draft</button>
          <button id="copy-btn" class="btn btn-copy" type="button" disabled>Copy to clipboard</button>
          <span id="copy-note" class="copy-note" role="status" hidden>Copied. Nothing is saved.</span>
        </div>
      </div>
    </section>
  </div>`;
}
