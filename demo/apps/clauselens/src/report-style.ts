// =============================================================================
// Presentation-layer classification for the review report (ticket: style for
// projection). Pure functions applied AT RENDER TIME to whatever ClauseResult
// is on screen, so the live review and the vetted fallback cannot diverge:
// there is no styled copy of the data to drift.
//
// Nothing here touches the model prompt or the report data structure. Statuses
// remain Found / Not Found exactly.
// =============================================================================
import { normalizeDashes } from "@sg/core";
import { STATUS_NOT_FOUND, type ClauseResult } from "@sg/sample-data";

export interface StyledRaiseItem {
  text: string;
  /** The item names a clause this review marked Not Found. */
  materialGap: boolean;
  /** The item describes a term that cuts one way. */
  oneSided: boolean;
}

/** A raise item is a material gap when it names a Not Found clause. */
export function isMaterialGapItem(item: string, result: ClauseResult): boolean {
  const lower = item.toLowerCase();
  return result.clauses.some(
    (c) => c.status === STATUS_NOT_FOUND && lower.includes(c.name.toLowerCase()),
  );
}

const ONE_SIDED =
  /\bone[ -]?(direction|sided|way)\b|\bfavors?\b|\bno reciprocal\b|\b(little|no) recourse\b|\bunilateral/i;

/** Flag terms that cut one way (indemnity direction, convenience clauses...). */
export function isOneSidedItem(item: string): boolean {
  return ONE_SIDED.test(item);
}

/**
 * Presentation order and flags: material gaps first (they are the headline),
 * original order preserved within each group.
 */
export function styleRaiseItems(result: ClauseResult): StyledRaiseItem[] {
  const items = result.raise.map((text) => ({
    text,
    materialGap: isMaterialGapItem(text, result),
    oneSided: isOneSidedItem(text),
  }));
  return [...items.filter((i) => i.materialGap), ...items.filter((i) => !i.materialGap)];
}

/**
 * Copy hygiene at the render boundary: every string that reaches the screen,
 * the export, or the print path goes through normalizeDashes. Same structure
 * out as in.
 */
export function normalizeResultCopy(result: ClauseResult): ClauseResult {
  return {
    clauses: result.clauses.map((c) => ({
      ...c,
      quote: normalizeDashes(c.quote),
      plain: normalizeDashes(c.plain),
    })),
    raise: result.raise.map(normalizeDashes),
  };
}
