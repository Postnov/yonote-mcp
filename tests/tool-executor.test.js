/**
 * Tests for tool-executor.js — port of test_extract_sections.py + test_yonote_client.py tool tests
 * Tests the _buildResponse and _formatTextForYonote helpers, plus extractSectionFromText integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor } from '../src/tool-executor.js';
import { EventBus } from '../src/event-bus.js';

// Helper: create a mock YonoteClient
function mockYonote() {
    return {
        documentsSearch: vi.fn(),
        documentInfo: vi.fn(),
        documentsList: vi.fn(),
        documentCreate: vi.fn(),
        documentUpdate: vi.fn(),
        documentDelete: vi.fn(),
        documentMove: vi.fn(),
        documentArchive: vi.fn(),
        documentRestore: vi.fn(),
        documentsDrafts: vi.fn(),
        documentsViewed: vi.fn(),
        collectionsList: vi.fn(),
        collectionInfo: vi.fn(),
        collectionDocuments: vi.fn(),
        collectionCreate: vi.fn(),
        collectionDelete: vi.fn(),
        documentDuplicate: vi.fn(),
        documentExportMarkdown: vi.fn(),
        getAttachmentUrl: vi.fn(),
        fullUrl: vi.fn(url => url ? `https://test.yonote.ru${url}` : ''),
    };
}

// Helper: create a mock AIAgent
function mockAgent() {
    return {
        processMessage: vi.fn(),
        addContext: vi.fn(),
        reset: vi.fn(),
        conversationHistory: [],
    };
}

describe('ToolExecutor._buildResponse', () => {
    let executor;

    beforeEach(() => {
        executor = new ToolExecutor(mockYonote(), mockAgent(), new EventBus());
    });

    it('builds response with documents', () => {
        const results = [{ tool: 'search', result: { documents: [{ id: 'd1' }], count: 1 } }];
        const combined = executor._buildResponse(results, 'Found docs');
        expect(combined.message).toBe('Found docs');
        expect(combined.documents[0].id).toBe('d1');
    });

    it('builds response with collections', () => {
        const results = [{ tool: 'list_collections', result: { collections: [{ id: 'c1', name: 'Col' }], count: 1 } }];
        const combined = executor._buildResponse(results, 'Collections');
        expect(combined.collections[0].name).toBe('Col');
    });

    it('builds response with no results', () => {
        const combined = executor._buildResponse([], 'No results');
        expect(combined.message).toBe('No results');
        expect(combined.documents).toBeUndefined();
    });

    it('cleans {result} placeholder', () => {
        const combined = executor._buildResponse([], 'Вот что нашлось: {result}');
        expect(combined.message).not.toContain('{result}');
        expect(combined.message).toBe('Вот что нашлось:');
    });

    it('replaces only-placeholder with default', () => {
        const combined = executor._buildResponse([], '{result}');
        expect(combined.message).toBe('Готово!');
    });
});

describe('ToolExecutor._formatTextForYonote', () => {
    let executor;

    beforeEach(() => {
        executor = new ToolExecutor(mockYonote(), mockAgent(), new EventBus());
    });

    it('returns null for null input', () => {
        expect(executor._formatTextForYonote(null)).toBeNull();
    });

    it('returns empty string for empty input', () => {
        expect(executor._formatTextForYonote('')).toBe('');
    });

    it('passes through text without URLs', () => {
        const text = 'Обычный текст без ссылок';
        expect(executor._formatTextForYonote(text)).toBe(text);
    });

    it('does not change single URL', () => {
        const text = 'Вот ссылка: https://example.com';
        expect(executor._formatTextForYonote(text)).toBe(text);
    });

    it('splits multiple URLs into list', () => {
        const text = 'Найдены ссылки: https://disk.yandex.ru/i/abc123 https://disk.yandex.ru/i/def456 https://disk.yandex.ru/i/ghi789';
        const result = executor._formatTextForYonote(text);
        expect(result).toContain('- [https://disk.yandex.ru/i/abc123](https://disk.yandex.ru/i/abc123)');
        expect(result).toContain('- [https://disk.yandex.ru/i/def456](https://disk.yandex.ru/i/def456)');
        expect(result).toContain('- [https://disk.yandex.ru/i/ghi789](https://disk.yandex.ru/i/ghi789)');
    });

    it('preserves already formatted list', () => {
        const text = 'Ссылки:\n\n- [https://a.com](https://a.com)\n- [https://b.com](https://b.com)';
        expect(executor._formatTextForYonote(text)).toBe(text);
    });

    it('preserves markdown structure', () => {
        const text = '# Заголовок\n\nОбычный текст\n\n- Пункт 1\n- Пункт 2';
        expect(executor._formatTextForYonote(text)).toBe(text);
    });

    it('preserves trailing text', () => {
        const text = 'https://a.com https://b.com Всего: 2 ссылки.';
        const result = executor._formatTextForYonote(text);
        expect(result).toContain('Всего: 2 ссылки.');
    });

    it('handles mixed content', () => {
        const text = '# Ссылки\n\nНашёл:\nhttps://a.com https://b.com https://c.com\n\nГотово!';
        const result = executor._formatTextForYonote(text);
        expect(result).toContain('# Ссылки');
        expect(result).toContain('Готово!');
        expect(result).toContain('- [https://a.com](https://a.com)');
    });
});

describe('ToolExecutor._executeTool', () => {
    let yonote, agent, bus, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        executor = new ToolExecutor(yonote, agent, bus);
    });

    it('executes search', async () => {
        yonote.documentsSearch.mockResolvedValue({
            data: [{ document: { id: 'd1', title: 'Doc1', text: 'content', url: '/doc/d1' } }],
        });

        const result = await executor._executeTool('search', { query: 'test' });
        expect(result.count).toBe(1);
        expect(result.documents[0].title).toBe('Doc1');
    });

    it('executes list_collections', async () => {
        yonote.collectionsList.mockResolvedValue({
            data: [{ id: 'c1', name: 'Col1' }, { id: 'c2', name: 'Col2' }],
        });

        const result = await executor._executeTool('list_collections', {});
        expect(result.count).toBe(2);
        expect(result.collections[0].name).toBe('Col1');
    });

    it('executes create_document', async () => {
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'new1', title: 'New Page', url: '/doc/new1' },
        });
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });

        const result = await executor._executeTool('create_document', { title: 'New Page', text: '# Content' });
        expect(result.document.title).toBe('New Page');
    });

    it('executes update_document', async () => {
        yonote.documentUpdate.mockResolvedValue({
            data: { id: 'd1', title: 'Updated', url: '/doc/d1' },
        });

        const result = await executor._executeTool('update_document', { document_id: 'd1', title: 'Updated' });
        expect(result.document.title).toBe('Updated');
    });

    it('executes delete_document', async () => {
        yonote.documentDelete.mockResolvedValue({ success: true });

        const result = await executor._executeTool('delete_document', { document_id: 'd1' });
        expect(result.deleted).toBe(true);
    });

    it('handles unknown tool', async () => {
        const result = await executor._executeTool('unknown_tool', {});
        expect(result.error).toBeTruthy();
    });

    it('executes move_document', async () => {
        yonote.documentMove.mockResolvedValue({
            data: { id: 'd1', title: 'Moved', url: '/doc/d1' },
        });

        const result = await executor._executeTool('move_document', { document_id: 'd1', collection_id: 'c2' });
        expect(result.document.title).toBe('Moved');
    });

    it('executes archive_document', async () => {
        yonote.documentArchive.mockResolvedValue({ success: true });
        const result = await executor._executeTool('archive_document', { document_id: 'd1' });
        expect(result.archived).toBe(true);
    });

    it('executes restore_document', async () => {
        yonote.documentRestore.mockResolvedValue({ success: true });
        const result = await executor._executeTool('restore_document', { document_id: 'd1' });
        expect(result.restored).toBe(true);
    });

    it('executes list_drafts', async () => {
        yonote.documentsDrafts.mockResolvedValue({
            data: [{ id: 'd1', title: 'Draft', url: '/doc/d1' }],
        });
        const result = await executor._executeTool('list_drafts', {});
        expect(result.count).toBe(1);
    });

    it('executes list_viewed', async () => {
        yonote.documentsViewed.mockResolvedValue({
            data: [{ id: 'd1', title: 'Recent', url: '/doc/d1' }],
        });
        const result = await executor._executeTool('list_viewed', {});
        expect(result.count).toBe(1);
    });

    it('executes create_collection', async () => {
        yonote.collectionCreate.mockResolvedValue({
            data: { id: 'c1', name: 'New' },
        });
        const result = await executor._executeTool('create_collection', { name: 'New' });
        expect(result.collection.name).toBe('New');
    });

    it('executes delete_collection', async () => {
        yonote.collectionDelete.mockResolvedValue({ success: true });
        const result = await executor._executeTool('delete_collection', { collection_id: 'c1' });
        expect(result.deleted).toBe(true);
    });
});

describe('ToolExecutor._fetchAllDescendants', () => {
    let yonote, executor;

    beforeEach(() => {
        yonote = mockYonote();
        executor = new ToolExecutor(yonote, mockAgent(), new EventBus());
    });

    it('returns empty array when no children', async () => {
        yonote.documentsList.mockResolvedValue({ data: [] });
        const result = await executor._fetchAllDescendants('parent-1');
        expect(result).toEqual([]);
    });

    it('returns flat children', async () => {
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'c1', title: 'A' }, { id: 'c2', title: 'B' }] })
            .mockResolvedValueOnce({ data: [] })
            .mockResolvedValueOnce({ data: [] });

        const result = await executor._fetchAllDescendants('parent-1');
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('c1');
        expect(result[1].id).toBe('c2');
    });

    it('traverses deep nesting', async () => {
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'c1', title: 'L1' }] })
            .mockResolvedValueOnce({ data: [{ id: 'c2', title: 'L2' }] })
            .mockResolvedValueOnce({ data: [{ id: 'c3', title: 'L3' }] })
            .mockResolvedValueOnce({ data: [] });

        const result = await executor._fetchAllDescendants('root');
        expect(result).toHaveLength(3);
        expect(result.map(p => p.id)).toEqual(['c1', 'c2', 'c3']);
    });

    it('skips branches with API errors', async () => {
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'c1', title: 'OK' }, { id: 'c2', title: 'Fail' }] })
            .mockResolvedValueOnce({ data: [] })
            .mockRejectedValueOnce(new Error('API error'));

        const result = await executor._fetchAllDescendants('root');
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('c1');
        expect(result[1].id).toBe('c2');
    });

    it('builds paths without root title', async () => {
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'c1', title: 'Интерьер' }] })
            .mockResolvedValueOnce({ data: [{ id: 'c2', title: 'Гости' }] })
            .mockResolvedValueOnce({ data: [] });

        const result = await executor._fetchAllDescendants('root');
        expect(result[0].path).toEqual(['Интерьер']);
        expect(result[1].path).toEqual(['Интерьер', 'Гости']);
    });

    it('builds paths with root title', async () => {
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'c1', title: 'Интерьер' }] })
            .mockResolvedValueOnce({ data: [{ id: 'c2', title: 'Гости' }] })
            .mockResolvedValueOnce({ data: [] });

        const result = await executor._fetchAllDescendants('root', 'Авгодом');
        expect(result[0].path).toEqual(['Авгодом', 'Интерьер']);
        expect(result[1].path).toEqual(['Авгодом', 'Интерьер', 'Гости']);
    });
});

describe('ToolExecutor pending actions flow', () => {
    let yonote, agent, bus, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        executor = new ToolExecutor(yonote, agent, bus);
    });

    it('starts with no pending actions', () => {
        expect(executor.pendingActions).toBeNull();
    });

    it('stores pending actions from AI response', async () => {
        agent.processMessage.mockResolvedValue({
            thinking: 'need to create doc',
            actions: [],
            pending_actions: [{ tool: 'create_document', params: { title: 'New' } }],
            response_template: 'Создать страницу?',
        });

        const events = [];
        bus.on('confirm', (data) => events.push(data));
        bus.on('done', () => {});

        await executor.processUserMessage('Создай страницу New');

        expect(executor.pendingActions).not.toBeNull();
        expect(executor.pendingActions[0].tool).toBe('create_document');
    });

    it('executeConfirmedActions clears pending', async () => {
        executor.pendingActions = [
            { tool: 'create_document', params: { title: 'Test', text: '# Hello' } },
        ];
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'new1', title: 'Test', url: '/doc/new1' },
        });
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });

        const events = [];
        bus.on('result', (data) => events.push(data));
        bus.on('done', () => {});
        bus.on('status', () => {});

        await executor.executeConfirmedActions();

        expect(executor.pendingActions).toBeNull();
    });
});

describe('ToolExecutor agentic loop', () => {
    let yonote, agent, bus, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        executor = new ToolExecutor(yonote, agent, bus);
    });

    it('read action triggers another AI call', async () => {
        agent.processMessage
            .mockResolvedValueOnce({
                thinking: 'searching',
                actions: [{ tool: 'search', params: { query: 'test' } }],
                response_template: 'Ищу...',
            })
            .mockResolvedValueOnce({
                thinking: 'got results, done',
                actions: [],
                response_template: 'Вот что нашлось:',
            });
        yonote.documentsSearch.mockResolvedValue({ data: [] });

        const events = [];
        bus.on('status', () => {});
        bus.on('result', (data) => events.push(data));
        bus.on('done', () => {});

        await executor.processUserMessage('Найди test');

        // AI should have been called twice
        expect(agent.processMessage).toHaveBeenCalledTimes(2);
    });

    it('multi-step: read then pending', async () => {
        agent.processMessage
            .mockResolvedValueOnce({
                thinking: 'need to read document first',
                actions: [{ tool: 'document_info', params: { document_id: 'd1' } }],
                response_template: 'Читаю документ...',
            })
            .mockResolvedValueOnce({
                thinking: 'got content, propose creation',
                actions: [],
                pending_actions: [{ tool: 'create_document', params: { title: 'Translated', text: '# Hello' } }],
                response_template: 'Создать страницу?',
            });
        yonote.documentInfo.mockResolvedValue({
            data: { id: 'd1', title: 'Оригинал', text: '# Привет', url: '/doc/d1' },
        });

        const confirmEvents = [];
        bus.on('status', () => {});
        bus.on('result', () => {});
        bus.on('confirm', (data) => confirmEvents.push(data));
        bus.on('done', () => {});

        await executor.processUserMessage('Переведи документ d1');

        expect(executor.pendingActions).not.toBeNull();
        expect(executor.pendingActions[0].params.title).toBe('Translated');
    });
});
