// =============================================================================
// @sg/sample-data - the shared Cascade Ridge / Lakeview MOB project and the
// per-use-case content. One fictional project behind every demo.
// =============================================================================
export { CASCADE_RIDGE } from "./project";
export { submittalReview, buildSubmittalPrompt } from "./submittal";
export { rfiDraft, buildRfiPrompt } from "./rfi";
export {
  FIVE_CLAUSES,
  NOT_FOUND,
  STATUS_FOUND,
  STATUS_NOT_FOUND,
  SAMPLE_CONTRACT_NAME,
  SAMPLE_CONTRACT_TEXT,
  SAMPLE_FALLBACK_RESULT,
  SAMPLE_EXPLAIN_FALLBACKS,
  REV_B_CONTRACT_NAME,
  REV_B_CONTRACT_TEXT,
  REV_B_FALLBACK_RESULT,
  REV_B_EXPLAIN_FALLBACKS,
  VETTED_CONTRACTS,
  vettedContractFor,
  CONTRACT_OPTIONS,
  EXTRACT_SYSTEM_PROMPT,
  EXPLAIN_SYSTEM_PROMPT,
  buildExtractPrompt,
  buildExplainPrompt,
  parseClauseResponse,
  isValidResult,
  foundCount,
  normalizeForFingerprint,
  fingerprintContract,
  isVettedContract,
  reviewContract,
} from "./clauses";
export type {
  Clause,
  ClauseResult,
  ContractOption,
  VettedContract,
  AnalyzeRequest,
  ExtractRequest,
  ExplainRequest,
  ReviewMode,
  ReviewOutcome,
} from "./clauses";
