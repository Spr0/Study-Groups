import { describe, it, expect } from "vitest";
import { computeRoi, roundToHundred, ROI_CONFIG } from "./roi";

describe("roundToHundred", () => {
  it("rounds to the nearest hundred", () => {
    expect(roundToHundred(12049)).toBe(12000);
    expect(roundToHundred(12050)).toBe(12100);
    expect(roundToHundred(0)).toBe(0);
  });
});

describe("computeRoi", () => {
  it("derives the kit score and rank from per-app config", () => {
    expect(computeRoi("clauselens", { runsPerMonth: 1, loadedHourlyRate: 0 })).toMatchObject({
      score: 15, // 5 x 3
      rank: "Ranked 1",
    });
    expect(computeRoi("rfi", { runsPerMonth: 1, loadedHourlyRate: 0 })).toMatchObject({
      score: 8, // 2 x 4
      rank: "Ranked 3",
    });
    expect(computeRoi("submittal", { runsPerMonth: 1, loadedHourlyRate: 0 })).toMatchObject({
      score: 12, // 3 x 4
      rank: "Ranked 2",
    });
  });

  it("matches the ClauseLens regression anchor ($12k base, $132k with risk)", () => {
    const base = computeRoi("clauselens", { runsPerMonth: 20, loadedHourlyRate: 150 });
    expect(base.timeSavedPerRun).toBe(20); // 30 - 10
    expect(base.annualHours).toBe(80); // 20 * 20 * 12 / 60
    expect(base.annualDollars).toBe(12000); // 80 * 150

    const withRisk = computeRoi("clauselens", {
      runsPerMonth: 20,
      loadedHourlyRate: 150,
      riskPerRun: 500,
    });
    // 12000 + (500 * 20 * 12) = 132000
    expect(withRisk.annualDollars).toBe(132000);
  });

  it("only counts the risk term when riskPerRun is provided", () => {
    const noRisk = computeRoi("submittal", { runsPerMonth: 10, loadedHourlyRate: 120 });
    const withRisk = computeRoi("submittal", {
      runsPerMonth: 10,
      loadedHourlyRate: 120,
      riskPerRun: 0,
    });
    expect(noRisk.annualDollars).toBe(withRisk.annualDollars);
  });

  it("rounds annual dollars to the nearest hundred", () => {
    // rfi: 20 - 8 = 12 min; 12 * 7 * 12 / 60 = 16.8 hrs; 16.8 * 137 = 2301.6 -> 2300
    const r = computeRoi("rfi", { runsPerMonth: 7, loadedHourlyRate: 137 });
    expect(r.timeSavedPerRun).toBe(12);
    expect(r.annualDollars).toBe(2300);
  });

  it("exposes a config row for every app key", () => {
    expect(Object.keys(ROI_CONFIG).sort()).toEqual(["clauselens", "rfi", "submittal"]);
  });
});
