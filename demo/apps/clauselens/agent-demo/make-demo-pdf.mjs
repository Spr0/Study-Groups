/* eslint-disable no-console -- CLI script; stdout is the interface */
// Generates the official demo contract PDF from the canonical sample text, so
// the dropped file's extracted text fingerprints back to the vetted result.
// Hand-rolled single-font PDF (Courier, ASCII): no dependencies, and pdf.js
// extracts the exact strings written here.
//
// Usage: node agent-demo/make-demo-pdf.mjs   (from apps/clauselens)
// Output: agent-demo/cascade-ridge-subcontract.pdf
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Read the canonical text straight from the source module so it can never drift.
const clausesTs = readFileSync(join(here, "../../../packages/sample-data/src/clauses.ts"), "utf-8");
const m = clausesTs.match(/SAMPLE_CONTRACT_TEXT = `([\s\S]*?)`;/);
if (!m) throw new Error("Could not find SAMPLE_CONTRACT_TEXT in clauses.ts");
const text = m[1];

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

const lines = text.split("\n").flatMap(wrap);
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

const out = join(here, "cascade-ridge-subcontract.pdf");
writeFileSync(out, pdf, "latin1");
console.log(`Wrote ${out} (${pages.length} pages, ${lines.length} lines)`);
