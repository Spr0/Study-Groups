// =============================================================================
// ClauseLens - a differentiated app on the Study Groups platform.
//
// Contract review is not a document-drafting flow, so this app does NOT use
// the shared 3-panel review engine. It shares the design tokens, approval
// wording, and ROI math from @sg/core, but its layout and interactions are its
// own, driven by the use case:
//   - input is a PDF drop (client-side pdf.js text extraction), plus the
//     contract dropdown and a prompt peek for transparency
//   - results are the pre-platform clause-by-clause cards, with the
//     "Raise before signing" list as the dominant element
//   - each clause has an "Explain this section" call and a Verified checkbox;
//     all five checks plus a named reviewer unlock Approve / Export / Copy /
//     Print (no output leaves unsigned)
// =============================================================================
import "@sg/core/styles.css";
import "./styles.css";
import {
  buildApprovalLine,
  computeRoi,
  escapeHtml,
  ROI_CONFIG,
  ROI_HEADLINE,
  type ApprovalConfig,
  type Approver,
} from "@sg/core";
import {
  buildExtractPrompt,
  CONTRACT_OPTIONS,
  fingerprintContract,
  FIVE_CLAUSES,
  isValidResult,
  SAMPLE_CONTRACT_TEXT,
  SAMPLE_EXPLAIN_FALLBACKS,
  STATUS_NOT_FOUND,
  type Clause,
  type ClauseResult,
  type ContractOption,
} from "@sg/sample-data";
import type { SignoffPayload } from "./demo-templates";
import { extractPdfText, ScannedPdfError } from "./pdf";

const APPROVAL: ApprovalConfig = {
  label: "Reviewed and approved by",
  provenanceNote: "approved by the named reviewer before use",
};
const STANDING_LINE = "A person verifies every clause against the contract.";
const PROMPT_PEEK_CHARS = 1400;

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app mount point");
const app: HTMLElement = root;

// ---- State ----
interface RunSource {
  label: string;
  contractText: string;
  option: ContractOption | null; // null when the contract came from a file
}
let source: RunSource | null = null;
let result: ClauseResult | null = null;
let usedFallback = false;
let approved: Approver | null = null;
let busy = false;

// ---- Agent demo mode (local only): on when the demo agent answers its
// health check, which requires DEMO_AGENT=1 in the netlify dev environment.
// In production the probe 403s and none of the demo UI exists. ----
let demoMode = false;
void (async () => {
  try {
    const res = await fetch("/api/demo/health");
    demoMode = res.ok && ((await res.json()) as { demo?: boolean }).demo === true;
  } catch {
    demoMode = false;
  }
})();

// The demo contract is recognized by CONTENT HASH, however it arrives: a
// dropped PDF of the sample arms the vetted fallback exactly like picking it
// from the dropdown, while any other PDF goes to the model.
let sampleFpPromise: Promise<string> | null = null;
const sampleFingerprint = (): Promise<string> =>
  (sampleFpPromise ??= fingerprintContract(SAMPLE_CONTRACT_TEXT));

// =============================================================================
// Input view
// =============================================================================
function renderInput(): void {
  result = null;
  approved = null;
  usedFallback = false;
  app.innerHTML = `
  <div class="cl-input">
    <label class="field-label" for="cl-select">Choose a contract</label>
    <select id="cl-select" class="select">
      <option value="" selected>Select a contract...</option>
      ${CONTRACT_OPTIONS.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join("")}
    </select>

    <div class="or-row" aria-hidden="true"><span>or drop your own (the encore)</span></div>

    <div id="cl-drop" class="cl-drop" role="button" tabindex="0"
      aria-label="Drop a contract PDF here, or press Enter to browse">
      <div class="cl-drop-icon" aria-hidden="true">&#8595;</div>
      <div class="cl-drop-main">Drop a contract PDF here, or click to browse</div>
      <div class="cl-drop-sub">Text-layer PDFs only; scanned PDFs need OCR first. Nothing is stored.</div>
      <input id="cl-file" type="file" accept=".pdf,.txt" hidden />
    </div>
    <div id="cl-file-note" class="cl-file-note" hidden></div>
    <div id="cl-error" class="saved-banner" hidden></div>

    <details class="cl-prompt-peek">
      <summary>The prompt: exactly what gets sent to the model</summary>
      <pre id="cl-prompt" class="prompt-view muted">Pick a contract or drop a PDF to assemble the prompt.</pre>
    </details>

    <div class="controls">
      <button id="cl-run" class="btn btn-primary" type="button" disabled>Review the clauses</button>
      <label class="offline-toggle"><input type="checkbox" id="cl-offline" /> <span>Simulate offline (show fallback)</span></label>
    </div>
    <p class="standing-line">${escapeHtml(STANDING_LINE)}</p>
  </div>`;

  const select = q<HTMLSelectElement>("#cl-select");
  const drop = q<HTMLElement>("#cl-drop");
  const file = q<HTMLInputElement>("#cl-file");
  const note = q<HTMLElement>("#cl-file-note");
  const error = q<HTMLElement>("#cl-error");
  const runBtn = q<HTMLButtonElement>("#cl-run");
  const promptPre = q<HTMLElement>("#cl-prompt");

  function setError(msg: string | null): void {
    error.hidden = !msg;
    error.textContent = msg ?? "";
  }
  function refresh(): void {
    runBtn.disabled = !source || busy;
    if (source) {
      const text = source.contractText;
      const shown =
        text.length > PROMPT_PEEK_CHARS
          ? `${text.slice(0, PROMPT_PEEK_CHARS).trimEnd()}\n\n[contract continues: ${(text.length - PROMPT_PEEK_CHARS).toLocaleString()} more characters are sent]`
          : text;
      promptPre.textContent = buildExtractPrompt(shown);
      promptPre.classList.remove("muted");
    } else {
      promptPre.textContent = "Pick a contract or drop a PDF to assemble the prompt.";
      promptPre.classList.add("muted");
    }
  }
  function setFileNote(name: string | null): void {
    note.hidden = !name;
    note.textContent = name ? `✓ ${name}` : "";
  }

  select.addEventListener("change", () => {
    setError(null);
    setFileNote(null);
    const opt = CONTRACT_OPTIONS.find((o) => o.id === select.value) ?? null;
    source = opt ? { label: opt.label, contractText: opt.contractText, option: opt } : null;
    refresh();
  });

  async function acceptFile(f: File): Promise<void> {
    setError(null);
    select.value = "";
    const lower = f.name.toLowerCase();
    try {
      let text: string;
      if (f.type === "application/pdf" || lower.endsWith(".pdf")) {
        text = await extractPdfText(await f.arrayBuffer());
      } else if (f.type === "text/plain" || lower.endsWith(".txt")) {
        text = (await f.text()).trim();
        if (!text) throw new Error("That text file looks empty.");
      } else {
        throw new Error("Please drop a PDF (or TXT) file.");
      }
      const matched = (await fingerprintContract(text)) === (await sampleFingerprint());
      source = {
        label: f.name,
        contractText: text,
        option: matched ? (CONTRACT_OPTIONS[0] ?? null) : null,
      };
      setFileNote(f.name);
    } catch (e) {
      source = null;
      setFileNote(null);
      setError(
        e instanceof ScannedPdfError || e instanceof Error
          ? e.message
          : "Could not read this file. Try another PDF.",
      );
    }
    refresh();
  }

  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      file.click();
    }
  });
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const f = e.dataTransfer?.files?.[0];
    if (f) void acceptFile(f);
  });
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    if (f) void acceptFile(f);
  });

  runBtn.addEventListener("click", () => void run(setError, runBtn));
  refresh();
}

async function run(
  setError: (msg: string | null) => void,
  runBtn: HTMLButtonElement,
): Promise<void> {
  if (!source || busy) return;
  busy = true;
  runBtn.disabled = true;
  runBtn.textContent = "Reviewing the contract...";
  setError(null);
  const offline = q<HTMLInputElement>("#cl-offline").checked;

  // The vetted fallback exists only for the built-in samples. Never fabricate
  // a result for an arbitrary contract.
  const fallback = source.option?.fallbackResult ?? null;

  if (offline && fallback) {
    result = fallback;
    usedFallback = true;
    busy = false;
    renderResults();
    return;
  }

  // Live model call with a hard timeout: short when the vetted fallback is
  // armed (the demo can never hang), generous for arbitrary contracts.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fallback ? 12_000 : 45_000);
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "extract", contractText: source.contractText }),
      signal: controller.signal,
    });
    const data: unknown = await res.json().catch(() => null);
    const body = (data ?? {}) as { result?: unknown; error?: string };
    if (!res.ok || body.error || !isValidResult(body.result)) {
      throw new Error(body.error ?? "Could not read a result from the analysis. Try again.");
    }
    result = body.result;
    usedFallback = false;
    renderResults();
  } catch (err) {
    if (fallback) {
      // The demo never dies: fall back to the vetted cached result.
      result = fallback;
      usedFallback = true;
      renderResults();
    } else {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    }
  } finally {
    clearTimeout(timer);
    busy = false;
    runBtn.disabled = !source;
    runBtn.textContent = "Review the clauses";
  }
}

// =============================================================================
// Results view: the raise list dominates; clause cards below; sign-off gate.
// =============================================================================
function clauseCard(c: Clause): string {
  const missing = c.status === STATUS_NOT_FOUND;
  return `
  <article class="cl-card${missing ? " cl-card--missing" : ""}" data-clause="${escapeHtml(c.name)}">
    <header class="cl-card-head">
      <span class="cl-card-name">${escapeHtml(c.name)}</span>
      <span class="cl-chip ${missing ? "cl-chip--missing" : "cl-chip--found"}">${escapeHtml(c.status)}</span>
      <span class="cl-spacer"></span>
      <label class="cl-verify"><input type="checkbox" class="cl-verify-box" data-name="${escapeHtml(c.name)}" /> Verified</label>
    </header>
    <div class="cl-quote${missing ? " cl-quote--missing" : ""}">${escapeHtml(c.quote)}</div>
    ${c.plain ? `<div class="cl-plain"><span class="cl-plain-tag">Plain</span> ${escapeHtml(c.plain)}</div>` : ""}
    <div class="cl-explain">
      <button class="btn-link cl-explain-btn" type="button" data-name="${escapeHtml(c.name)}" aria-expanded="false">Explain this section</button>
      <div class="cl-explain-body" hidden></div>
    </div>
  </article>`;
}

function roiPanel(): string {
  const cfg = ROI_CONFIG.clauselens;
  return `
  <section class="panel roi-panel" aria-labelledby="roi-h">
    <div class="panel-head"><h2 id="roi-h">Return on building this tool</h2></div>
    <p class="roi-headline">${escapeHtml(ROI_HEADLINE)}</p>
    <div class="roi-score">
      <span class="roi-score-eq">Value ${cfg.value} x Frequency ${cfg.frequency} =</span>
      <strong class="roi-score-num">${cfg.value * cfg.frequency}</strong>
      <span class="roi-rank">${escapeHtml(cfg.rank)}</span>
    </div>
    <div class="roi-inputs">
      <label class="field-label">Contracts per month
        <input id="roi-runs" type="number" min="0" inputmode="numeric" placeholder="e.g. 12" />
      </label>
      <label class="field-label">Loaded hourly rate ($)
        <input id="roi-rate" type="number" min="0" inputmode="numeric" placeholder="your number" />
      </label>
      <label class="field-label">Dollars at risk per contract (optional)
        <input id="roi-risk" type="number" min="0" inputmode="numeric" placeholder="optional" />
        <small class="roi-note">${escapeHtml(cfg.risk)}</small>
      </label>
    </div>
    <div class="roi-stats">
      <div class="roi-stat"><span class="roi-stat-label">Time saved per review</span><span class="roi-stat-value">${cfg.minutesWithout - cfg.minutesWith} min</span></div>
      <div class="roi-stat"><span class="roi-stat-label">Hours saved per year</span><span id="roi-hours" class="roi-stat-value">-</span></div>
      <div class="roi-stat roi-stat-hero"><span class="roi-stat-label">Dollars per year</span><span id="roi-dollars" class="roi-stat-value">-</span></div>
    </div>
    <button id="roi-reset" class="btn-link" type="button">Reset</button>
  </section>`;
}

function renderResults(): void {
  if (!result || !source) return;
  const r = result;
  const src = source;
  approved = null;

  const raiseItems = r.raise.length
    ? r.raise
        .map((item, i) => `<li class="${i === 0 ? "cl-raise-first" : ""}">${escapeHtml(item)}</li>`)
        .join("")
    : `<li class="cl-raise-none">Nothing flagged.</li>`;

  app.innerHTML = `
  <div class="cl-results">
    <div class="cl-results-head">
      <div>
        <h2 class="cl-results-title">Clause review</h2>
        <div class="cl-source">${escapeHtml(src.label)}</div>
      </div>
      <button id="cl-new" class="btn-link" type="button">New review</button>
    </div>

    ${usedFallback ? `<div class="saved-banner" role="status">Showing the saved example review. Live AI was unavailable, so the demo keeps going.</div>` : ""}

    <section class="cl-raise" aria-labelledby="cl-raise-h">
      <div class="cl-raise-head">
        <h3 id="cl-raise-h" class="cl-raise-kicker">Raise before signing</h3>
        <span class="cl-raise-count">${r.raise.length} item${r.raise.length === 1 ? "" : "s"}</span>
      </div>
      <ol class="cl-raise-list">${raiseItems}</ol>
    </section>

    <p class="cl-verify-hint">Check off each clause as you verify it against the contract. All five unlock the sign-off.</p>

    <div id="cl-cards">${r.clauses.map(clauseCard).join("")}</div>

    <section class="cl-signoff" aria-labelledby="cl-signoff-h">
      <h3 id="cl-signoff-h" class="subhead">Sign off and send</h3>
      <div class="signer-fields">
        <div class="signer-field">
          <label class="field-label" for="cl-name">${escapeHtml(APPROVAL.label)}</label>
          <input id="cl-name" class="signer-name" type="text" autocomplete="off" placeholder="Your name" />
        </div>
        <div class="signer-field">
          <label class="field-label" for="cl-role">Role</label>
          <input id="cl-role" class="signer-role" type="text" autocomplete="off" placeholder="Your role" />
        </div>
      </div>
      <div class="accept-row">
        <button id="cl-approve" class="btn btn-accept" type="button" disabled>Approve this review</button>
        <button id="cl-send" class="btn btn-primary" type="button" hidden>Email for sign-off</button>
        <button id="cl-export" class="btn btn-copy" type="button" disabled>Export</button>
        <button id="cl-copy" class="btn btn-copy" type="button" disabled>Copy</button>
        <button id="cl-print" class="btn btn-copy" type="button" disabled>Print</button>
        <span id="cl-note" class="copy-note" role="status" hidden>Copied. Nothing is saved.</span>
        <span id="cl-sent" class="copy-note" role="status" hidden></span>
      </div>
      <p id="cl-approved-line" class="cl-approved" hidden></p>
      <p class="standing-line">${escapeHtml(STANDING_LINE)}</p>
    </section>

    ${roiPanel()}
  </div>`;

  q<HTMLButtonElement>("#cl-new").addEventListener("click", renderInput);

  // ---- Explain this section ----
  for (const btn of app.querySelectorAll<HTMLButtonElement>(".cl-explain-btn")) {
    btn.addEventListener("click", () => void explain(btn));
  }

  // ---- Verify + sign-off gate: no output leaves unsigned ----
  const nameEl = q<HTMLInputElement>("#cl-name");
  const roleEl = q<HTMLInputElement>("#cl-role");
  const approveBtn = q<HTMLButtonElement>("#cl-approve");
  const exportBtn = q<HTMLButtonElement>("#cl-export");
  const copyBtn = q<HTMLButtonElement>("#cl-copy");
  const printBtn = q<HTMLButtonElement>("#cl-print");
  const note = q<HTMLElement>("#cl-note");
  const approvedLine = q<HTMLElement>("#cl-approved-line");

  const allVerified = (): boolean =>
    [...app.querySelectorAll<HTMLInputElement>(".cl-verify-box")].every((b) => b.checked);
  const setOutputs = (on: boolean): void => {
    exportBtn.disabled = !on;
    copyBtn.disabled = !on;
    printBtn.disabled = !on;
  };
  const sendBtn = q<HTMLButtonElement>("#cl-send");
  const sentNote = q<HTMLElement>("#cl-sent");
  const refreshGate = (): void => {
    const ready = allVerified() && nameEl.value.trim() !== "" && roleEl.value.trim() !== "";
    approveBtn.disabled = !ready || !!approved;
    if (!approved) {
      setOutputs(false);
      note.hidden = true;
      approvedLine.hidden = true;
      sendBtn.hidden = true;
      sentNote.hidden = true;
    }
  };
  app.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList?.contains("cl-verify-box")) {
      if (approved) approved = null; // unchecking revokes; re-approve required
      refreshGate();
    }
  });
  nameEl.addEventListener("input", refreshGate);
  roleEl.addEventListener("input", refreshGate);

  approveBtn.addEventListener("click", () => {
    if (approveBtn.disabled) return;
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    approved = { name: nameEl.value.trim(), role: roleEl.value.trim(), date };
    approveBtn.disabled = true;
    setOutputs(true);
    approvedLine.hidden = false;
    approvedLine.textContent = buildApprovalLine(APPROVAL, approved);
    // The agent step, local demo only: route the verified review for the
    // human sign-off click. The button never exists in production.
    if (demoMode) {
      sendBtn.hidden = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Email for sign-off";
    }
  });

  sendBtn.addEventListener("click", () => {
    if (!approved) return;
    const payload: SignoffPayload = {
      source: src.label,
      reviewer: approved,
      result: r,
      verified: [...FIVE_CLAUSES],
      approvedAtIso: new Date().toISOString(),
    };
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";
    void (async () => {
      try {
        const res = await fetch("/api/demo/send-approval", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!res.ok || !data?.ok)
          throw new Error(data?.error ?? "Could not reach the local inbox.");
        sendBtn.textContent = "Sent for sign-off";
        sentNote.textContent = "Report sent for sign-off. Open the inbox.";
        sentNote.hidden = false;
      } catch (err) {
        sendBtn.disabled = false;
        sendBtn.textContent = "Email for sign-off";
        sentNote.textContent =
          err instanceof Error ? err.message : "Send failed. Is Mailpit running?";
        sentNote.hidden = false;
      }
    })();
  });

  exportBtn.addEventListener("click", () => {
    downloadText("clause-review-approved.txt", exportText(r, src));
  });
  copyBtn.addEventListener("click", () => void copyText(exportText(r, src), note));
  printBtn.addEventListener("click", () => printText(exportText(r, src)));

  // ---- ROI wiring (pure math from @sg/core) ----
  setupRoi();
  window.scrollTo(0, 0);
}

async function explain(btn: HTMLButtonElement): Promise<void> {
  const name = btn.dataset.name ?? "";
  const body = btn.parentElement?.querySelector<HTMLElement>(".cl-explain-body");
  const clause = result?.clauses.find((c) => c.name === name);
  if (!body || !clause) return;

  if (!body.hidden) {
    body.hidden = true;
    btn.textContent = "Explain this section";
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  if (body.dataset.loaded === "true") {
    body.hidden = false;
    btn.textContent = "Hide explanation";
    btn.setAttribute("aria-expanded", "true");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Explaining...";
  const offline = usedFallback || !!q<HTMLInputElement | null>("#cl-offline", true)?.checked;
  const vetted = source?.option ? SAMPLE_EXPLAIN_FALLBACKS[name] : undefined;

  let text: string | null = null;
  if (!offline) {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "explain",
          clauseName: name,
          quote: clause.quote,
          plain: clause.plain,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        explanation?: string;
        error?: string;
      } | null;
      if (res.ok && data?.explanation) text = data.explanation;
    } catch {
      text = null;
    }
  }
  if (!text) {
    text =
      vetted ??
      "Live AI was unavailable and no saved explanation exists for this clause. Verify it directly against the contract.";
  }

  body.textContent = text;
  body.dataset.loaded = "true";
  body.hidden = false;
  btn.disabled = false;
  btn.textContent = "Hide explanation";
  btn.setAttribute("aria-expanded", "true");
}

// =============================================================================
// Export / copy / print (plain text; the approval line is appended once signed)
// =============================================================================
function exportText(r: ClauseResult, src: RunSource): string {
  const lines: string[] = [];
  lines.push("Contract Clause Review");
  lines.push(`Source: ${src.label}`);
  lines.push("");
  lines.push("RAISE BEFORE SIGNING");
  if (r.raise.length === 0) lines.push("Nothing flagged.");
  else r.raise.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
  lines.push("");
  for (const c of r.clauses) {
    lines.push(`${c.name.toUpperCase()} - ${c.status}`);
    lines.push(`"${c.quote}"`);
    if (c.plain) lines.push(`Plain: ${c.plain}`);
    lines.push("");
  }
  lines.push(STANDING_LINE);
  if (approved) {
    lines.push("");
    lines.push(buildApprovalLine(APPROVAL, approved));
  }
  return lines.join("\n");
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  app.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text: string, note: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const tmp = document.createElement("textarea");
    tmp.value = text;
    app.append(tmp);
    tmp.select();
    document.execCommand("copy");
    tmp.remove();
  }
  note.hidden = false;
}

function printText(text: string): void {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.append(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(
    `<pre style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;white-space:pre-wrap;padding:24px;">${escapeHtml(text)}</pre>`,
  );
  doc.close();
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 1000);
}

// =============================================================================
// ROI wiring (numbers only appear once the reviewer enters them)
// =============================================================================
function setupRoi(): void {
  const runs = q<HTMLInputElement | null>("#roi-runs", true);
  const rate = q<HTMLInputElement | null>("#roi-rate", true);
  const risk = q<HTMLInputElement | null>("#roi-risk", true);
  const hoursOut = q<HTMLElement | null>("#roi-hours", true);
  const dollarsOut = q<HTMLElement | null>("#roi-dollars", true);
  const resetBtn = q<HTMLButtonElement | null>("#roi-reset", true);
  if (!runs || !rate || !risk || !hoursOut || !dollarsOut || !resetBtn) return;

  const num = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const refresh = (): void => {
    const r = num(runs.value);
    const rt = num(rate.value);
    const rk = num(risk.value);
    if (r === null) {
      hoursOut.textContent = "-";
      dollarsOut.textContent = "-";
      return;
    }
    const res = computeRoi("clauselens", {
      runsPerMonth: r,
      loadedHourlyRate: rt ?? 0,
      riskPerRun: rk ?? 0,
    });
    hoursOut.textContent = `${res.annualHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`;
    dollarsOut.textContent =
      rt === null
        ? "-"
        : `$${res.annualDollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };
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

// ---- tiny DOM helper ----
function q<T extends HTMLElement | null>(sel: string, optional = false): T {
  const el = app.querySelector(sel) ?? document.querySelector(sel);
  if (!el && !optional) throw new Error(`Missing element: ${sel}`);
  return el as T;
}

// FIVE_CLAUSES is imported for exhaustiveness assurance in dev; the card list
// renders whatever the gated result carries (always the five, in order).
void FIVE_CLAUSES;

renderInput();
