/**
 * yonote-mcp — AI-powered client for Yonote knowledge base management.
 */

import { YonoteClient } from './yonote-client.js';
import { AIAgent, translateTextViaAPI, translateHeading } from './ai-agent.js';
import { ToolExecutor } from './tool-executor.js';
import { EventBus } from './event-bus.js';
import {
    parseMarkdownBlocks,
    blocksToMarkdown,
    blocksToYonoteMarkdown,
    extractSectionFromText,
    isCodeLine,
    isUrlOnly,
    isHeadingCandidate,
} from './markdown-processor.js';

// Re-export all modules
export { YonoteClient } from './yonote-client.js';
export { AIAgent, translateTextViaAPI, translateHeading } from './ai-agent.js';
export { ToolExecutor } from './tool-executor.js';
export { EventBus } from './event-bus.js';
export {
    parseMarkdownBlocks,
    blocksToMarkdown,
    blocksToYonoteMarkdown,
    extractSectionFromText,
    isCodeLine,
    isUrlOnly,
    isHeadingCandidate,
} from './markdown-processor.js';

/**
 * Create a fully configured Yonote agent.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.yonoteToken - Yonote API token
 * @param {string} options.deepseekKey - DeepSeek API key
 * @param {string} [options.yonoteBaseUrl] - Yonote API base URL (default: https://app.yonote.ru/api)
 * @param {string} [options.proxyUrl] - CORS proxy URL for browser mode (null for Node.js)
 * @param {Object} [options.config] - Additional config (default_search_page_id, reports_page_id, tags_page_id)
 * @returns {Object} { yonote, agent, executor, eventBus }
 */
export function createYonoteAgent(options) {
    const {
        yonoteToken,
        deepseekKey,
        yonoteBaseUrl = 'https://app.yonote.ru/api',
        proxyUrl = null,
        config = {},
    } = options;

    const eventBus = new EventBus();
    const yonote = new YonoteClient(yonoteToken, yonoteBaseUrl, proxyUrl);
    const agent = new AIAgent(deepseekKey, 'deepseek-chat', config, proxyUrl);
    const executor = new ToolExecutor(yonote, agent, eventBus, config);

    return { yonote, agent, executor, eventBus };
}
