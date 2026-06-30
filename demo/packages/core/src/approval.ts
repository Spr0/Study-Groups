// =============================================================================
// Human-in-the-loop approval block (an internal approval, not a legal signature).
// Canonical across all three apps: a named reviewer, their role, and the date,
// with an honest AI-provenance note. ClauseLens conforms to this copy.
// =============================================================================
import type { ApprovalConfig } from "./types";
import { markdownToPlainText } from "./markdown";

/** Who approved, captured at approval time. Held in memory only, never stored. */
export interface Approver {
  name: string;
  role: string;
  /** Human-readable date, e.g. "June 30, 2026". */
  date: string;
}

/**
 * The canonical approval line, exact:
 * "Reviewed and approved by {name}, {role}, on {date}. Drafted with AI assistance;
 *  approved by the named reviewer before issue."
 */
export function buildApprovalLine(approval: ApprovalConfig, approver: Approver): string {
  const name = approver.name.trim();
  const role = approver.role.trim();
  return `${approval.label} ${name}, ${role}, on ${approver.date}. Drafted with AI assistance; ${approval.provenanceNote}.`;
}

/**
 * The clean plain-text document the reviewer exports or copies: the draft body
 * (markdown stripped) followed by the approval line once approved.
 */
export function buildCopyText(
  draftMarkdown: string,
  approval: ApprovalConfig,
  approved: Approver | null,
): string {
  const body = markdownToPlainText(draftMarkdown);
  if (!approved) return body;
  return `${body}\n\n${buildApprovalLine(approval, approved)}`;
}
