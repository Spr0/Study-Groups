// =============================================================================
// RFI app - draft function. Thin wiring: the shared handler factory from
// @sg/core/server, configured with this app's use case. The Anthropic key is
// read from the server environment only and never reaches the browser. The model
// comes from ANTHROPIC_MODEL with no fallback (fails loudly if unset).
// =============================================================================
import type { Config, Context } from "@netlify/functions";
import { createDraftHandler } from "@sg/core/server";
import { rfiDraft } from "@sg/sample-data";

const handler = createDraftHandler({ useCases: [rfiDraft] });

export default async (req: Request, _context: Context): Promise<Response> => handler(req);

export const config: Config = {
  path: "/api/draft",
};
