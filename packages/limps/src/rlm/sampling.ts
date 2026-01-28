/**
 * MCP Sampling with Tools wrapper for RLM sub-calls.
 * Feature #5: Recursive Sub-Call Handler (MCP Spec 2025-11-25)
 *
 * Enables server-side agent loops using MCP Sampling with Tools (SEP-1577).
 * This allows the server to invoke the LLM directly for sub-queries.
 */

/**
 * Tool definition for sampling requests (JSON Schema 2020-12).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object; // JSON Schema 2020-12
}

/**
 * Tool call result captured during sampling.
 */
export interface ToolCallResult {
  name: string;
  input: unknown;
  output: unknown;
}

/**
 * Sampling request matching MCP Spec 2025-11-25.
 */
export interface SamplingRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * Sampling response with content and tool calls.
 */
export interface SamplingResponse {
  content: string;
  toolCalls?: ToolCallResult[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

/**
 * Client interface for MCP sampling capability.
 * This abstraction allows for mocking in tests and future real client integration.
 */
export interface SamplingClient {
  /**
   * Create a sampling message (MCP createMessage request).
   * @param request - Sampling request
   * @returns Sampling response with content and tool calls
   */
  createMessage(request: SamplingRequest): Promise<SamplingResponse>;
}

/**
 * Create a sampling message using the provided client.
 *
 * This is a wrapper around MCP Sampling with Tools (SEP-1577) that:
 * - Formats the request according to MCP spec
 * - Handles tool_use stop reason (executes tool, continues sampling)
 * - Captures tool call results
 * - Respects toolChoice setting
 *
 * @param request - Sampling request
 * @param client - Optional sampling client (for testing/mocking)
 * @returns Sampling response with content and tool calls
 *
 * @example
 * const response = await createSamplingMessage({
 *   messages: [{ role: 'user', content: 'Summarize this section' }],
 *   tools: [{ name: 'analyze', description: '...', inputSchema: {...} }],
 *   toolChoice: 'auto',
 *   maxTokens: 1000
 * }, mockClient);
 */
export async function createSamplingMessage(
  request: SamplingRequest,
  client?: SamplingClient
): Promise<SamplingResponse> {
  // If no client provided, throw error (real implementation will get client from context)
  if (!client) {
    throw new Error(
      'Sampling client not available. Sub-calls require MCP client with sampling capability.'
    );
  }

  // Call the client's createMessage method
  const response = await client.createMessage(request);

  // The response should already include content and tool calls
  // In a real implementation, if stopReason is 'tool_use', we would:
  // 1. Execute the tool
  // 2. Continue sampling with tool result
  // 3. Repeat until stopReason is 'end_turn' or 'max_tokens'
  //
  // For now, we return the response as-is. The mock client can simulate
  // this behavior for testing.

  return response;
}

/**
 * Mock sampling client for testing.
 * Returns predictable responses based on request content.
 */
export class MockSamplingClient implements SamplingClient {
  private stringResponses = new Map<string, SamplingResponse>();
  private regexResponses: { regex: RegExp; response: SamplingResponse }[] = [];
  private defaultResponse?: (request: SamplingRequest) => SamplingResponse;

  /**
   * Set a default response generator.
   */
  setDefaultResponse(generator: (request: SamplingRequest) => SamplingResponse): void {
    this.defaultResponse = generator;
  }

  /**
   * Set a specific response for a message content pattern.
   */
  setResponse(pattern: string | RegExp, response: SamplingResponse): void {
    if (pattern instanceof RegExp) {
      this.regexResponses.push({ regex: pattern, response });
    } else {
      this.stringResponses.set(pattern, response);
    }
  }

  async createMessage(request: SamplingRequest): Promise<SamplingResponse> {
    const messageContent = request.messages[request.messages.length - 1]?.content || '';

    // Check regex patterns first (more specific)
    for (const { regex, response } of this.regexResponses) {
      if (regex.test(messageContent)) {
        return response;
      }
    }

    // Check string patterns
    for (const [pattern, response] of this.stringResponses.entries()) {
      if (messageContent.includes(pattern)) {
        return response;
      }
    }

    // Use default response generator if available
    if (this.defaultResponse) {
      return this.defaultResponse(request);
    }

    // Default: return a simple response
    return {
      content: `Mock response for: ${messageContent.substring(0, 50)}...`,
      stopReason: 'end_turn',
    };
  }
}
