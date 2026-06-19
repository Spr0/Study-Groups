// =============================================================================
// GC RFI Demo - front end
// =============================================================================
// Augment, not automate: the AI drafts, the human decides. The draft renders as
// a clean document by default and stays editable (Edit toggle). Approving the
// draft requires a named reviewer and stamps an internal approval block (name,
// date, and an honest AI-provenance note) into the document, which the copied
// output carries. Nothing is stored; a refresh clears everything (no
// localStorage anywhere in this file).
// =============================================================================

import { ISSUES, resolveCase, buildPrompt } from "./data/issues.js";

const $ = (id) => document.getElementById(id);

const els = {
  select: $("issue-select"),
  freeText: $("free-text"),
  draftBtn: $("draft-btn"),
  offline: $("simulate-offline"),
  docs: $("docs"),
  issueText: $("issue-text"),
  promptView: $("prompt-view"),
  savedBanner: $("saved-banner"),
  status: $("draft-status"),
  toolbar: $("draft-toolbar"),
  editToggle: $("edit-toggle"),
  editHint: $("edit-hint"),
  rendered: $("draft-rendered"),
  draftText: $("draft-text"),
  reviewBlock: $("review-block"),
  reviewChecks: () => Array.from(document.querySelectorAll(".review-check")),
  signerName: $("signer-name"),
  acceptBtn: $("accept-btn"),
  copyBtn: $("copy-btn"),
  copyNote: $("copy-note"),
};

let busy = false;
let editMode = false;
let rawDraft = ""; // the draft body (markdown/plain text)
let approval = null; // { name, date } once approved

// ---- Populate the dropdown from the single source ----
for (const issue of ISSUES) {
  const opt = document.createElement("option");
  opt.value = issue.id;
  opt.textContent = issue.label;
  els.select.appendChild(opt);
}

// House style: no em dashes or en dashes anywhere in output. Normalize any dash
// the live model emits to a plain hyphen. Legitimate hyphens (10'-2", 30" x 12",
// 1-hour, B-12) use the regular hyphen-minus and are left untouched.
function normalizeDashes(s) {
  return s.replace(/[‒–—―−]/g, "-");
}

// =============================================================================
// Minimal, safe Markdown renderer (handles the subset the model and the vetted
// fallbacks produce: headings, bold/italic, lists, tables, rules, paragraphs).
// =============================================================================
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>");
}
function renderMarkdown(md) {
  const lines = escapeHtml(normalizeDashes(md)).replace(/\r/g, "").split("\n");
  let html = "";
  let i = 0;
  let listType = null;
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };
  const isTableRow = (t) => /^\|.*\|$/.test(t);
  const isSepRow = (t) => /^\|[\s:|-]+\|$/.test(t) && t.includes("-");

  while (i < lines.length) {
    const t = lines[i].trim();

    if (isTableRow(t)) {
      closeList();
      const rows = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(lines[i].trim());
        i++;
      }
      const cells = (r) => r.slice(1, -1).split("|").map((c) => c.trim());
      let header = null;
      const body = [];
      rows.forEach((r, idx) => {
        if (idx === 0) {
          header = cells(r);
          return;
        }
        if (isSepRow(r)) return;
        body.push(cells(r));
      });
      html += '<table class="md-table">';
      if (header) html += "<thead><tr>" + header.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>";
      html += "<tbody>" + body.map((cs) => "<tr>" + cs.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>";
      continue;
    }

    if (t === "") {
      closeList();
      i++;
      continue;
    }
    if (/^#{1,6}\s+/.test(t)) {
      closeList();
      const lvl = t.match(/^#+/)[0].length;
      const tag = "h" + Math.min(6, Math.max(3, lvl + 2));
      html += `<${tag} class="md-h">${inline(t.replace(/^#+\s+/, ""))}</${tag}>`;
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      closeList();
      html += '<hr class="md-hr">';
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      if (listType !== "ul") {
        closeList();
        html += '<ul class="md-list">';
        listType = "ul";
      }
      html += `<li>${inline(t.replace(/^[-*]\s+/, ""))}</li>`;
      i++;
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      if (listType !== "ol") {
        closeList();
        html += '<ol class="md-list">';
        listType = "ol";
      }
      html += `<li>${inline(t.replace(/^\d+\.\s+/, ""))}</li>`;
      i++;
      continue;
    }

    // paragraph: gather contiguous non-special lines
    closeList();
    const para = [t];
    i++;
    while (i < lines.length) {
      const n = lines[i].trim();
      if (n === "" || isTableRow(n) || /^#{1,6}\s+/.test(n) || /^[-*]\s+/.test(n) || /^\d+\.\s+/.test(n) || /^(-{3,}|\*{3,}|_{3,})$/.test(n)) break;
      para.push(n);
      i++;
    }
    html += `<p>${inline(para.join("<br>"))}</p>`;
  }
  closeList();
  return html;
}

// Internal approval block (not a legal signature). The wide gap uses non-breaking
// spaces so it survives as readable plain text when copied.
function approvalBlockHtml() {
  if (!approval) return "";
  const gap = "        ";
  return (
    '<div class="approval">' +
    `<p class="approval-line">Reviewed and approved by: <strong>${escapeHtml(approval.name)}</strong>${gap}Date: ${escapeHtml(approval.date)}</p>` +
    '<p class="approval-note">Draft prepared with AI assistance · approved by the named reviewer before issue.</p>' +
    "</div>"
  );
}

function renderDraft() {
  els.rendered.innerHTML = renderMarkdown(rawDraft) + approvalBlockHtml();
}

// ---- Render helpers (inputs / prompt) ----
function renderDocs(docs) {
  if (!docs.length) {
    els.docs.innerHTML = '<p class="muted">No specific documents. The full project pack is provided as context.</p>';
    return;
  }
  els.docs.innerHTML = "";
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
    els.docs.appendChild(card);
  }
}
function renderPrompt(promptText) {
  els.promptView.classList.remove("muted");
  els.promptView.textContent = promptText;
}

function currentCase() {
  const freeText = els.freeText.value.trim();
  const issueId = els.select.value;
  if (freeText) return resolveCase({ freeText });
  if (issueId) return resolveCase({ issueId });
  return null;
}

function refreshPreview() {
  const c = currentCase();
  if (!c) {
    els.docs.innerHTML = '<p class="muted">Pick an issue to see the documents the draft will read from.</p>';
    els.issueText.textContent = "Nothing selected yet.";
    els.issueText.classList.add("muted");
    els.promptView.textContent = "The populated prompt will appear here.";
    els.promptView.classList.add("muted");
    return;
  }
  renderDocs(c.docs);
  els.issueText.textContent = c.issueText;
  els.issueText.classList.remove("muted");
  renderPrompt(buildPrompt(c.issueText, c.docs));
}

// ---- Review checklist + approval gating ----
function canApprove() {
  const allChecked = els.reviewChecks().every((c) => c.checked);
  const named = els.signerName.value.trim().length > 0;
  return allChecked && named && !approval;
}
function refreshGate() {
  els.acceptBtn.disabled = !canApprove();
  if (!els.acceptBtn.disabled) return;
  if (!approval) {
    els.copyBtn.disabled = true;
    els.copyNote.hidden = true;
  }
}
function resetReview() {
  els.reviewChecks().forEach((c) => (c.checked = false));
  approval = null;
  els.acceptBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.copyNote.hidden = true;
}

// ---- Edit / Preview toggle ----
function setEditMode(on) {
  editMode = on;
  if (on) {
    els.draftText.value = rawDraft;
    els.draftText.hidden = false;
    els.rendered.hidden = true;
    els.editToggle.textContent = "Preview";
    els.editHint.hidden = false;
  } else {
    rawDraft = normalizeDashes(els.draftText.value);
    renderDraft();
    els.draftText.hidden = true;
    els.rendered.hidden = false;
    els.editToggle.textContent = "Edit";
    els.editHint.hidden = true;
  }
}

// ---- Draft display state ----
function startDraftUI() {
  els.savedBanner.hidden = true;
  els.reviewBlock.hidden = true;
  resetReview();
  editMode = false;
  rawDraft = "";
  approval = null;
  els.draftText.hidden = true;
  els.rendered.hidden = true;
  els.toolbar.hidden = true;
  els.editToggle.textContent = "Edit";
  els.editHint.hidden = true;
  els.status.textContent = "Drafting...";
  els.status.classList.add("working");
}
function finishDraftUI({ saved }) {
  els.status.textContent = saved ? "Saved example draft ready. Review and approve." : "Draft ready. Review and approve.";
  els.status.classList.remove("working");
  els.savedBanner.hidden = !saved;
  els.toolbar.hidden = false;
  els.rendered.hidden = false;
  els.draftText.hidden = true;
  els.reviewBlock.hidden = false;
}
function updateDraft(text) {
  rawDraft = normalizeDashes(text);
  if (!editMode) {
    renderDraft();
    els.rendered.hidden = false;
    els.rendered.scrollTop = els.rendered.scrollHeight;
  }
}

// ---- The draft action ----
async function runDraft() {
  if (busy) return;
  const c = currentCase();
  if (!c) {
    els.status.textContent = "Pick an issue or type your own first.";
    return;
  }

  busy = true;
  els.draftBtn.disabled = true;
  startDraftUI();

  const payload = c.isFreeText ? { freeText: c.issueText } : { issueId: els.select.value };

  if (els.offline.checked) {
    updateDraft(c.fallbackDraft);
    finishDraftUI({ saved: true });
    busy = false;
    els.draftBtn.disabled = false;
    return;
  }

  try {
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const ctype = res.headers.get("content-type") || "";

    if (ctype.includes("application/json")) {
      const data = await res.json();
      updateDraft(data && data.draft ? data.draft : c.fallbackDraft);
      finishDraftUI({ saved: true });
      return;
    }

    // Stream the live draft in, re-rendering as it grows.
    updateDraft("");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      if (acc.includes("__STREAM_ERROR__")) {
        updateDraft(c.fallbackDraft);
        finishDraftUI({ saved: true });
        return;
      }
      updateDraft(acc);
    }
    if (!acc.trim()) {
      updateDraft(c.fallbackDraft);
      finishDraftUI({ saved: true });
    } else {
      finishDraftUI({ saved: false });
    }
  } catch {
    updateDraft(c.fallbackDraft);
    finishDraftUI({ saved: true });
  } finally {
    busy = false;
    els.draftBtn.disabled = false;
  }
}

// ---- Approve, then copy (the only finish path; nothing is stored) ----
function onApprove() {
  if (!canApprove()) return;
  if (editMode) setEditMode(false); // capture any pending edits first
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  approval = { name: els.signerName.value.trim(), date };
  renderDraft();
  els.acceptBtn.disabled = true;
  els.copyBtn.disabled = false;
  els.status.textContent = "Approved by " + approval.name + ". Ready to copy.";
}
async function onCopy() {
  // Copy the clean, rendered plain text (no markup, no dashes), approval included.
  const text = els.rendered.innerText;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const tmp = document.createElement("textarea");
    tmp.value = text;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand("copy");
    tmp.remove();
  }
  els.copyNote.hidden = false;
}

// ---- Wiring ----
els.select.addEventListener("change", () => {
  els.freeText.value = "";
  refreshPreview();
});
els.freeText.addEventListener("input", () => {
  if (els.freeText.value.trim()) els.select.selectedIndex = 0;
  refreshPreview();
});
els.draftBtn.addEventListener("click", runDraft);
els.editToggle.addEventListener("click", () => setEditMode(!editMode));
els.acceptBtn.addEventListener("click", onApprove);
els.copyBtn.addEventListener("click", onCopy);
els.signerName.addEventListener("input", refreshGate);
document.addEventListener("change", (e) => {
  if (e.target.classList && e.target.classList.contains("review-check")) refreshGate();
});

// Editing the draft after approval clears the approval and re-locks copy.
els.draftText.addEventListener("input", () => {
  rawDraft = normalizeDashes(els.draftText.value);
  if (approval || !els.copyBtn.disabled) {
    approval = null;
    els.copyBtn.disabled = true;
    els.copyNote.hidden = true;
    els.status.textContent = "Draft edited. Re-approve before copying.";
  }
  refreshGate();
});

refreshPreview();
