import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VETTED_CONTRACTS, fingerprintContract } from "@sg/sample-data";

const here = dirname(fileURLToPath(import.meta.url));

// Each vetted entry ships a PDF the facilitator drops. This guards the critical
// invariant: the dropped PDF's extracted text still fingerprints to the frozen
// entry, so recognition (and the short-circuit) keeps working. If either the PDF
// or its frozen text drifts, this fails.
const PDF_BY_ID = {
  "cascade-ridge-subcontract": "cascade-ridge-subcontract.pdf",
  "cascade-ridge-subcontract-rev-b": "cascade-ridge-subcontract-rev-b.pdf",
};

async function extractPdf(path) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  let text = "";
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      text += (await page.getTextContent()).items.map((it) => it.str ?? "").join(" ") + "\n";
    }
  } finally {
    void doc.destroy();
  }
  return text.trim();
}

describe("each shipped vetted PDF fingerprints to its frozen entry", () => {
  for (const vc of VETTED_CONTRACTS) {
    it(`${vc.id}: the dropped PDF is recognized as this entry`, async () => {
      const pdf = PDF_BY_ID[vc.id];
      expect(pdf, `no PDF mapped for vetted id ${vc.id}`).toBeTruthy();
      const text = await extractPdf(join(here, pdf));
      expect(await fingerprintContract(text)).toBe(await fingerprintContract(vc.contractText));
    }, 20000);
  }
});
