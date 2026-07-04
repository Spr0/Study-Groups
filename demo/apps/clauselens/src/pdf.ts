// Client-side PDF text extraction via pdf.js (ported from the standalone
// ClauseLens app). The text layer is extracted in the browser and only plain
// text goes to the analyze function. Image-only or scanned PDFs have no text
// layer, so we detect that and tell the user rather than sending empty text
// downstream (which would produce a false "Not Found" table).
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Below this many non-whitespace characters we treat the document as having no
// usable text layer (scanned or image-only).
const MIN_TEXT_CHARS = 20;

export class ScannedPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScannedPdfError";
  }
}

export async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? (item.str ?? "") : ""))
        .join(" ");
      text += pageText + "\n";
    }
  } finally {
    void pdf.destroy();
  }

  if (text.replace(/\s+/g, " ").trim().length < MIN_TEXT_CHARS) {
    throw new ScannedPdfError(
      "This looks like a scanned or image-only PDF (no text found). Run OCR first, or use the sample.",
    );
  }
  return text.trim();
}
