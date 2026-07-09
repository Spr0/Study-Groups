// =============================================================================
// Minimal SMTP client for the LOCAL Mailpit catcher only. Plain TCP to
// localhost, no auth, no TLS, no relaying: deliberately incapable of real
// external send. Dependency-free so nothing mail-capable ships in the bundle
// beyond these ~90 lines.
// =============================================================================
import net from "node:net";

export interface MailInput {
  host: string;
  port: number;
  from: { name: string; email: string };
  to: { name: string; email: string };
  /** Optional carbon copy: added as a Cc header and as an RCPT recipient. */
  cc?: { name: string; email: string };
  subject: string;
  text: string;
  html: string;
}

function expectCode(line: string, codes: number[]): void {
  const code = Number(line.slice(0, 3));
  if (!codes.includes(code)) throw new Error(`SMTP unexpected response: ${line.trim()}`);
}

/** RFC 2047 is overkill for a local demo; headers stay ASCII-safe. */
function header(name: string, value: string): string {
  return `${name}: ${value.replace(/[\r\n]/g, " ")}`;
}

/**
 * The envelope recipient list for a single SMTP transaction: the To address,
 * plus the Cc address when present. One transaction with both recipients means
 * Mailpit stores exactly ONE message (a Cc is not a second message). Pure and
 * exported so this is unit-tested without a socket.
 */
export function envelopeRecipients(mail: MailInput): string[] {
  return mail.cc ? [mail.to.email, mail.cc.email] : [mail.to.email];
}

/**
 * The RFC 5322 message: From, To, an optional single Cc, then the multipart
 * body. Pure and exported so the header shape (exactly one Cc, only when set)
 * is unit-tested. The boundary is injectable for deterministic tests.
 */
export function buildMessage(
  mail: MailInput,
  boundary = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
): string {
  const headers = [
    header("From", `"${mail.from.name}" <${mail.from.email}>`),
    header("To", `"${mail.to.name}" <${mail.to.email}>`),
  ];
  // A single Cc header when present, so Mailpit shows it and the recipient list
  // records the carbon copy. Only the signatory email sets this.
  if (mail.cc) headers.push(header("Cc", `"${mail.cc.name}" <${mail.cc.email}>`));
  headers.push(
    header("Subject", mail.subject),
    header("Date", new Date().toUTCString()),
    header("MIME-Version", "1.0"),
    header("Content-Type", `multipart/alternative; boundary="${boundary}"`),
  );
  return [
    ...headers,
    "",
    `--${boundary}`,
    header("Content-Type", "text/plain; charset=utf-8"),
    "",
    mail.text,
    "",
    `--${boundary}`,
    header("Content-Type", "text/html; charset=utf-8"),
    "",
    mail.html,
    "",
    `--${boundary}--`,
    "",
  ]
    .join("\r\n")
    // Dot-stuffing per RFC 5321 4.5.2
    .replace(/\r\n\./g, "\r\n..");
}

export function sendMail(mail: MailInput): Promise<void> {
  const message = buildMessage(mail);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: mail.host, port: mail.port });
    socket.setTimeout(4000);
    let buffer = "";
    // One MAIL FROM, one RCPT TO per envelope recipient (To and, if set, Cc),
    // one DATA: a single transaction, so Mailpit records one message.
    const steps: { send: string | null; expect: number[] }[] = [
      { send: null, expect: [220] }, // greeting
      { send: `HELO clauselens-demo.localhost`, expect: [250] },
      { send: `MAIL FROM:<${mail.from.email}>`, expect: [250] },
      ...envelopeRecipients(mail).map((email) => ({
        send: `RCPT TO:<${email}>`,
        expect: [250, 251],
      })),
      { send: "DATA", expect: [354] },
      { send: `${message}\r\n.`, expect: [250] },
      { send: "QUIT", expect: [221] },
    ];
    let step = 0;

    const fail = (err: Error): void => {
      socket.destroy();
      reject(err);
    };
    socket.on("timeout", () => fail(new Error("SMTP timeout (is Mailpit running?)")));
    socket.on("error", (e) => fail(new Error(`SMTP connection failed: ${e.message}`)));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      // Process complete lines; multiline replies end with "NNN " prefix.
      while (true) {
        const idx = buffer.indexOf("\r\n");
        if (idx === -1) return;
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (/^\d{3}-/.test(line)) continue; // continuation line of a multiline reply
        try {
          expectCode(line, steps[step]!.expect);
        } catch (e) {
          return fail(e as Error);
        }
        step += 1;
        if (step >= steps.length) {
          socket.end();
          return resolve();
        }
        const next = steps[step]!;
        if (next.send !== null) socket.write(`${next.send}\r\n`);
      }
    });
    // Kick off: the server speaks first (220 greeting); the loop takes it from there.
  });
}
