// =============================================================================
// Use-case resolution and validation helpers (pure, shared by client + server).
// =============================================================================
import type { Instance, PromptInput, ProjectMeta, UseCase } from "./types";

/** Thrown when a use case is misconfigured. Surfaced loudly at startup/tests. */
export class UseCaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UseCaseConfigError";
  }
}

/** Validate a use case's shape. Fails loud so config bugs are caught in dev/CI. */
export function validateUseCase(uc: UseCase): void {
  const require = (cond: boolean, msg: string): void => {
    if (!cond) throw new UseCaseConfigError(`Use case "${uc.id ?? "?"}": ${msg}`);
  };
  require(Boolean(uc.id), "missing id");
  require(Boolean(uc.label), "missing label");
  require(Boolean(uc.outputType), "missing outputType");
  require(Boolean(uc.systemPrompt), "missing systemPrompt");
  require(typeof uc.buildPrompt === "function", "buildPrompt must be a function");
  require(Array.isArray(uc.instances) && uc.instances.length > 0, "needs at least one instance");
  require(Array.isArray(uc.reviewChecklist) && uc.reviewChecklist.length > 0, "needs a review checklist");
  require(Boolean(uc.approval?.label && uc.approval?.provenanceNote), "missing approval wording");
  require(Boolean(uc.standingLine), "missing standingLine");
  require(Boolean(uc.freeTextFallback), "missing freeTextFallback");

  const ids = new Set<string>();
  for (const inst of uc.instances) {
    require(Boolean(inst.id), "an instance is missing its id");
    require(!ids.has(inst.id), `duplicate instance id "${inst.id}"`);
    ids.add(inst.id);
    require(Boolean(inst.label), `instance "${inst.id}" missing label`);
    require(inst.documents.length > 0, `instance "${inst.id}" has no documents`);
    require(Boolean(inst.fallbackDraft), `instance "${inst.id}" missing fallbackDraft`);
  }
}

/** Find an instance by id, or undefined. */
export function findInstance(uc: UseCase, instanceId: string | undefined): Instance | undefined {
  if (!instanceId) return undefined;
  return uc.instances.find((i) => i.id === instanceId);
}

/** What a single run resolves to: the prompt input and the right fallback draft. */
export interface ResolvedCase {
  promptInput: PromptInput;
  fallbackDraft: string;
  isFreeText: boolean;
}

/**
 * Resolve a run from either an instance id or free text. Returns null if an
 * instance id was given but not found.
 */
export function resolveCase(
  uc: UseCase,
  opts: { instanceId?: string; freeText?: string },
): ResolvedCase | null {
  const project: ProjectMeta = uc.project;
  const freeText = opts.freeText?.trim();
  if (freeText) {
    return {
      promptInput: { freeText, project },
      fallbackDraft: uc.freeTextFallback,
      isFreeText: true,
    };
  }
  const instance = findInstance(uc, opts.instanceId);
  if (!instance) return null;
  return {
    promptInput: { instance, project },
    fallbackDraft: instance.fallbackDraft,
    isFreeText: false,
  };
}
