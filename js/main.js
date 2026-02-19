/**
 * Application entry point.
 * Loads settings, initializes modules, boots the UI.
 */

import { EventBus } from './event-bus.js';
import { Config } from './config.js';
import { YonoteClient } from './yonote-client.js';
import { AIAgent } from './ai-agent.js';
import { ToolExecutor } from './tool-executor.js';
import { initUI, showSettingsModal } from './ui.js';

async function boot() {
    const config = new Config();
    await config.load();

    if (!config.isConfigured()) {
        showSettingsModal(config, boot);
        return;
    }

    const eventBus = new EventBus();
    const yonote = new YonoteClient(
        config.get('yonote_api_token'),
        config.get('yonote_base_url') || 'https://app.yonote.ru/api'
    );

    // Pre-fetch workspace URL for fullUrl() calls
    try {
        await yonote.getWorkspaceUrl();
    } catch (e) {
        console.warn('Failed to fetch workspace URL:', e);
    }

    const agent = new AIAgent(config.get('deepseek_api_key'));
    const executor = new ToolExecutor(yonote, agent, eventBus);

    initUI(executor, eventBus, agent, config);
}

document.addEventListener('DOMContentLoaded', boot);
