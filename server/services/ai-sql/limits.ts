/**
 * AI analytics — shared numeric limits.
 *
 * Its own file so the executor and the schema catalogue (which advertises
 * `limits` to the model) import one definition rather than two that can drift.
 */

/** Rows returned to the caller, and therefore to the model. */
export const MAX_ROWS = 500;

/** Hard ceiling on a single generated query, enforced per transaction too. */
export const AI_STATEMENT_TIMEOUT_MS = 15_000;

/** Enforced upstream by the AI service; advertised here so the model can plan a turn. */
export const MAX_QUERIES_PER_TURN = 5;

/** Longest SQL statement the guard will parse. */
export const MAX_SQL_LENGTH = 20_000;
