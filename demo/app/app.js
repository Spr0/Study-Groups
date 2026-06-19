// =============================================================================
// GC RFI Demo - front end
// =============================================================================
// Augment, not automate: the AI drafts, the human decides. Nothing is stored;
// a refresh clears everything (no localStorage anywhere in this file).
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
  draftText: $("draft-text"),
  reviewBlock: $("review-block"),
  reviewChecks: () => Array.from(document.querySelectorAll(".review-check")),
  acceptBtn: $("accept-btn"),
  copyBtn: $("copy-btn"),
  copyNote: $("copy-note"),
};

let busy = false;

// ---- Populate the dropdown from the single source ----
for (const issue of ISSUES) {
  const opt = document.createElement("option");
  opt.value = issue.id;
  opt.textContent = issue.label;
  els.select.appendChild(opt);
}

// ---- Render helpers ----
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

// Render the populated prompt with the filled-in values highlighted as variables.
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

// Live preview of inputs + prompt as the facilitator selects or types.
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

// ---- Review checklist gating ----
function resetReview() {
  els.reviewChecks().forEach((c) => (c.checked = false));
  els.acceptBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.copyNote.hidden = true;
}
function onReviewChange() {
  const allChecked = els.reviewChecks().every((c) => c.checked);
  els.acceptBtn.disabled = !allChecked;
  // Copy stays locked until the human explicitly accepts.
  if (!allChecked) {
    els.copyBtn.disabled = true;
    els.copyNote.hidden = true;
  }
}

// ---- Draft display state ----
function startDraftUI() {
  els.savedBanner.hidden = true;
  els.reviewBlock.hidden = true;
  resetReview();
  els.draftText.hidden = true;
  els.draftText.value = "";
  els.status.textContent = "Drafting...";
  els.status.classList.add("working");
}
function finishDraftUI({ saved }) {
  els.status.textContent = saved ? "Saved example draft ready. Edit as needed." : "Draft ready. Edit as needed.";
  els.status.classList.remove("working");
  els.savedBanner.hidden = !saved;
  els.draftText.hidden = false;
  els.reviewBlock.hidden = false;
}
function showDraftText(text) {
  els.draftText.hidden = false;
  els.draftText.value = text;
  els.draftText.scrollTop = els.draftText.scrollHeight;
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

  // Simulate offline: skip the network entirely and show the vetted example.
  if (els.offline.checked) {
    showDraftText(c.fallbackDraft);
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

    // JSON means either an error or a server-side fallback (saved example).
    if (ctype.includes("application/json")) {
      const data = await res.json();
      if (data && data.draft) {
        showDraftText(data.draft);
        finishDraftUI({ saved: true });
      } else {
        // Hard error: fall back to the local vetted example so the demo lives.
        showDraftText(c.fallbackDraft);
        finishDraftUI({ saved: true });
      }
      return;
    }

    // Otherwise stream the live draft in.
    showDraftText("");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      if (acc.includes("__STREAM_ERROR__")) {
        showDraftText(c.fallbackDraft);
        finishDraftUI({ saved: true });
        return;
      }
      showDraftText(acc);
    }
    if (!acc.trim()) {
      showDraftText(c.fallbackDraft);
      finishDraftUI({ saved: true });
    } else {
      finishDraftUI({ saved: false });
    }
  } catch {
    // Network died: local vetted example keeps the demo alive.
    showDraftText(c.fallbackDraft);
    finishDraftUI({ saved: true });
  } finally {
    busy = false;
    els.draftBtn.disabled = false;
  }
}

// ---- Accept + copy (the only "finish" path; nothing is stored) ----
function onAccept() {
  els.copyBtn.disabled = false;
  els.acceptBtn.disabled = true;
  els.status.textContent = "Accepted. This is yours to copy.";
}
async function onCopy() {
  try {
    await navigator.clipboard.writeText(els.draftText.value);
  } catch {
    // Fallback copy path for browsers that block the async clipboard API.
    els.draftText.focus();
    els.draftText.select();
    document.execCommand("copy");
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
els.acceptBtn.addEventListener("click", onAccept);
els.copyBtn.addEventListener("click", onCopy);
document.addEventListener("change", (e) => {
  if (e.target.classList && e.target.classList.contains("review-check")) onReviewChange();
});

// Editing the draft after acceptance re-locks copy until re-accepted.
els.draftText.addEventListener("input", () => {
  if (!els.copyBtn.disabled) {
    els.copyBtn.disabled = true;
    els.copyNote.hidden = true;
    els.acceptBtn.disabled = els.reviewChecks().some((c) => !c.checked);
    els.status.textContent = "Draft edited. Re-accept to copy.";
  }
});

refreshPreview();
