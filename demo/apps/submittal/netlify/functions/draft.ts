// =============================================================================
// Submittal app - draft function. Thin wiring: the shared handler factory from
// @sg/core/server, configured with this app's use case(s). The Anthropic key is
// read from the server environment only and never reaches the browser.
// =============================================================================
import type { Config, Context } from "@netlify/functions";
import { createDraftHandler } from "@sg/core/server";
import { submittalReview } from "@sg/sample-data";

const handler = createDraftHandler({ useCases: [submittalReview] });

export default async (req: Request, _context: Context): Promise<Response> => handler(req);

export const config: Config = {
  path: "/api/draft",
};
