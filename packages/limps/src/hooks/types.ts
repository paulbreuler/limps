/**
 * Types for the limps filesystem-based event hooks system.
 *
 * Hooks are standalone .mjs files that export a default async function.
 * They are loaded from `hooksPath` (default ~/.limps/hooks/) and run in
 * response to lifecycle events with a 5-second timeout.
 *
 * Hook file naming:
 *   - {hooksPath}/{event}.mjs          e.g. plan:created.mjs
 *   - {hooksPath}/{event}/index.mjs    e.g. plan:created/index.mjs
 */

/**
 * All supported hook event names.
 */
export type HookEvent =
  | 'server:startup'
  | 'server:shutdown'
  | 'plan:created'
  | 'plan:deleted'
  | 'agent:status-changed'
  | 'doc:indexed'
  | 'doc:created'
  | 'doc:updated'
  | 'doc:deleted';

/**
 * Payload passed to hook functions.
 * The shape varies by event; hooks should use optional chaining.
 */
export interface HookPayload {
  event: HookEvent;
  timestamp: string; // ISO 8601
  data: Record<string, unknown>;
}

/**
 * Hook function signature.
 * The default export of a hook file must match this.
 */
export type HookFn = (payload: HookPayload) => Promise<void> | void;
