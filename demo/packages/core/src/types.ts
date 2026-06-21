// =============================================================================
// @sg/core - the contract between the shared review engine and each use case.
// The core knows nothing specific about RFIs or submittals. A use case is data
// plus a few pure functions implementing this contract.
// =============================================================================

/** Shared project metadata. One fictional project sits behind every use case. */
export interface ProjectMeta {
  name: string;
  gc: string;
  location: string;
  /** Optional continuity facts shared across use cases. */
  descriptor?: string;
  architect?: string;
  engineer?: string;
  reviewer?: string;
}

/** A baked source document shown in panel 1 and fed into the prompt. */
export interface SourceDoc {
  id?: string;
  title: string;
  body: string;
  /** Optional category, e.g. "spec" | "submitted", used by a use case's prompt builder. */
  kind?: string;
}

/** A canned dropdown option for a use case. */
export interface Instance {
  id: string;
  /** Dropdown text. */
  label: string;
  /** Documents shown in panel 1 and injected into the prompt. */
  documents: SourceDoc[];
  /** Vetted, offline-safe output used when the model call is unavailable. */
  fallbackDraft: string;
}

/** Input to a use case's pure prompt builder. */
export interface PromptInput {
  /** A canned instance, or... */
  instance?: Instance;
  /** ...the free-typed "encore" text. */
  freeText?: string;
  project: ProjectMeta;
}

/** Human-in-the-loop approval wording for a use case. */
export interface ApprovalConfig {
  /** e.g. "Reviewed and approved by" */
  label: string;
  /** e.g. "drafted with AI assistance" */
  provenanceNote: string;
}

/**
 * The contract every use case implements. No use case touches core internals;
 * the core consumes only this shape.
 */
export interface UseCase {
  id: string;
  /** Human label, e.g. "Submittal review". */
  label: string;
  /** Output noun, e.g. "Submittal review". */
  outputType: string;
  project: ProjectMeta;
  instances: Instance[];
  /** Careful-reviewer system instructions for the model. */
  systemPrompt: string;
  /** Pure, testable: assemble the exact prompt sent to (and shown for) the model. */
  buildPrompt: (input: PromptInput) => string;
  /** The human-in-the-loop gate items. */
  reviewChecklist: string[];
  approval: ApprovalConfig;
  /** The standing line shown under the output the whole time. */
  standingLine: string;
  /** Generic offline-safe output for the free-typed encore. */
  freeTextFallback: string;

  // ---- Optional UI polish (the engine supplies sensible defaults) ----
  /** Run-button text, e.g. "Draft the review". */
  runLabel?: string;
  /** Placeholder for the free-type encore box. */
  freeTextPlaceholder?: string;
  /** Noun for "What we are reviewing" style labels, e.g. "submission". */
  inputNoun?: string;
}

/** Wire payload from client to the serverless function. */
export interface DraftRequestBody {
  useCaseId: string;
  instanceId?: string;
  freeText?: string;
}
