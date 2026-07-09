import { describe, it, expect } from "vitest";
import { buildMessage, envelopeRecipients, type MailInput } from "./smtp";

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
    const msg = buildMessage(withCc, "fixed-boundary");
    const headerBlock = msg.split("\r\n\r\n")[0]!;
    expect(headerBlock).toContain('To: "Dana Whitfield" <d.whitfield@summitmechanical.test>');
    expect(headerBlock).toContain('Cc: "J. Alvarez" <reviewer@cascaderidge.test>');
    // Exactly one Cc header line.
    expect(headerBlock.match(/^Cc:/gm)?.length).toBe(1);
  });

  it("omits the Cc header entirely when there is no cc", () => {
    const msg = buildMessage(base, "fixed-boundary");
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
