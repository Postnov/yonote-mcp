/**
 * Node.js example for yonote-mcp
 *
 * Usage:
 *   YONOTE_TOKEN=xxx DEEPSEEK_KEY=yyy node examples/node-example.js
 */

import { createYonoteAgent } from '../src/index.js';

async function main() {
    const yonoteToken = process.env.YONOTE_TOKEN;
    const deepseekKey = process.env.DEEPSEEK_KEY;

    if (!yonoteToken || !deepseekKey) {
        console.error('Error: YONOTE_TOKEN and DEEPSEEK_KEY environment variables are required');
        console.error('Usage: YONOTE_TOKEN=xxx DEEPSEEK_KEY=yyy node examples/node-example.js');
        process.exit(1);
    }

    // Create the agent (no proxyUrl = direct requests)
    const { yonote, executor, eventBus } = createYonoteAgent({
        yonoteToken,
        deepseekKey,
    });

    // Set up event listeners
    eventBus.on('status', ({ message }) => {
        console.log(`[STATUS] ${message}`);
    });

    eventBus.on('result', (data) => {
        console.log('\n[RESULT]');
        if (data.message) console.log(`Message: ${data.message}`);
        if (data.documents) {
            console.log(`Documents (${data.documents.length}):`);
            for (const doc of data.documents) {
                console.log(`  ${doc.number}. ${doc.title} (${doc.id})`);
            }
        }
        if (data.collections) {
            console.log(`Collections (${data.collections.length}):`);
            for (const col of data.collections) {
                console.log(`  - ${col.name} (${col.id})`);
            }
        }
        if (data.document) {
            console.log(`Document: ${data.document.title}`);
            console.log(`  URL: ${data.document.url}`);
        }
    });

    eventBus.on('confirm', ({ message, pending_actions }) => {
        console.log('\n[CONFIRMATION REQUIRED]');
        console.log(`Message: ${message}`);
        console.log('Pending actions:', JSON.stringify(pending_actions, null, 2));
        console.log('\nTo execute, call: executor.executeConfirmedActions()');
    });

    eventBus.on('error', ({ message }) => {
        console.error(`[ERROR] ${message}`);
    });

    eventBus.on('done', () => {
        console.log('\n[DONE]');
    });

    // Get workspace info
    console.log('Fetching workspace info...');
    const workspaceUrl = await yonote.getWorkspaceUrl();
    console.log(`Workspace: ${workspaceUrl}\n`);

    // Example 1: List collections
    console.log('=== Example 1: List collections ===');
    await executor.processUserMessage('Show all collections');

    // Example 2: Search documents
    // console.log('\n=== Example 2: Search documents ===');
    // await executor.processUserMessage('Find documents about marketing');
}

main().catch(console.error);
