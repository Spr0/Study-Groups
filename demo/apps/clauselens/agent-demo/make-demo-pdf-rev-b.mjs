/* eslint-disable no-console -- CLI script; stdout is the interface */
// Generates the LIVE-PATH rehearsal contract PDF: a fictional "Revision B" of
// the Cascade Ridge subcontract with all three demo defects corrected
//   - Liability Cap PRESENT, and expressly covering the indemnification
//     obligations (only third-party bodily injury sits outside the cap), so
//     there is no uncapped-carve-out exposure finding
//   - Indemnity MUTUAL (each party indemnifies the other)
//   - Termination for convenience MUTUAL (either party, with close-out costs)
// so its content hash does NOT match the vetted sample and it exercises the
// live inference path. It is deliberately NOT added to the vetted cache.
// Live vetting is a manual step with a real key; do not run it in CI.
//
// Self-contained on purpose (its own copy of the tiny PDF layout) so it can
// never alter the canonical cascade-ridge-subcontract.pdf. Hand-rolled
// single-font PDF (Courier, ASCII): no dependencies, pdf.js extracts the exact
// strings written here.
//
// Usage: node agent-demo/make-demo-pdf-rev-b.mjs   (from apps/clauselens)
// Output: agent-demo/cascade-ridge-subcontract-rev-b.pdf
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// The canonical Rev B text is the vetted-cache single source of truth in the
// sample-data package; read it straight from there so the PDF can never drift
// from the frozen entry it is recognized by. NOTE: this PDF is FROZEN (content
// hash f12668ade5e873a6...). Do not regenerate it unless REV_B_CONTRACT_TEXT
// itself changes; regenerating from unchanged text reproduces the same bytes.
const clausesTs = readFileSync(join(here, "../../../packages/sample-data/src/clauses.ts"), "utf-8");
const revBMatch = clausesTs.match(/REV_B_CONTRACT_TEXT = `([\s\S]*?)`;/);
if (!revBMatch) throw new Error("Could not find REV_B_CONTRACT_TEXT in clauses.ts");
const REV_B_TEXT = revBMatch[1];

// ---- Layout: US Letter, Courier 10pt, 6pt/char, 14pt leading ----
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const FONT_SIZE = 10;
const LEADING = 14;
const CHARS_PER_LINE = Math.floor((PAGE_W - 2 * MARGIN) / (FONT_SIZE * 0.6)); // 84
const LINES_PER_PAGE = Math.floor((PAGE_H - 2 * MARGIN) / LEADING); // 48

function wrap(paragraph) {
  if (paragraph.length <= CHARS_PER_LINE) return [paragraph];
  const words = paragraph.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > CHARS_PER_LINE) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const lines = REV_B_TEXT.split("\n").flatMap(wrap);
const pages = [];
for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
  pages.push(lines.slice(i, i + LINES_PER_PAGE));
}

const escapePdf = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function contentStream(pageLines) {
  let s = `BT\n/F1 ${FONT_SIZE} Tf\n${LEADING} TL\n${MARGIN} ${PAGE_H - MARGIN} Td\n`;
  for (const line of pageLines) {
    s += `(${escapePdf(line)}) Tj\nT*\n`;
  }
  s += "ET\n";
  return s;
}

// ---- Assemble objects: 1 catalog, 2 pages, 3 font, then per page: page + stream ----
const objects = [];
const pageObjNums = pages.map((_, i) => 4 + i * 2);
objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`;
objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`;
pages.forEach((pageLines, i) => {
  const pageNum = 4 + i * 2;
  const streamNum = pageNum + 1;
  objects[pageNum] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
    `/Resources << /Font << /F1 3 0 R >> >> /Contents ${streamNum} 0 R >>`;
  const stream = contentStream(pageLines);
  objects[streamNum] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`;
});

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let i = 1; i < objects.length; i++) {
  offsets[i] = Buffer.byteLength(pdf);
  pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
}
const xrefStart = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
for (let i = 1; i < objects.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

const out = join(here, "cascade-ridge-subcontract-rev-b.pdf");
writeFileSync(out, pdf, "latin1");
console.log(`Wrote ${out} (${pages.length} pages, ${lines.length} lines)`);
