// =============================================================================
// Shared client/server protocol constants.
// =============================================================================

/** Emitted into the text stream if the model fails after streaming has begun. */
export const STREAM_ERROR_MARKER = "__STREAM_ERROR__";

/** Response header marking a live model draft (vs a JSON saved-example fallback). */
export const DRAFT_SOURCE_HEADER = "x-draft-source";

/** Default endpoint the client posts to and the function serves. */
export const DRAFT_ENDPOINT = "/api/draft";
