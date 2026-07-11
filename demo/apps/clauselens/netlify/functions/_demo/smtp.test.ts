import { describe, it, expect } from "vitest";
import { buildMessage, envelopeRecipients, type MailInput, type ResolvedAttachment } from "./smtp";

const base: MailInput = {
  host: "localhost",
  port: 1025,
  from: { name: "Contract Review Agent (demo)", email: "contract-review-agent@cascaderidge.test" },
  to: { name: "Dana Whitfield", email: "d.whitfield@summitmechanical.test" },
  subject: "Reviewed contract summary",
  text: "body",
  html: "<p>body</p>",
};

const withCc: MailInput = {
  ...base,
  cc: { name: "J. Alvarez", email: "reviewer@cascaderidge.test" },
};

describe("smtp Cc handling (one message, two recipients, one Cc header)", () => {
  it("carries the To and, when set, a single Cc header", () => {
    const msg = buildMessage(withCc, [], "fixed-boundary");
    const headerBlock = msg.split("\r\n\r\n")[0]!;
    expect(headerBlock).toContain('To: "Dana Whitfield" <d.whitfield@summitmechanical.test>');
    expect(headerBlock).toContain('Cc: "J. Alvarez" <reviewer@cascaderidge.test>');
    // Exactly one Cc header line.
    expect(headerBlock.match(/^Cc:/gm)?.length).toBe(1);
  });

  it("omits the Cc header entirely when there is no cc", () => {
    const msg = buildMessage(base, [], "fixed-boundary");
    expect(msg).not.toMatch(/^Cc:/m);
  });

  it("delivers to both the signatory and the reviewer in a single transaction", () => {
    // Both recipients are RCPT TO on one MAIL FROM, so Mailpit stores ONE
    // message (a Cc is not a second message).
    expect(envelopeRecipients(withCc)).toEqual([
      "d.whitfield@summitmechanical.test",
      "reviewer@cascaderidge.test",
    ]);
    expect(envelopeRecipients(base)).toEqual(["d.whitfield@summitmechanical.test"]);
  });
});

describe("smtp attachments (multipart/mixed; one message; filename preserved)", () => {
  const pdf: ResolvedAttachment = {
    filename: "cascade-ridge-subcontract-rev-b.pdf",
    content: new TextEncoder().encode("%PDF-1.4 pretend bytes"),
  };

  it("with no attachments it stays a plain multipart/alternative", () => {
    const msg = buildMessage(withCc, [], "fixed-boundary");
    expect(msg).toContain('Content-Type: multipart/alternative; boundary="fixed-boundary"');
    expect(msg).not.toMatch(/multipart\/mixed/);
    expect(msg).not.toMatch(/Content-Disposition:/);
  });

  it("with an attachment it wraps the alternative in a multipart/mixed and adds one PDF part", () => {
    const msg = buildMessage(withCc, [pdf], "fixed-boundary");
    expect(msg).toContain('Content-Type: multipart/mixed; boundary="fixed-boundary"');
    expect(msg).toContain('Content-Type: multipart/alternative; boundary="fixed-boundary-alt"');
    // Exactly one attachment part, the filename preserved verbatim.
    expect(msg.match(/^Content-Disposition: attachment;/gm)?.length).toBe(1);
    expect(msg).toContain(
      'Content-Disposition: attachment; filename="cascade-ridge-subcontract-rev-b.pdf"',
    );
    expect(msg).toContain('Content-Type: application/pdf; name="cascade-ridge-subcontract-rev-b.pdf"');
    expect(msg).toContain("Content-Transfer-Encoding: base64");
    // The body carries the base64 of the referenced bytes.
    expect(msg).toContain(Buffer.from(pdf.content).toString("base64"));
    // Cc still exactly once; recipients unchanged (still one stored message).
    expect(msg.match(/^Cc:/gm)?.length).toBe(1);
    expect(envelopeRecipients({ ...withCc, attachments: [{ filename: pdf.filename, path: "x" }] })).toEqual([
      "d.whitfield@summitmechanical.test",
      "reviewer@cascaderidge.test",
    ]);
  });
});
