// =============================================================================
// The shared review engine (client). Renders the panels, assembles and shows the
// prompt, streams the draft, runs the human-in-the-loop gate, and shows the ROI
// of building the tool. It is driven entirely by a UseCase; it knows nothing
// about RFIs or submittals.
//
// Augment, not automate: the AI drafts, a named human reviews and approves.
// No output leaves unsigned: Export, Copy, and Print are gated on a named
// reviewer (name + role) and the review checklist. Nothing is stored; a refresh
// clears everything (no localStorage).
// =============================================================================
import type { UseCase } from "./types";
import { resolveCase, validateUseCase } from "./use-case";
import { escapeHtml, normalizeDashes, renderMarkdown } from "./markdown";
import { buildApprovalLine, buildCopyText, type Approver } from "./approval";
import { computeRoi, ROI_CONFIG, ROI_HEADLINE, type RoiAppKey } from "./roi";
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
  const signerRole = $<HTMLInputElement>("#signer-role");
  const acceptBtn = $<HTMLButtonElement>("#accept-btn");
  const exportBtn = $<HTMLButtonElement>("#export-btn");
  const copyBtn = $<HTMLButtonElement>("#copy-btn");
  const printBtn = $<HTMLButtonElement>("#print-btn");
  const copyNote = $("#copy-note");
  const checks = (): HTMLInputElement[] =>
    Array.from(container.querySelectorAll<HTMLInputElement>(".review-check"));

  // ---- State ----
  let busy = false;
  let editMode = false;
  let rawDraft = "";
  let approved: Approver | null = null;

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
    if (!approved) return "";
    return (
      `<div class="approval"><p class="approval-line">` +
      escapeHtml(buildApprovalLine(uc.approval, approved)) +
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

  // ---- Gate: no output leaves unsigned ----
  function canApprove(): boolean {
    return (
      checks().every((c) => c.checked) &&
      signerName.value.trim().length > 0 &&
      signerRole.value.trim().length > 0 &&
      !approved
    );
  }
  function setOutputsEnabled(on: boolean): void {
    exportBtn.disabled = !on;
    copyBtn.disabled = !on;
    printBtn.disabled = !on;
  }
  function refreshGate(): void {
    acceptBtn.disabled = !canApprove();
    if (acceptBtn.disabled && !approved) {
      setOutputsEnabled(false);
      copyNote.hidden = true;
    }
  }
  function resetReview(): void {
    checks().forEach((c) => (c.checked = false));
    approved = null;
    acceptBtn.disabled = true;
    setOutputsEnabled(false);
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
    approved = null;
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

  // ---- Approve, then export / copy / print ----
  function onApprove(): void {
    if (!canApprove()) return;
    if (editMode) setEditMode(false);
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    approved = { name: signerName.value.trim(), role: signerRole.value.trim(), date };
    renderDraft();
    acceptBtn.disabled = true;
    setOutputsEnabled(true);
    status.textContent = `Approved by ${approved.name}. Ready to export.`;
  }
  function signedText(): string {
    return buildCopyText(rawDraft, uc.approval, approved);
  }
  function downloadText(filename: string, text: string): void {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    container.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function onExport(): void {
    downloadText(`${uc.id}-approved.txt`, signedText());
  }
  async function onCopy(): Promise<void> {
    const text = signedText();
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
  function onPrint(): void {
    const text = signedText();
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.append(frame);
    const doc = frame.contentWindow!.document;
    doc.open();
    doc.write(
      `<pre style="font-family:'Spectral',Georgia,serif;font-size:13px;line-height:1.6;white-space:pre-wrap;padding:24px;">${escapeHtml(
        text,
      )}</pre>`,
    );
    doc.close();
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  }

  // ---- ROI panel (optional) ----
  if (uc.roiAppKey) setupRoi(container, uc.roiAppKey);

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
  exportBtn.addEventListener("click", onExport);
  copyBtn.addEventListener("click", () => void onCopy());
  printBtn.addEventListener("click", onPrint);
  signerName.addEventListener("input", refreshGate);
  signerRole.addEventListener("input", refreshGate);
  container.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList?.contains("review-check")) refreshGate();
  });
  draftArea.addEventListener("input", () => {
    rawDraft = normalizeDashes(draftArea.value);
    if (approved || !copyBtn.disabled) {
      approved = null;
      setOutputsEnabled(false);
      copyNote.hidden = true;
      status.textContent = "Draft edited. Re-approve before export.";
    }
    refreshGate();
  });

  refreshPreview();
}

// -----------------------------------------------------------------------------
// ROI panel: pure config + math from @sg/core, rendered as DOM. Time saved per
// run shows immediately; annual figures appear once runs (and, for dollars, a
// rate) are entered. We never invent a rate or a runs-per-month figure.
// -----------------------------------------------------------------------------
function setupRoi(container: HTMLElement, appKey: RoiAppKey): void {
  const get = <T extends HTMLElement>(sel: string): T | null => container.querySelector<T>(sel);
  const runs = get<HTMLInputElement>("#roi-runs");
  const rate = get<HTMLInputElement>("#roi-rate");
  const risk = get<HTMLInputElement>("#roi-risk");
  const hoursOut = get("#roi-hours");
  const dollarsOut = get("#roi-dollars");
  const resetBtn = get<HTMLButtonElement>("#roi-reset");
  if (!runs || !rate || !risk || !hoursOut || !dollarsOut || !resetBtn) return;

  const num = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  function refresh(): void {
    const r = num(runs!.value);
    const rt = num(rate!.value);
    const rk = num(risk!.value);
    if (r === null) {
      hoursOut!.textContent = "-";
      dollarsOut!.textContent = "-";
      return;
    }
    const result = computeRoi(appKey, {
      runsPerMonth: r,
      loadedHourlyRate: rt ?? 0,
      riskPerRun: rk ?? 0,
    });
    hoursOut!.textContent = `${result.annualHours.toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })} hrs`;
    dollarsOut!.textContent =
      rt === null ? "-" : `$${result.annualDollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  runs.addEventListener("input", refresh);
  rate.addEventListener("input", refresh);
  risk.addEventListener("input", refresh);
  resetBtn.addEventListener("click", () => {
    runs.value = "";
    rate.value = "";
    risk.value = "";
    refresh();
  });
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

        <div class="signer-fields">
          <div class="signer-field">
            <label class="field-label" for="signer-name">${esc(uc.approval.label)}</label>
            <input id="signer-name" class="signer-name" type="text" autocomplete="off" placeholder="Your name" />
          </div>
          <div class="signer-field">
            <label class="field-label" for="signer-role">Role</label>
            <input id="signer-role" class="signer-role" type="text" autocomplete="off" placeholder="Your role" />
          </div>
        </div>

        <div class="accept-row">
          <button id="accept-btn" class="btn btn-accept" type="button" disabled>Approve this draft</button>
          <button id="export-btn" class="btn btn-copy" type="button" disabled>Export</button>
          <button id="copy-btn" class="btn btn-copy" type="button" disabled>Copy</button>
          <button id="print-btn" class="btn btn-copy" type="button" disabled>Print</button>
          <span id="copy-note" class="copy-note" role="status" hidden>Copied. Nothing is saved.</span>
        </div>
      </div>
    </section>
${uc.roiAppKey ? roiPanel(uc.roiAppKey) : ""}
  </div>`;
}

function roiPanel(appKey: RoiAppKey): string {
  const cfg = ROI_CONFIG[appKey];
  const score = cfg.value * cfg.frequency;
  const timeSaved = cfg.minutesWithout - cfg.minutesWith;
  const esc = escapeHtml;
  return `
    <section class="panel roi-panel" aria-labelledby="roi-h">
      <div class="panel-head"><h2 id="roi-h">Return on building this tool</h2></div>
      <p class="roi-headline">${esc(ROI_HEADLINE)}</p>

      <div class="roi-score">
        <span class="roi-score-eq">Value ${cfg.value} x Frequency ${cfg.frequency} =</span>
        <strong class="roi-score-num">${score}</strong>
        <span class="roi-rank">${esc(cfg.rank)}</span>
      </div>

      <div class="roi-inputs">
        <label class="field-label">Runs per month
          <input id="roi-runs" type="number" min="0" inputmode="numeric" placeholder="e.g. 20" />
        </label>
        <label class="field-label">Loaded hourly rate ($)
          <input id="roi-rate" type="number" min="0" inputmode="numeric" placeholder="your number" />
        </label>
        <label class="field-label">Dollars at risk per run (optional)
          <input id="roi-risk" type="number" min="0" inputmode="numeric" placeholder="optional" />
          <small class="roi-note">${esc(cfg.risk)}</small>
        </label>
      </div>

      <div class="roi-stats">
        <div class="roi-stat"><span class="roi-stat-label">Time saved per run</span><span class="roi-stat-value">${timeSaved} min</span></div>
        <div class="roi-stat"><span class="roi-stat-label">Hours saved per year</span><span id="roi-hours" class="roi-stat-value">-</span></div>
        <div class="roi-stat roi-stat-hero"><span class="roi-stat-label">Dollars per year</span><span id="roi-dollars" class="roi-stat-value">-</span></div>
      </div>

      <button id="roi-reset" class="btn-link" type="button">Reset</button>
    </section>`;
}
