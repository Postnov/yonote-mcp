/**
 * Tests for ai-agent.js — port of AI agent tests from test_yonote_client.py
 */
import { describe, it, expect, vi } from 'vitest';
import { AIAgent } from '../src/ai-agent.js';

describe('AIAgent', () => {
    it('initializes correctly', () => {
        const agent = new AIAgent('test-key');
        expect(agent.apiKey).toBe('test-key');
        expect(agent.model).toBe('deepseek-chat');
        expect(agent.conversationHistory).toEqual([]);
    });

    it('resets conversation history', () => {
        const agent = new AIAgent('test-key');
        agent.conversationHistory = [{ role: 'user', content: 'hello' }];
        agent.reset();
        expect(agent.conversationHistory).toEqual([]);
    });

    it('parses valid JSON response', () => {
        const agent = new AIAgent('test-key');
        const result = agent._parseResponse('{"thinking": "test", "actions": [], "response_template": "ok"}');
        expect(result.thinking).toBe('test');
        expect(result.actions).toEqual([]);
        expect(result.response_template).toBe('ok');
    });

    it('parses JSON in code block', () => {
        const agent = new AIAgent('test-key');
        const result = agent._parseResponse('```json\n{"thinking": "t", "actions": [], "response_template": "r"}\n```');
        expect(result.thinking).toBe('t');
        expect(result.response_template).toBe('r');
    });

    it('handles plain text response', () => {
        const agent = new AIAgent('test-key');
        const result = agent._parseResponse('Just a plain text response');
        expect(result.actions).toEqual([]);
        expect(result.response_template).toBe('Just a plain text response');
    });

    it('adds context to conversation history', () => {
        const agent = new AIAgent('test-key');
        agent.addContext('user', 'test context');
        expect(agent.conversationHistory).toHaveLength(1);
        expect(agent.conversationHistory[0].content).toBe('test context');
    });

    it('parses response with pending_actions', () => {
        const agent = new AIAgent('test-key');
        const json = JSON.stringify({
            thinking: 'need to create doc',
            actions: [],
            pending_actions: [{ tool: 'create_document', params: { title: 'New' } }],
            response_template: 'Create document?',
        });
        const result = agent._parseResponse(json);
        expect(result.pending_actions).toHaveLength(1);
        expect(result.pending_actions[0].tool).toBe('create_document');
    });

    it('parses response with nested JSON', () => {
        const agent = new AIAgent('test-key');
        const json = JSON.stringify({
            thinking: 'need to search',
            actions: [{ tool: 'search', params: { query: 'test' } }],
            response_template: 'Found results',
        });
        const result = agent._parseResponse(json);
        expect(result.thinking).toBe('need to search');
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].tool).toBe('search');
    });

    it('handles malformed JSON gracefully', () => {
        const agent = new AIAgent('test-key');
        const result = agent._parseResponse('{invalid json}');
        expect(result.actions).toEqual([]);
        expect(result.response_template).toBeTruthy();
    });

    it('handles empty response', () => {
        const agent = new AIAgent('test-key');
        const result = agent._parseResponse('');
        expect(result.actions).toEqual([]);
    });

    it('processMessage calls API and parses response', async () => {
        const agent = new AIAgent('test-key');

        // Mock fetch
        const mockResponse = {
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            thinking: 'need to search',
                            actions: [{ tool: 'search', params: { query: 'test' } }],
                            response_template: 'Found results',
                        }),
                    },
                }],
            }),
        };
        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        const result = await agent.processMessage('find test documents');

        expect(result.thinking).toBe('need to search');
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].tool).toBe('search');
        expect(agent.conversationHistory).toHaveLength(2); // user + assistant

        // Cleanup
        delete global.fetch;
    });

    it('sends only last 10 messages to API (sliding window)', async () => {
        const agent = new AIAgent('test-key');
        // Fill history beyond the sliding window
        for (let i = 0; i < 25; i++) {
            agent.conversationHistory.push({ role: 'user', content: `msg ${i}` });
        }

        const mockResponse = {
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"thinking":"t","actions":[],"response_template":"ok"}' } }],
            }),
        };
        global.fetch = vi.fn().mockResolvedValue(mockResponse);

        await agent.processMessage('new message');

        // Check that the API was called with limited history (slice(-10))
        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);
        // Direct mode: messages are at top level
        const messagesCount = requestBody.messages.length;
        // System prompt (1) + last 10 history items + 1 new user = 12
        expect(messagesCount).toBeLessThanOrEqual(12);

        delete global.fetch;
    });
});
