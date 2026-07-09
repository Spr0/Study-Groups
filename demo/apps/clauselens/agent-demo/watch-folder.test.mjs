import { describe, it, expect } from "vitest";
import { join } from "node:path";
// Importing the watcher has no side effects: the execution guard keeps main()
// (health probe, mkdir, fs.watch) from running unless the file is invoked
// directly. Only the pure naming helpers are exercised here.
import { nextProcessedPath, processedStamp } from "./watch-folder.mjs";

describe("watcher Processed-file naming (idempotency guard; never overwrite)", () => {
  const dir = "/watch/Processed";
  const name = "cascade-ridge-subcontract.pdf";
  const now = new Date("2026-07-09T14:32:05.123Z");

  it("keeps the original filename when nothing is there", () => {
    expect(nextProcessedPath(dir, name, () => false, now)).toBe(
      join(dir, "cascade-ridge-subcontract.pdf"),
    );
  });

  it("inserts a minute-precision timestamp before the extension on collision", () => {
    const taken = new Set([join(dir, "cascade-ridge-subcontract.pdf")]);
    expect(nextProcessedPath(dir, name, (p) => taken.has(p), now)).toBe(
      join(dir, "cascade-ridge-subcontract.2026-07-09T1432.pdf"),
    );
  });

  it("bumps a counter rather than overwrite when the timestamped name is also taken", () => {
    const taken = new Set([
      join(dir, "cascade-ridge-subcontract.pdf"),
      join(dir, "cascade-ridge-subcontract.2026-07-09T1432.pdf"),
    ]);
    expect(nextProcessedPath(dir, name, (p) => taken.has(p), now)).toBe(
      join(dir, "cascade-ridge-subcontract.2026-07-09T1432-1.pdf"),
    );
  });

  it("never returns a path the exists-check reports present", () => {
    // Everything is taken except the second counter bump: it must land there.
    const free = join(dir, "cascade-ridge-subcontract.2026-07-09T1432-2.pdf");
    const exists = (p) => p !== free;
    expect(nextProcessedPath(dir, name, exists, now)).toBe(free);
  });

  it("stamps as YYYY-MM-DDTHHMM", () => {
    expect(processedStamp(now)).toBe("2026-07-09T1432");
  });
});
