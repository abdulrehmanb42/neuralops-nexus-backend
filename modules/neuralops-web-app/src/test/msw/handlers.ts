import type { RequestHandler } from "msw";

// Shared API mocks; per-test overrides go through server.use().
export const handlers: RequestHandler[] = [];
