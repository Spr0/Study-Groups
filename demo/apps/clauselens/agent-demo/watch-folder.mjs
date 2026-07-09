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
// Processed-file convention (idempotency guard, made intentional):
//   - On SUCCESS, the file is MOVED into a "Processed" subfolder of the watch
//     dir, original filename unchanged, so each drop runs exactly once. If a
//     file of that name is already there, a minute-precision timestamp is
//     inserted before the extension (cascade-ridge-subcontract.2026-07-09T1432
//     .pdf), then a counter if needed. A file is NEVER overwritten.
//   - On FAILURE (never settled, no readable text, or ingest error), the file
//     is LEFT IN PLACE and the reason is logged, so the facilitator can see it
//     and re-drop. A watcher restart re-scans and retries it.
//   - The "Processed" subfolder is created if absent and excluded from the
//     watch loop.
//
// Scoped inputs, literally: this process acts only on files in this one
// folder. The watcher sends no email itself; it can only call the local gated
// function, so the Mailpit-only, .test-only guarantees hold by construction.
//
// Usage: node agent-demo/watch-folder.mjs   (netlify dev + Mailpit must be up)
//   DEMO_WATCH_DIR overrides the folder (default: agent-demo/drop)
//   DEMO_APP_URL overrides the app (default: http://localhost:8888)
// =============================================================================
import { mkdirSync, readdirSync, renameSync, statSync, readFileSync, existsSync, watch } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WATCH_DIR = process.env.DEMO_WATCH_DIR ?? join(here, "drop");
const PROCESSED_SUBDIR = "Processed";
const PROCESSED_DIR = join(WATCH_DIR, PROCESSED_SUBDIR);
const APP = process.env.DEMO_APP_URL ?? "http://localhost:8888";
const SETTLE_MS = 500; // size must be stable this long before we read
const SETTLE_MAX_MS = 15_000;

const inFlight = new Set();

function accepted(name) {
  if (name.startsWith(".")) return false;
  if (name === PROCESSED_SUBDIR) return false; // never re-process the archive
  const ext = extname(name).toLowerCase();
  return ext === ".pdf" || ext === ".txt";
}

// ---- Processed-file naming (pure; unit-tested in watch-folder.test.mjs) ------
// Minute-precision stamp: YYYY-MM-DDTHHMM, e.g. 2026-07-09T1432.
export function processedStamp(now = new Date()) {
  const iso = now.toISOString();
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

// Destination inside Processed/: the original name when free; otherwise the
// name with a timestamp inserted before the extension, then a -N counter if
// even that is taken. `exists` is injected so this is pure and testable. The
// returned path is guaranteed not to be reported present by `exists`: no file
// is ever overwritten.
export function nextProcessedPath(processedDir, name, exists, now = new Date()) {
  const original = join(processedDir, name);
  if (!exists(original)) return original;
  const ext = extname(name);
  const base = basename(name, ext);
  const stamp = processedStamp(now);
  let candidate = join(processedDir, `${base}.${stamp}${ext}`);
  for (let n = 1; exists(candidate); n++) {
    candidate = join(processedDir, `${base}.${stamp}-${n}${ext}`);
  }
  return candidate;
}

function moveToProcessed(name) {
  const dest = nextProcessedPath(PROCESSED_DIR, name, existsSync);
  renameSync(join(WATCH_DIR, name), dest);
  return dest;
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
      console.error(`[watch] ${name}: file never settled or vanished; left in place`);
      return; // FAILURE: do not move
    }
    const contractText = await extractText(path);
    if (!contractText) {
      console.error(`[watch] ${name}: no readable text (scanned PDF?); left in place`);
      return; // FAILURE: do not move
    }
    const res = await fetch(`${APP}/api/demo/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: name, contractText }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      // SUCCESS: archive into Processed/ so this drop runs exactly once. Keeps
      // the original name; a same-named prior file gets a timestamp, never an
      // overwrite. Re-dropping the file later is a deliberate fresh run.
      const dest = moveToProcessed(name);
      console.log(
        `[watch] ${name} -> sign-off request sent to the reviewer (${data.mode}); archived to ${PROCESSED_SUBDIR}/${basename(dest)}`,
      );
    } else {
      // FAILURE: leave the file in place for the facilitator to see and retry.
      console.error(`[watch] ${name}: ${data.error ?? `ingest failed (${res.status})`}; left in place`);
    }
  } catch (err) {
    console.error(`[watch] ${name}: ${err instanceof Error ? err.message : "failed"}; left in place`);
  } finally {
    inFlight.delete(name);
  }
}

async function main() {
  // Create the archive subfolder up front; it is excluded from the watch loop.
  mkdirSync(PROCESSED_DIR, { recursive: true });

  const health = await fetch(`${APP}/api/demo/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`[watch] demo agent not up at ${APP}. Start 'DEMO_AGENT=1 netlify dev' first.`);
    process.exit(1);
  }

  console.log(
    `[watch] watching ${WATCH_DIR} (drop a .pdf or .txt contract here; archives to ${PROCESSED_SUBDIR}/ on success)`,
  );

  // Files already sitting in the folder count as dropped. Failed files are left
  // in place, so this startup scan also retries anything a previous run could
  // not process.
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
}

// Run only when invoked directly (node agent-demo/watch-folder.mjs). Importing
// the module (e.g. from the unit test) has no side effects: no health probe, no
// filesystem writes, no watch.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`[watch] fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
