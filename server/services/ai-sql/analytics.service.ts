/**
 * AI analytics (AI Insights + AI Dashboard): the service layer.
 *
 * The ONE query path: a single guard, a single executor and a single
 * semaphore, so a second AI surface can't grow its own set of limits to get
 * wrong. Ported from SMEEP's ai-analytics.service.ts, without the fallback to
 * the app's own connection: AI_READONLY_DATABASE_URL is required.
 */

import { AppError } from "../../utils/app-error";
import { executeAiSql, type SqlExecuteResult } from "./execute";
import { isAiReadonlyConfigured, notConfiguredError } from "./readonly-pool";
import { buildSqlCatalog, catalogViewNames, isAiSchemaInstalled, type SqlCatalog } from "./schema-catalog";

// A burst of chat or dashboard traffic queues rather than starving the pool.
// Beyond the queue depth a request is shed: an answer that won't come for a
// minute is worse than one that says "try again".
const EXECUTE_CONCURRENCY = 4;
const MAX_QUEUE_DEPTH = 25;

let activeSlots = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeSlots < EXECUTE_CONCURRENCY) {
    activeSlots += 1;
    return Promise.resolve();
  }
  if (queue.length >= MAX_QUEUE_DEPTH) {
    return Promise.reject(new AppError("The analytics service is busy. Try again in a moment.", 503, "AI_ANALYTICS_BUSY"));
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      activeSlots += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeSlots -= 1;
  queue.shift()?.();
}

export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

/**
 * 503 rather than every query failing: first when the read-only role isn't
 * configured here, then when the `ai` views are missing (the ai_views
 * migration hasn't run on this database).
 */
export async function assertAiAnalyticsReady(): Promise<void> {
  if (!isAiReadonlyConfigured()) throw notConfiguredError();
  if (!(await isAiSchemaInstalled())) {
    throw new AppError(
      "The AI analytics reporting views have not been installed on this database yet.",
      503,
      "AI_ANALYTICS_NOT_INSTALLED",
    );
  }
}

/** The sql-1.x catalogue both potential-ai graphs plan against. */
export async function getCatalog(): Promise<SqlCatalog> {
  await assertAiAnalyticsReady();
  return buildSqlCatalog();
}

/** Guards and runs one generated SELECT against the `ai` schema. */
export async function runQuery(rawSql: string): Promise<SqlExecuteResult> {
  await assertAiAnalyticsReady();
  return withSlot(() => executeAiSql(rawSql, catalogViewNames()));
}
