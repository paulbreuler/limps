/**
 * Tests for MCP Sampling with Tools wrapper.
 * Test IDs: sub-sampling, sub-tools (part of)
 */

import { describe, it, expect } from 'vitest';
import {
  createSamplingMessage,
  MockSamplingClient,
  type SamplingRequest,
  type SamplingResponse,
  type ToolDefinition,
} from '../../src/rlm/sampling.js';

describe('sampling', () => {
  describe('createSamplingMessage', () => {
    it('should create sampling message with prompt', async () => {
      const mockClient = new MockSamplingClient();
      mockClient.setResponse('Summarize', {
        content: 'This is a summary.',
        stopReason: 'end_turn',
      });

      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Summarize this section' }],
      };

      const response = await createSamplingMessage(request, mockClient);

      expect(response.content).toBe('This is a summary.');
      expect(response.stopReason).toBe('end_turn');
    });

    it('should include tools when provided', async () => {
      const mockClient = new MockSamplingClient();
      const tools: ToolDefinition[] = [
        {
          name: 'analyze_section',
          description: 'Analyze a document section',
          inputSchema: {
            type: 'object',
            properties: { section: { type: 'string' } },
          },
        },
      ];

      let capturedRequest: SamplingRequest | undefined;
      mockClient.setDefaultResponse((req) => {
        capturedRequest = req;
        return {
          content: 'Analysis complete',
          stopReason: 'end_turn',
        };
      });

      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Analyze this' }],
        tools,
      };

      await createSamplingMessage(request, mockClient);

      expect(capturedRequest?.tools).toEqual(tools);
    });

    it('should handle tool_use stop reason', async () => {
      const mockClient = new MockSamplingClient();
      mockClient.setResponse('Use tool', {
        content: 'Tool result',
        toolCalls: [
          {
            name: 'analyze_section',
            input: { section: 'test' },
            output: { result: 'analyzed' },
          },
        ],
        stopReason: 'tool_use',
      });

      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Use tool to analyze' }],
        tools: [
          {
            name: 'analyze_section',
            description: 'Analyze section',
            inputSchema: { type: 'object' },
          },
        ],
      };

      const response = await createSamplingMessage(request, mockClient);

      expect(response.stopReason).toBe('tool_use');
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('analyze_section');
    });

    it('should respect toolChoice setting', async () => {
      const mockClient = new MockSamplingClient();
      let capturedRequest: SamplingRequest | undefined;
      mockClient.setDefaultResponse((req) => {
        capturedRequest = req;
        return {
          content: 'Response',
          stopReason: 'end_turn',
        };
      });

      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Test' }],
        toolChoice: { type: 'tool', name: 'specific_tool' },
      };

      await createSamplingMessage(request, mockClient);

      expect(capturedRequest?.toolChoice).toEqual({ type: 'tool', name: 'specific_tool' });
    });

    it('should return tool call results', async () => {
      const mockClient = new MockSamplingClient();
      const toolCalls: SamplingResponse['toolCalls'] = [
        {
          name: 'tool1',
          input: { param: 'value' },
          output: { result: 'output1' },
        },
        {
          name: 'tool2',
          input: { param: 'value2' },
          output: { result: 'output2' },
        },
      ];

      mockClient.setResponse('Multiple tools', {
        content: 'Done',
        toolCalls,
        stopReason: 'end_turn',
      });

      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Multiple tools needed' }],
      };

      const response = await createSamplingMessage(request, mockClient);

      expect(response.toolCalls).toEqual(toolCalls);
    });

    it('should throw error when client not provided', async () => {
      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Test' }],
      };

      await expect(createSamplingMessage(request)).rejects.toThrow('Sampling client not available');
    });

    it('should handle maxTokens setting', async () => {
      const mockClient = new MockSamplingClient();
      let capturedRequest: SamplingRequest | undefined;
      mockClient.setDefaultResponse((req) => {
        capturedRequest = req;
        return {
          content: 'Response',
          stopReason: 'max_tokens',
        };
      });

      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Test' }],
        maxTokens: 100,
      };

      const response = await createSamplingMessage(request, mockClient);

      expect(capturedRequest?.maxTokens).toBe(100);
      expect(response.stopReason).toBe('max_tokens');
    });

    it('should handle systemPrompt', async () => {
      const mockClient = new MockSamplingClient();
      let capturedRequest: SamplingRequest | undefined;
      mockClient.setDefaultResponse((req) => {
        capturedRequest = req;
        return {
          content: 'Response',
          stopReason: 'end_turn',
        };
      });

      const request: SamplingRequest = {
        messages: [{ role: 'user', content: 'Test' }],
        systemPrompt: 'You are a helpful assistant.',
      };

      await createSamplingMessage(request, mockClient);

      expect(capturedRequest?.systemPrompt).toBe('You are a helpful assistant.');
    });
  });

  describe('MockSamplingClient', () => {
    it('should use pattern matching for responses', async () => {
      const mockClient = new MockSamplingClient();
      mockClient.setResponse('pattern1', { content: 'Response 1', stopReason: 'end_turn' });
      mockClient.setResponse(/pattern2/i, { content: 'Response 2', stopReason: 'end_turn' });

      const response1 = await mockClient.createMessage({
        messages: [{ role: 'user', content: 'This contains pattern1' }],
      });
      expect(response1.content).toBe('Response 1');

      const response2 = await mockClient.createMessage({
        messages: [{ role: 'user', content: 'This contains PATTERN2' }],
      });
      expect(response2.content).toBe('Response 2');
    });

    it('should use default response generator', async () => {
      const mockClient = new MockSamplingClient();
      mockClient.setDefaultResponse((req) => ({
        content: `Custom: ${req.messages[0]?.content}`,
        stopReason: 'end_turn',
      }));

      const response = await mockClient.createMessage({
        messages: [{ role: 'user', content: 'Test message' }],
      });

      expect(response.content).toBe('Custom: Test message');
    });

    it('should fall back to default mock response', async () => {
      const mockClient = new MockSamplingClient();

      const response = await mockClient.createMessage({
        messages: [{ role: 'user', content: 'Unknown pattern' }],
      });

      expect(response.content).toContain('Mock response');
      expect(response.stopReason).toBe('end_turn');
    });
  });
});
