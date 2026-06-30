// =============================================================================
// @sg/core - public client-safe API. This entry never imports the server module
// (and therefore never pulls the Anthropic SDK into the browser bundle).
// =============================================================================
export type {
  ProjectMeta,
  SourceDoc,
  Instance,
  PromptInput,
  ApprovalConfig,
  UseCase,
  DraftRequestBody,
} from "./types";

export { UseCaseConfigError, validateUseCase, findInstance, resolveCase } from "./use-case";
export type { ResolvedCase } from "./use-case";

export { normalizeDashes, escapeHtml, renderMarkdown, markdownToPlainText } from "./markdown";
export { buildApprovalLine, buildCopyText } from "./approval";
export type { Approver } from "./approval";
export { ROI_CONFIG, ROI_HEADLINE, roundToHundred, computeRoi } from "./roi";
export type { RoiAppKey, RoiConfig, RoiInputs, RoiResult } from "./roi";
export { fetchDraft } from "./client";
export type { DraftResult } from "./client";
export { STREAM_ERROR_MARKER, DRAFT_SOURCE_HEADER, DRAFT_ENDPOINT } from "./protocol";

export { createReviewApp } from "./review-app";
export type { ReviewAppOptions } from "./review-app";
