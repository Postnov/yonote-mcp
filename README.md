# yonote-mcp

AI-powered JavaScript client for Yonote knowledge base management. Uses DeepSeek AI for natural language document operations.

## Features

- **Full Yonote API coverage** — documents, collections, search, export
- **AI-powered commands** — natural language interface via DeepSeek
- **19 built-in tools** — search, create, update, translate, extract sections
- **Markdown processing** — intelligent parsing and translation
- **Dual-mode** — works in Node.js (direct) and Browser (via CORS proxy)

## Installation

```bash
# Clone the repository
git clone https://github.com/Postnov/yonote-mcp.git
cd yonote-mcp

# Install dev dependencies (for tests)
npm install
```

## Quick Start

### Node.js

```javascript
import { createYonoteAgent } from './src/index.js';

const { executor, eventBus } = createYonoteAgent({
    yonoteToken: process.env.YONOTE_TOKEN,
    deepseekKey: process.env.DEEPSEEK_KEY,
});

// Listen to events
eventBus.on('status', ({ message }) => console.log('Status:', message));
eventBus.on('result', (data) => console.log('Result:', data));
eventBus.on('error', ({ message }) => console.error('Error:', message));

// Execute command
await executor.processUserMessage('Find documents about marketing');
```

### Browser (requires CORS proxy)

```html
<script type="module">
import { createYonoteAgent } from './src/index.js';

const { executor, eventBus } = createYonoteAgent({
    yonoteToken: 'YOUR_YONOTE_TOKEN',
    deepseekKey: 'YOUR_DEEPSEEK_KEY',
    proxyUrl: '/proxy/proxy.php',  // CORS proxy
});

eventBus.on('status', ({ message }) => {
    document.getElementById('status').textContent = message;
});

eventBus.on('result', (data) => {
    console.log('Result:', data);
});

executor.processUserMessage('List all collections');
</script>
```

## Configuration

### Environment Variables

Create a `.env` file:

```
YONOTE_TOKEN=your_yonote_api_token
DEEPSEEK_KEY=your_deepseek_api_key
```

### Optional Config

```javascript
const { executor } = createYonoteAgent({
    yonoteToken: '...',
    deepseekKey: '...',
    yonoteBaseUrl: 'https://your-instance.yonote.ru/api',  // Custom Yonote URL
    proxyUrl: '/proxy/proxy.php',  // For browser mode
    config: {
        default_search_page_id: 'page-id',  // Limit search to this page
        reports_page_id: 'page-id',         // Save reports here
        tags_page_id: 'page-id',            // Tags page
    },
});
```

## API Reference

### YonoteClient

Direct Yonote API client.

```javascript
import { YonoteClient } from './src/yonote-client.js';

const client = new YonoteClient(token, baseUrl, proxyUrl);

// Collections
await client.collectionsList();
await client.collectionInfo(collectionId);
await client.collectionCreate(name, description);
await client.collectionDelete(collectionId);

// Documents
await client.documentsList(collectionId, parentDocumentId);
await client.documentInfo(documentId);
await client.documentsSearch(query, collectionId);
await client.documentCreate(title, text, collectionId, parentDocumentId);
await client.documentUpdate(documentId, title, text, append);
await client.documentDelete(documentId);
await client.documentMove(documentId, collectionId, parentDocumentId);
await client.documentDuplicate(documentId, title, publish, recursive);
await client.documentArchive(documentId);
await client.documentRestore(documentId);
await client.documentExportMarkdown(documentId);

// Attachments
await client.attachmentsList(documentId);
```

### AIAgent

DeepSeek-powered AI for processing commands.

```javascript
import { AIAgent } from './src/ai-agent.js';

const agent = new AIAgent(apiKey, model, config, proxyUrl);
const plan = await agent.processMessage('Find documents about X');
// Returns: { thinking, actions, pending_actions, response_template }
```

### ToolExecutor

Executes AI-planned actions against Yonote.

```javascript
import { ToolExecutor } from './src/tool-executor.js';

const executor = new ToolExecutor(yonoteClient, agent, eventBus, config);
await executor.processUserMessage('Create a page called "Notes"');
await executor.executeConfirmedActions();  // After user confirmation
```

## Available Tools

| # | Tool | Description |
|---|------|-------------|
| 1 | `search(query)` | Search documents by text |
| 2 | `list_collections()` | List all collections |
| 3 | `list_documents(collection_id?, parent_document_id?)` | List documents |
| 4 | `document_info(document_id)` | Get full document content |
| 5 | `create_document(title, text, collection_id?)` | Create new document |
| 6 | `update_document(document_id, title?, text?, append?)` | Update document |
| 7 | `delete_document(document_id)` | Delete document |
| 8 | `move_document(document_id, collection_id?, parent_document_id?)` | Move document |
| 9 | `archive_document(document_id)` | Archive document |
| 10 | `restore_document(document_id)` | Restore from archive |
| 11 | `list_drafts()` | List draft documents |
| 12 | `list_viewed()` | List recently viewed |
| 13 | `create_collection(name, description?)` | Create collection |
| 14 | `delete_collection(collection_id)` | Delete collection |
| 15 | `translate_document(document_id, target_language, new_title?)` | Translate document |
| 16 | `extract_sections(parent_document_id, heading, output_title?, breadcrumbs?)` | Extract sections recursively |
| 17 | `duplicate_document(document_id, title?, publish?, recursive?)` | Duplicate document |
| 18 | `copy_section(document_id, heading, output_title?)` | Copy section to new page |
| 19 | `deep_search(query, collection_id?, parent_document_id?)` | Deep content search |

## Events

The EventBus emits these events:

| Event | Data | Description |
|-------|------|-------------|
| `status` | `{ message }` | Progress updates |
| `result` | `{ message, documents?, collections?, document? }` | Operation results |
| `confirm` | `{ message, pending_actions }` | Needs user confirmation |
| `error` | `{ message }` | Error occurred |
| `done` | `{}` | Operation completed |

## CORS Proxy Setup

For browser usage, deploy `proxy/proxy.php` to your PHP server:

```bash
# Your server structure
/var/www/html/
├── proxy/
│   └── proxy.php
└── your-app/
    └── index.html
```

The proxy whitelists:
- `*.yonote.ru` — Yonote API
- `api.deepseek.com` — DeepSeek AI
- `storage.yandexcloud.net`, `s3.amazonaws.com` — Export downloads

## Running Tests

```bash
npm test           # Run tests once
npm run test:watch # Watch mode
```

## Project Structure

```
yonote-mcp/
├── src/
│   ├── index.js              # Main exports + createYonoteAgent()
│   ├── yonote-client.js      # Yonote API client
│   ├── ai-agent.js           # DeepSeek AI integration
│   ├── tool-executor.js      # Tool execution engine
│   ├── markdown-processor.js # Markdown parsing
│   └── event-bus.js          # Event emitter
├── proxy/
│   └── proxy.php             # CORS proxy for browsers
├── examples/
│   ├── node-example.js       # Node.js usage
│   └── browser-example.html  # Browser usage
├── tests/                    # Vitest tests
├── .env.example              # Environment template
├── package.json
└── README.md
```

## License

MIT

## Credits

Based on [yonote-mcp](https://github.com/cutalion/yonote-mcp) unofficial MCP server.
