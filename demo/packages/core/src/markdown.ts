// =============================================================================
// Minimal, safe Markdown rendering + plain-text extraction.
// House style: no em dashes or en dashes anywhere. Any dash the model emits is
// normalized to a plain hyphen. Legitimate hyphens (10'-2", 30" x 12", 1-hour,
// Grade 1) use the regular hyphen-minus and are left untouched.
// =============================================================================

const DASHES = /[‒–—―−]/g;

export function normalizeDashes(s: string): string {
  return s.replace(DASHES, "-");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+?)`/g, "<code>$1</code>");
}

const isTableRow = (t: string): boolean => /^\|.*\|$/.test(t);
const isSepRow = (t: string): boolean => /^\|[\s:|-]+\|$/.test(t) && t.includes("-");
const isHeading = (t: string): boolean => /^#{1,6}\s+/.test(t);
const isRule = (t: string): boolean => /^(-{3,}|\*{3,}|_{3,})$/.test(t);
const isBullet = (t: string): boolean => /^[-*]\s+/.test(t);
const isOrdered = (t: string): boolean => /^\d+\.\s+/.test(t);

const tableCells = (r: string): string[] =>
  r
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());

/** Render the supported Markdown subset to safe HTML. */
export function renderMarkdown(md: string): string {
  const lines = escapeHtml(normalizeDashes(md)).replace(/\r/g, "").split("\n");
  let html = "";
  let i = 0;
  let listType: "ul" | "ol" | null = null;
  const closeList = (): void => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  while (i < lines.length) {
    const t = (lines[i] ?? "").trim();

    if (isTableRow(t)) {
      closeList();
      const rows: string[] = [];
      while (i < lines.length && isTableRow((lines[i] ?? "").trim())) {
        rows.push((lines[i] ?? "").trim());
        i++;
      }
      let header: string[] | null = null;
      const body: string[][] = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        if (r === undefined) continue;
        if (idx === 0) {
          header = tableCells(r);
          continue;
        }
        if (isSepRow(r)) continue;
        body.push(tableCells(r));
      }
      html += '<table class="md-table">';
      if (header) {
        html += "<thead><tr>" + header.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead>";
      }
      html +=
        "<tbody>" +
        body.map((cs) => "<tr>" + cs.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
        "</tbody></table>";
      continue;
    }

    if (t === "") {
      closeList();
      i++;
      continue;
    }
    if (isHeading(t)) {
      closeList();
      const lvl = (t.match(/^#+/)?.[0].length ?? 1) + 2;
      const tag = "h" + Math.min(6, Math.max(3, lvl));
      html += `<${tag} class="md-h">${inline(t.replace(/^#+\s+/, ""))}</${tag}>`;
      i++;
      continue;
    }
    if (isRule(t)) {
      closeList();
      html += '<hr class="md-hr">';
      i++;
      continue;
    }
    if (isBullet(t)) {
      if (listType !== "ul") {
        closeList();
        html += '<ul class="md-list">';
        listType = "ul";
      }
      html += `<li>${inline(t.replace(/^[-*]\s+/, ""))}</li>`;
      i++;
      continue;
    }
    if (isOrdered(t)) {
      if (listType !== "ol") {
        closeList();
        html += '<ol class="md-list">';
        listType = "ol";
      }
      html += `<li>${inline(t.replace(/^\d+\.\s+/, ""))}</li>`;
      i++;
      continue;
    }

    closeList();
    const para = [t];
    i++;
    while (i < lines.length) {
      const n = (lines[i] ?? "").trim();
      if (n === "" || isTableRow(n) || isHeading(n) || isBullet(n) || isOrdered(n) || isRule(n)) break;
      para.push(n);
      i++;
    }
    html += `<p>${inline(para.join("<br>"))}</p>`;
  }
  closeList();
  return html;
}

/** Strip Markdown to clean plain text (for copy-to-clipboard). */
export function markdownToPlainText(md: string): string {
  const out: string[] = [];
  const lines = normalizeDashes(md).replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const t = raw.trim();
    if (isRule(t)) {
      out.push("");
      continue;
    }
    if (isTableRow(t)) {
      if (isSepRow(t)) continue;
      out.push(tableCells(t).join("  "));
      continue;
    }
    let line = raw;
    if (isHeading(t)) line = t.replace(/^#{1,6}\s+/, "");
    line = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*([^*\n]+?)\*/g, "$1").replace(/`([^`]+?)`/g, "$1");
    out.push(line);
  }
  // Collapse 3+ blank lines to a single blank line.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
