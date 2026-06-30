// =============================================================================
// @sg/core - ROI module. Pure functions + per-app config + copy. Framework
// agnostic, so every app (vanilla, Vite, or React) consumes the same numbers and
// the same headline. This is the single source of truth ported from the verified
// ClauseLens calculator; ClauseLens conforms to it.
//
// "A tool you build pays every time the task comes up." The kit score is value x
// frequency; the operational return is time saved per run compounded by how often
// the task recurs.
// =============================================================================

export type RoiAppKey = "clauselens" | "rfi" | "submittal";

export interface RoiConfig {
  /** Kit-score value tier (1 to 5). */
  value: number;
  /** Kit-score frequency tier (1 to 5). */
  frequency: number;
  /** Rank label, e.g. "Ranked 1". */
  rank: string;
  /** Minutes the task takes without the tool. */
  minutesWithout: number;
  /** Minutes the task takes with the tool. */
  minutesWith: number;
  /** Qualitative note shown beside the optional dollars-at-risk input. */
  risk: string;
}

// Per-app config is the ONLY thing that differs between the three apps.
export const ROI_CONFIG: Record<RoiAppKey, RoiConfig> = {
  clauselens: {
    value: 5,
    frequency: 3,
    rank: "Ranked 1",
    minutesWithout: 30,
    minutesWith: 10,
    risk: "A missed cap can be catastrophic.",
  },
  rfi: {
    value: 2,
    frequency: 4,
    rank: "Ranked 3",
    minutesWithout: 20,
    minutesWith: 8,
    risk: "Lower stakes per run.",
  },
  submittal: {
    value: 3,
    frequency: 4,
    rank: "Ranked 2",
    minutesWithout: 25,
    minutesWith: 10,
    risk: "Moderate stakes per run.",
  },
};

// Always shown, verbatim.
export const ROI_HEADLINE =
  "A tool you build pays every time the task comes up. Frequency is the multiplier; the return compounds for as long as the tool runs.";

export interface RoiInputs {
  runsPerMonth: number;
  loadedHourlyRate: number;
  /** Optional dollars at risk per run; the risk term only counts when provided. */
  riskPerRun?: number;
}

export interface RoiResult {
  score: number;
  rank: string;
  timeSavedPerRun: number; // minutes
  annualHours: number;
  annualDollars: number;
}

/** Round to the nearest hundred dollars. */
export function roundToHundred(n: number): number {
  return Math.round(n / 100) * 100;
}

/**
 * The fixed operational ROI formula. Inputs are numbers; the UI is responsible
 * for coercing empty fields and deciding what to show before they are entered
 * (never invent a rate or a runs-per-month figure).
 */
export function computeRoi(appKey: RoiAppKey, inputs: RoiInputs): RoiResult {
  const cfg = ROI_CONFIG[appKey];
  const score = cfg.value * cfg.frequency;
  const timeSavedPerRun = cfg.minutesWithout - cfg.minutesWith;
  const annualHours = (timeSavedPerRun * inputs.runsPerMonth * 12) / 60;
  const riskTerm = inputs.riskPerRun ? inputs.riskPerRun * inputs.runsPerMonth * 12 : 0;
  const annualDollars = roundToHundred(annualHours * inputs.loadedHourlyRate + riskTerm);
  return { score, rank: cfg.rank, timeSavedPerRun, annualHours, annualDollars };
}
