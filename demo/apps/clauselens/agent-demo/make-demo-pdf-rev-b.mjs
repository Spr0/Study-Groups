/* eslint-disable no-console -- CLI script; stdout is the interface */
// Generates the LIVE-PATH rehearsal contract PDF: a fictional "Revision B" of
// the Cascade Ridge subcontract with all three demo defects corrected
//   - Liability Cap PRESENT (new Limitation of Liability clause)
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
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Fictional. Revision B of the sample subcontract with the three defects fixed.
const REV_B_TEXT = `SUBCONTRACT AGREEMENT (REVISION B)

This Subcontract Agreement ("Agreement") is entered into between Cascade Ridge Construction ("Contractor") and Summit Mechanical Services LLC ("Subcontractor") for work on the Lakeview Medical Office project located in Bellingham, WA. This Revision B supersedes the prior draft and reflects the negotiated, balanced terms.

1. SCOPE OF WORK
Subcontractor shall furnish all labor, materials, and equipment necessary to complete the HVAC and plumbing rough-in for the Lakeview Medical Office, in accordance with the Contract Documents and the project schedule.

2. TERM
This Agreement shall commence on the Effective Date and shall remain in effect until Subcontractor's work is finally completed and accepted, but in no event later than eighteen (18) months from the Effective Date, unless extended by written change order signed by both parties.

3. PAYMENT
Contractor shall pay Subcontractor for work satisfactorily completed within thirty (30) days following Contractor's receipt of Subcontractor's approved monthly application for payment. Contractor shall retain five percent (5%) of each progress payment as retainage, to be released within sixty (60) days of final acceptance.

4. TERMINATION
Either party may terminate this Agreement for its convenience upon thirty (30) days written notice to the other party. Either party may terminate for cause if the other party fails to cure a material default within fourteen (14) days of written notice. Upon termination for convenience, Subcontractor shall be paid for work properly performed through the date of termination plus reasonable demobilization and close-out costs.

5. INSURANCE
Subcontractor shall maintain commercial general liability insurance with limits of not less than $1,000,000 per occurrence and shall name Contractor as an additional insured.

6. INDEMNIFICATION
To the fullest extent permitted by law, each party shall indemnify, defend, and hold harmless the other party from and against any claims, damages, losses, and expenses, including reasonable attorneys' fees, but only to the extent caused by the negligent acts or omissions of the indemnifying party. This indemnification obligation is mutual and reciprocal.

7. LIMITATION OF LIABILITY
Except for its indemnification obligations and losses caused by gross negligence or willful misconduct, each party's aggregate liability arising out of or related to this Agreement shall not exceed the total Subcontract amount paid or payable under this Agreement.

8. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Washington.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.`;

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
