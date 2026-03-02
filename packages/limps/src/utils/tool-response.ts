/**
 * Helper utilities for building MCP tool response payloads with next_steps guidance.
 *
 * AI agents have to infer what tool to call next without this guidance.
 * Embedding next_steps directly in JSON responses reduces round-trips and
 * improves workflow coherence for agents using limps as an MCP server.
 */

import type { NextStep } from '../types.js';

/**
 * Merge next_steps into an arbitrary JSON payload.
 *
 * @param payload - The base data to return to the caller
 * @param steps - Ordered list of recommended next actions
 * @returns The payload with next_steps appended
 */
export function withNextSteps<T extends Record<string, unknown>>(
  payload: T,
  steps: NextStep[]
): T & { next_steps: NextStep[] } {
  return {
    ...payload,
    next_steps: steps,
  };
}

/**
 * Serialize a payload (with optional next_steps) to a JSON string.
 *
 * @param payload - The data to serialize
 * @param steps - Optional recommended next actions
 * @param prettyPrint - Whether to format with indentation
 * @returns JSON string
 */
export function toJsonText(
  payload: Record<string, unknown>,
  steps: NextStep[],
  prettyPrint = false
): string {
  const data = steps.length > 0 ? withNextSteps(payload, steps) : payload;
  return JSON.stringify(data, null, prettyPrint ? 2 : undefined);
}
