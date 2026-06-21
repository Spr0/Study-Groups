// =============================================================================
// Human-in-the-loop approval block (an internal approval, not a legal signature).
// =============================================================================
import type { ApprovalConfig } from "./types";
import { markdownToPlainText } from "./markdown";

/** The single approval line, e.g. "Reviewed and approved by: Pat Morgan · drafted with AI assistance". */
export function buildApprovalLine(approval: ApprovalConfig, name: string): string {
  return `${approval.label}: ${name.trim()} · ${approval.provenanceNote}`;
}

/**
 * The clean plain-text document the reviewer copies out: the draft body (markdown
 * stripped) followed by the approval line when the draft has been approved.
 */
export function buildCopyText(
  draftMarkdown: string,
  approval: ApprovalConfig,
  approvedName: string | null,
): string {
  const body = markdownToPlainText(draftMarkdown);
  if (!approvedName) return body;
  return `${body}\n\n${buildApprovalLine(approval, approvedName)}`;
}
