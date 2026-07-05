/* eslint-disable no-console -- CLI script; the one-line-per-detection log is the interface */
// =============================================================================
// Watched-folder trigger for the agent beat (local demo only).
//
// Watches a folder the facilitator controls. When a .pdf or .txt lands, waits
// for the write to settle, extracts the text locally, and POSTs it to the
// running app's env-gated /api/demo/ingest, which runs the existing review
// pipeline and sends the existing sign-off request email. Everything
// downstream (sign-off click, reviewed summary, signatory email) is the
// unchanged chain: the reviewer's click remains the signature.
//
// Scoped inputs, literally: this process acts only on files in this one
// folder. Processed files move to processed/ so a file is handled exactly
// once. Other file types are ignored silently. The watcher sends no email
// itself; it can only call the local gated function, so the Mailpit-only,
// .test-only guarantees hold by construction.
//
// Usage: node agent-demo/watch-folder.mjs   (netlify dev + Mailpit must be up)
//   DEMO_WATCH_DIR overrides the folder (default: agent-demo/drop)
//   DEMO_APP_URL overrides the app (default: http://localhost:8888)
// =============================================================================
import { mkdirSync, readdirSync, renameSync, statSync, readFileSync, watch } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WATCH_DIR = process.env.DEMO_WATCH_DIR ?? join(here, "drop");
const PROCESSED_DIR = join(WATCH_DIR, "processed");
const APP = process.env.DEMO_APP_URL ?? "http://localhost:8888";
const SETTLE_MS = 500; // size must be stable this long before we read
const SETTLE_MAX_MS = 15_000;

mkdirSync(PROCESSED_DIR, { recursive: true });

const health = await fetch(`${APP}/api/demo/health`).catch(() => null);
if (!health?.ok) {
  console.error(`[watch] demo agent not up at ${APP}. Start 'DEMO_AGENT=1 netlify dev' first.`);
  process.exit(1);
}

console.log(`[watch] watching ${WATCH_DIR} (drop a .pdf or .txt contract here)`);

const inFlight = new Set();

function accepted(name) {
  if (name.startsWith(".")) return false;
  const ext = extname(name).toLowerCase();
  return ext === ".pdf" || ext === ".txt";
}

async function settle(path) {
  const t0 = Date.now();
  let last = -1;
  let stableSince = Date.now();
  while (Date.now() - t0 < SETTLE_MAX_MS) {
    let size;
    try {
      size = statSync(path).size;
    } catch {
      return false; // vanished mid-write
    }
    if (size !== last) {
      last = size;
      stableSince = Date.now();
    } else if (size > 0 && Date.now() - stableSince >= SETTLE_MS) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return last > 0; // give a slow writer the benefit of the doubt after the cap
}

async function extractText(path) {
  if (extname(path).toLowerCase() === ".txt") {
    return readFileSync(path, "utf-8").trim();
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // verbosity 0 = errors only: keeps the facilitator log to one line per file.
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), verbosity: 0 }).promise;
  let text = "";
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str ?? "").join(" ") + "\n";
    }
  } finally {
    void doc.destroy();
  }
  return text.trim();
}

async function process1(name) {
  if (inFlight.has(name)) return;
  inFlight.add(name);
  const path = join(WATCH_DIR, name);
  try {
    if (!(await settle(path))) {
      console.error(`[watch] ${name}: file never settled or vanished; skipped`);
      return;
    }
    const contractText = await extractText(path);
    if (!contractText) {
      console.error(`[watch] ${name}: no readable text (scanned PDF?); skipped`);
    } else {
      const res = await fetch(`${APP}/api/demo/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: name, contractText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        console.log(`[watch] ${name} -> sign-off request sent to the reviewer (${data.mode})`);
      } else {
        console.error(`[watch] ${name}: ${data.error ?? `ingest failed (${res.status})`}`);
      }
    }
    // Exactly-once: move out of the watched folder regardless of outcome, so
    // a bad file cannot loop. Re-dropping a file later is a fresh, wanted run.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(path, join(PROCESSED_DIR, `${stamp}-${basename(name)}`));
  } catch (err) {
    console.error(`[watch] ${name}: ${err instanceof Error ? err.message : "failed"}`);
  } finally {
    inFlight.delete(name);
  }
}

// Files already sitting in the folder count as dropped (the folder is drained
// to processed/ after every run, so this is safe across restarts).
for (const name of readdirSync(WATCH_DIR)) {
  if (accepted(name) && statSync(join(WATCH_DIR, name)).isFile()) void process1(name);
}

watch(WATCH_DIR, (_event, name) => {
  if (!name || !accepted(name)) return;
  try {
    if (!statSync(join(WATCH_DIR, name)).isFile()) return;
  } catch {
    return; // rename-away or delete event
  }
  void process1(name);
});
