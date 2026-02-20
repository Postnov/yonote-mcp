/**
 * Tests for settings functionality — workspace page settings,
 * slug ID resolution, and error message propagation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolExecutor } from '../js/tool-executor.js';
import { AIAgent } from '../js/ai-agent.js';
import { EventBus } from '../js/event-bus.js';

// Mock config
function mockConfig(overrides = {}) {
    const settings = {
        yonote_api_token: 'test-token',
        deepseek_api_key: 'test-key',
        yonote_base_url: 'https://app.yonote.ru/api',
        tags_page_id: '',
        default_search_page_id: '',
        reports_page_id: '',
        ...overrides,
    };
    return {
        get: (key) => settings[key] || '',
        save: vi.fn().mockResolvedValue(true),
        isConfigured: () => true,
        getAll: () => ({ ...settings }),
    };
}

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
        collectionCreate: vi.fn(),
        collectionDelete: vi.fn(),
        documentDuplicate: vi.fn(),
        documentExportMarkdown: vi.fn(),
        attachmentsList: vi.fn(),
        getAttachmentUrl: vi.fn(),
        fullUrl: vi.fn(url => url ? `https://test.yonote.ru${url}` : ''),
    };
}

function mockAgent() {
    return {
        processMessage: vi.fn(),
        addContext: vi.fn(),
        reset: vi.fn(),
        conversationHistory: [],
        apiKey: 'test-key',
    };
}

describe('ToolExecutor _resolveDocumentId', () => {
    let yonote, agent, bus, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        executor = new ToolExecutor(yonote, agent, bus);
    });

    it('resolves slug ID to UUID via documentInfo', async () => {
        yonote.documentInfo.mockResolvedValue({
            data: { id: 'real-uuid-123', title: 'Doc' },
        });

        const result = await executor._resolveDocumentId('avgodom-EmozI4aR08');
        expect(result).toBe('real-uuid-123');
        expect(yonote.documentInfo).toHaveBeenCalledWith('avgodom-EmozI4aR08');
    });

    it('caches resolved IDs to avoid repeated API calls', async () => {
        yonote.documentInfo.mockResolvedValue({
            data: { id: 'cached-uuid', title: 'Doc' },
        });

        await executor._resolveDocumentId('slug-id');
        await executor._resolveDocumentId('slug-id');
        await executor._resolveDocumentId('slug-id');

        // Only one API call despite three resolve calls
        expect(yonote.documentInfo).toHaveBeenCalledTimes(1);
    });

    it('returns original ID on API error', async () => {
        yonote.documentInfo.mockRejectedValue(new Error('Not found'));

        const result = await executor._resolveDocumentId('bad-id');
        expect(result).toBe('bad-id');
    });

    it('returns null for null/empty input', async () => {
        expect(await executor._resolveDocumentId(null)).toBeNull();
        expect(await executor._resolveDocumentId('')).toBeNull();
        expect(yonote.documentInfo).not.toHaveBeenCalled();
    });

    it('returns UUID as-is if documentInfo returns same ID', async () => {
        yonote.documentInfo.mockResolvedValue({
            data: { id: 'already-uuid', title: 'Doc' },
        });

        const result = await executor._resolveDocumentId('already-uuid');
        expect(result).toBe('already-uuid');
    });
});

describe('ToolExecutor with config (reports_page_id)', () => {
    let yonote, agent, bus, config, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
    });

    it('resolves and uses reports_page_id as parent for extract_sections output', async () => {
        config = mockConfig({ reports_page_id: 'reports-slug' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        // documentInfo resolves different IDs
        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'root-1') return { data: { id: 'root-1', title: 'Root' } };
            if (id === 'child-1') return { data: { id: 'child-1', title: 'Page 1', text: '## Target\nContent here' } };
            if (id === 'reports-slug') return { data: { id: 'reports-uuid-resolved' } };
            return { data: { id } };
        });

        yonote.documentsList.mockResolvedValueOnce({
            data: [{ id: 'child-1', title: 'Page 1', text: '## Target\nContent here' }],
        }).mockResolvedValue({ data: [] });

        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'report-1', title: 'Report', url: '/doc/report-1' },
        });

        bus.on('status', () => {});

        await executor._executeExtractSections({
            parent_document_id: 'root-1',
            heading: 'Target',
            output_title: 'Report',
        });

        // Verify documentCreate was called with resolved UUID
        const createCall = yonote.documentCreate.mock.calls[0];
        expect(createCall[3]).toBe('reports-uuid-resolved');
    });

    it('resolves and uses reports_page_id as parent for copy_section output', async () => {
        config = mockConfig({ reports_page_id: 'reports-slug-copy' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'doc-1') return { data: { id: 'doc-1', title: 'Source', text: '## Section\nContent', url: '/doc/doc-1' } };
            if (id === 'reports-slug-copy') return { data: { id: 'reports-uuid-copy' } };
            return { data: { id } };
        });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.attachmentsList.mockResolvedValue({ data: [] });
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'new-1', title: 'Copy', url: '/doc/new-1' },
        });

        bus.on('status', () => {});

        await executor._executeCopySection({
            document_id: 'doc-1',
            heading: 'Section',
            output_title: 'Copy',
        });

        const createCall = yonote.documentCreate.mock.calls[0];
        expect(createCall[3]).toBe('reports-uuid-copy');
    });

    it('falls back to null parent when reports_page_id is empty', async () => {
        config = mockConfig({ reports_page_id: '' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'root-1') return { data: { id: 'root-1', title: 'Root' } };
            if (id === 'child-1') return { data: { id: 'child-1', title: 'Page 1', text: '## Target\nContent here' } };
            return { data: { id } };
        });
        yonote.documentsList.mockResolvedValueOnce({
            data: [{ id: 'child-1', title: 'Page 1' }],
        }).mockResolvedValue({ data: [] });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'report-1', title: 'Report', url: '/doc/report-1' },
        });

        bus.on('status', () => {});

        await executor._executeExtractSections({
            parent_document_id: 'root-1',
            heading: 'Target',
            output_title: 'Report',
        });

        const createCall = yonote.documentCreate.mock.calls[0];
        expect(createCall[3]).toBeNull(); // null parent
    });

    it('works without config at all', () => {
        executor = new ToolExecutor(yonote, agent, bus);
        expect(executor.config).toBeUndefined();
    });

    it('uses collectionId from reports_page parent to avoid 403', async () => {
        config = mockConfig({ reports_page_id: 'reports-slug' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'root-1') return { data: { id: 'root-1', title: 'Root' } };
            if (id === 'child-1') return { data: { id: 'child-1', title: 'Page 1', text: '## Tag\nData' } };
            // The reports page is in a private collection
            if (id === 'reports-slug') return { data: { id: 'reports-uuid', collectionId: 'private-col-123' } };
            return { data: { id } };
        });

        yonote.documentsList.mockResolvedValueOnce({
            data: [{ id: 'child-1', title: 'Page 1', text: '## Tag\nData' }],
        }).mockResolvedValue({ data: [] });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'public-col-1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'report-1', title: 'Report', url: '/doc/report-1' },
        });

        bus.on('status', () => {});

        await executor._executeExtractSections({
            parent_document_id: 'root-1',
            heading: 'Tag',
            output_title: 'Report',
        });

        const createCall = yonote.documentCreate.mock.calls[0];
        // collectionId should come from the reports page, not collectionsList
        expect(createCall[2]).toBe('private-col-123');
        expect(createCall[3]).toBe('reports-uuid');
    });

    it('uses collectionId from reports_page parent in copy_section', async () => {
        config = mockConfig({ reports_page_id: 'reports-slug-copy' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'doc-1') return { data: { id: 'doc-1', title: 'Source', text: '## Section\nContent', url: '/doc/doc-1' } };
            if (id === 'reports-slug-copy') return { data: { id: 'reports-uuid-copy', collectionId: 'private-col-456' } };
            return { data: { id } };
        });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.attachmentsList.mockResolvedValue({ data: [] });
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'public-col-1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'new-1', title: 'Copy', url: '/doc/new-1' },
        });

        bus.on('status', () => {});

        await executor._executeCopySection({
            document_id: 'doc-1',
            heading: 'Section',
            output_title: 'Copy',
        });

        const createCall = yonote.documentCreate.mock.calls[0];
        expect(createCall[2]).toBe('private-col-456');
        expect(createCall[3]).toBe('reports-uuid-copy');
    });
});

describe('ToolExecutor slug ID resolution in deep_search', () => {
    let yonote, agent, bus, config, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        bus.on('status', () => {});
    });

    it('resolves slug default_search_page_id to UUID before fetching descendants', async () => {
        config = mockConfig({ default_search_page_id: 'avgodom-EmozI4aR08' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        // _resolveDocumentId calls documentInfo to get UUID
        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'avgodom-EmozI4aR08') return { data: { id: 'real-uuid-abc123', title: 'Авгодом' } };
            if (id === 'child-1') return { data: { id: 'child-1', title: 'Page A', text: 'content about свет here', url: '/doc/child-1' } };
            if (id === 'child-2') return { data: { id: 'child-2', title: 'Page B', text: 'other text', url: '/doc/child-2' } };
            return { data: { id } };
        });

        // documentsList is called with RESOLVED UUID, not the slug
        yonote.documentsList
            .mockResolvedValueOnce({ data: [
                { id: 'child-1', title: 'Page A' },
                { id: 'child-2', title: 'Page B' },
            ] })
            .mockResolvedValue({ data: [] });

        const result = await executor._executeDeepSearch({ query: 'свет' });

        expect(result.result.count).toBe(1);
        expect(result.result.documents[0].title).toBe('Page A');

        // Verify documentsList was called with resolved UUID, not slug
        expect(yonote.documentsList.mock.calls[0][1]).toBe('real-uuid-abc123');
    });

    it('resolves slug parent_document_id from params', async () => {
        config = mockConfig({ default_search_page_id: '' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'slug-from-params') return { data: { id: 'resolved-param-uuid' } };
            if (id === 'child-1') return { data: { id: 'child-1', title: 'Found', text: 'query match', url: '/c1' } };
            return { data: { id } };
        });
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'child-1', title: 'Found' }] })
            .mockResolvedValue({ data: [] });

        await executor._executeDeepSearch({
            query: 'query',
            parent_document_id: 'slug-from-params',
        });

        // Should resolve slug first, then use resolved UUID for documentsList
        expect(yonote.documentInfo).toHaveBeenCalledWith('slug-from-params');
        expect(yonote.documentsList.mock.calls[0][1]).toBe('resolved-param-uuid');
    });

    it('scopes deep_search to default_search_page_id descendants', async () => {
        config = mockConfig({ default_search_page_id: 'parent-page-id' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        // documentInfo resolves the config ID (UUID matches slug — no change)
        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'parent-page-id') return { data: { id: 'parent-page-id' } };
            if (id === 'child-1') return { data: { id: 'child-1', title: 'Page A', text: 'something about канализация here', url: '/doc/child-1' } };
            if (id === 'child-2') return { data: { id: 'child-2', title: 'Page B', text: 'nothing here', url: '/doc/child-2' } };
            return { data: { id } };
        });

        yonote.documentsList
            .mockResolvedValueOnce({ data: [
                { id: 'child-1', title: 'Page A' },
                { id: 'child-2', title: 'Page B' },
            ] })
            .mockResolvedValue({ data: [] });

        const result = await executor._executeDeepSearch({ query: 'канализация' });

        expect(result.tool).toBe('deep_search');
        expect(result.result.count).toBe(1);
        expect(result.result.documents[0].title).toBe('Page A');
        expect(yonote.collectionsList).not.toHaveBeenCalled();
    });

    it('falls back to global search when default_search_page_id is empty', async () => {
        config = mockConfig({ default_search_page_id: '' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.collectionsList.mockResolvedValue({ data: [] });
        yonote.documentsList.mockResolvedValue({ data: [] });

        const result = await executor._executeDeepSearch({ query: 'test' });

        expect(yonote.collectionsList).toHaveBeenCalled();
    });

    it('uses explicit parent_document_id over config default', async () => {
        config = mockConfig({ default_search_page_id: 'config-parent' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'explicit-parent') return { data: { id: 'explicit-parent-uuid' } };
            if (id === 'child-x') return { data: { id: 'child-x', title: 'Explicit Child', text: 'found query here', url: '/doc/child-x' } };
            return { data: { id } };
        });
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'child-x', title: 'Explicit Child' }] })
            .mockResolvedValue({ data: [] });

        const result = await executor._executeDeepSearch({
            query: 'query',
            parent_document_id: 'explicit-parent',
        });

        // documentsList should be called with resolved explicit-parent UUID
        expect(yonote.documentsList.mock.calls[0][1]).toBe('explicit-parent-uuid');
    });
});

describe('ToolExecutor slug resolution in extract_sections', () => {
    let yonote, agent, bus, config, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        bus.on('status', () => {});
    });

    it('resolves slug parent_document_id before fetching descendants', async () => {
        config = mockConfig({});
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'avgodom-slug') return { data: { id: 'avgodom-real-uuid', title: 'Авгодом' } };
            if (id === 'child-1') return { data: { id: 'child-1', title: 'Room 1', text: '## Свет\nLED strip' } };
            return { data: { id } };
        });
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'child-1', title: 'Room 1' }] })
            .mockResolvedValue({ data: [] });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'report-1', title: 'Report', url: '/doc/report-1' },
        });

        await executor._executeExtractSections({
            parent_document_id: 'avgodom-slug',
            heading: 'Свет',
            output_title: 'Отчет по свету',
        });

        // documentsList should be called with resolved UUID
        expect(yonote.documentsList.mock.calls[0][1]).toBe('avgodom-real-uuid');
        // Document should be created
        expect(yonote.documentCreate).toHaveBeenCalled();
    });
});

describe('ToolExecutor multi-heading extract_sections', () => {
    let yonote, agent, bus, config, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        bus.on('status', () => {});
    });

    it('scans pages once and finds sections for multiple headings', async () => {
        config = mockConfig({ reports_page_id: '' });
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'root') return { data: { id: 'root', title: 'Root' } };
            if (id === 'page-1') return { data: { id: 'page-1', title: 'Гости', text: '## Свет\nLED\n\n## Цвет\nБелый' } };
            if (id === 'page-2') return { data: { id: 'page-2', title: 'Спальня', text: '## Свет\nТочечные\n\n## Полы\nПаркет' } };
            return { data: { id } };
        });
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'page-1', title: 'Гости' }, { id: 'page-2', title: 'Спальня' }] })
            .mockResolvedValue({ data: [] });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'report-1', title: 'Report', url: '/doc/report-1' },
        });

        const result = await executor._executeExtractSections({
            parent_document_id: 'root',
            headings: ['Свет', 'Цвет'],
            output_title: 'Отчет: Свет, Цвет',
        });

        expect(result.result.sections_found).toBe(3); // Свет:2 + Цвет:1
        expect(result.result.headings_found['Свет']).toBe(2);
        expect(result.result.headings_found['Цвет']).toBe(1);

        // Verify document was created with grouped content
        const createCall = yonote.documentCreate.mock.calls[0];
        const text = createCall[1];
        expect(text).toContain('# Свет');
        expect(text).toContain('# Цвет');
        expect(text).toContain('## Гости');
        expect(text).toContain('## Спальня');
        expect(text).toContain('---');
    });

    it('uses flat format (no # heading) for single heading in array', async () => {
        config = mockConfig({});
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'root') return { data: { id: 'root', title: 'Root' } };
            if (id === 'page-1') return { data: { id: 'page-1', title: 'Гости', text: '## Свет\nLED' } };
            return { data: { id } };
        });
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'page-1', title: 'Гости' }] })
            .mockResolvedValue({ data: [] });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'r1', title: 'R', url: '/doc/r1' },
        });

        await executor._executeExtractSections({
            parent_document_id: 'root',
            headings: ['Свет'],
            output_title: 'Отчет: Свет',
        });

        const createCall = yonote.documentCreate.mock.calls[0];
        const text = createCall[1];
        // Single heading: flat format, no # Свет header
        expect(text).toContain('## Гости');
        expect(text).not.toContain('# Свет');
    });

    it('returns error when no headings match across all pages', async () => {
        config = mockConfig({});
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'root') return { data: { id: 'root', title: 'Root' } };
            if (id === 'page-1') return { data: { id: 'page-1', title: 'Гости', text: '## Другое\nТекст' } };
            return { data: { id } };
        });
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'page-1', title: 'Гости' }] })
            .mockResolvedValue({ data: [] });

        const result = await executor._executeExtractSections({
            parent_document_id: 'root',
            headings: ['Свет', 'Цвет'],
        });

        expect(result.result.document).toBeUndefined();
        expect(result.result.message).toContain('«Свет»');
        expect(result.result.message).toContain('«Цвет»');
        expect(result.result.message).toContain('не найдены');
    });

    it('returns error for empty headings array', async () => {
        config = mockConfig({});
        executor = new ToolExecutor(yonote, agent, bus, config);

        const result = await executor._executeExtractSections({
            parent_document_id: 'root',
            headings: [],
        });

        expect(result.result.message).toContain('Не указаны темы');
    });

    it('backward compat: single heading param still works', async () => {
        config = mockConfig({});
        executor = new ToolExecutor(yonote, agent, bus, config);

        yonote.documentInfo.mockImplementation(async (id) => {
            if (id === 'root') return { data: { id: 'root', title: 'Root' } };
            if (id === 'page-1') return { data: { id: 'page-1', title: 'Гости', text: '## Свет\nLED' } };
            return { data: { id } };
        });
        yonote.documentsList
            .mockResolvedValueOnce({ data: [{ id: 'page-1', title: 'Гости' }] })
            .mockResolvedValue({ data: [] });
        yonote.documentExportMarkdown.mockResolvedValue(null);
        yonote.collectionsList.mockResolvedValue({ data: [{ id: 'c1' }] });
        yonote.documentCreate.mockResolvedValue({
            data: { id: 'r1', title: 'R', url: '/doc/r1' },
        });

        const result = await executor._executeExtractSections({
            parent_document_id: 'root',
            heading: 'Свет',
            output_title: 'Отчет: Свет',
        });

        expect(result.result.sections_found).toBe(1);
        expect(result.result.headings_found['Свет']).toBe(1);
        expect(yonote.documentCreate).toHaveBeenCalled();
    });
});

describe('ToolExecutor _buildResponse error propagation', () => {
    let yonote, agent, bus, executor;

    beforeEach(() => {
        yonote = mockYonote();
        agent = mockAgent();
        bus = new EventBus();
        executor = new ToolExecutor(yonote, agent, bus);
    });

    it('shows tool error message when template is Готово! and no document created', () => {
        const results = [{
            tool: 'extract_sections',
            result: { message: 'Дочерних страниц не найдено' },
        }];

        const combined = executor._buildResponse(results, 'Готово!');
        expect(combined.message).toBe('Дочерних страниц не найдено');
    });

    it('keeps Готово! when document was created', () => {
        const results = [{
            tool: 'extract_sections',
            result: {
                document: { id: 'doc-1', title: 'Report', url: '/doc/1' },
                sections_found: 3,
                total_children: 10,
            },
        }];

        const combined = executor._buildResponse(results, 'Готово!');
        expect(combined.message).toBe('Готово!');
        expect(combined.document).toEqual({ id: 'doc-1', title: 'Report', url: '/doc/1' });
    });

    it('keeps custom template even with error messages', () => {
        const results = [{
            tool: 'deep_search',
            result: { documents: [], count: 0, message: 'Дочерних страниц не найдено' },
        }];

        const combined = executor._buildResponse(results, 'Поиск завершён.');
        expect(combined.message).toBe('Поиск завершён.');
    });

    it('combines multiple tool error messages', () => {
        const results = [
            { tool: 'tool1', result: { message: 'Error A' } },
            { tool: 'tool2', result: { message: 'Error B' } },
        ];

        const combined = executor._buildResponse(results, 'Готово!');
        expect(combined.message).toBe('Error A\nError B');
    });

    it('keeps Готово! when documents found in search results', () => {
        const results = [{
            tool: 'deep_search',
            result: {
                documents: [{ id: '1', title: 'Found' }],
                count: 1,
            },
        }];

        const combined = executor._buildResponse(results, 'Готово!');
        expect(combined.message).toBe('Готово!');
        expect(combined.documents.length).toBe(1);
    });
});

describe('AIAgent with config (_buildSystemPrompt)', () => {
    it('builds base prompt without config', () => {
        const agent = new AIAgent('test-key');
        const prompt = agent._buildSystemPrompt();
        expect(prompt).toContain('AI-ассистент');
        expect(prompt).not.toContain('НАСТРОЙКИ РАБОЧИХ СТРАНИЦ');
    });

    it('includes search page in prompt', () => {
        const config = mockConfig({ default_search_page_id: 'search-page-123' });
        const agent = new AIAgent('test-key', 'deepseek-chat', config);
        const prompt = agent._buildSystemPrompt();
        expect(prompt).toContain('НАСТРОЙКИ РАБОЧИХ СТРАНИЦ');
        expect(prompt).toContain('search-page-123');
        expect(prompt).toContain('СТРАНИЦА ДЛЯ ПОИСКА');
    });

    it('includes reports page in prompt', () => {
        const config = mockConfig({ reports_page_id: 'reports-page-456' });
        const agent = new AIAgent('test-key', 'deepseek-chat', config);
        const prompt = agent._buildSystemPrompt();
        expect(prompt).toContain('reports-page-456');
        expect(prompt).toContain('Страница для отчетов');
    });

    it('includes tags page in prompt', () => {
        const config = mockConfig({ tags_page_id: 'tags-page-789' });
        const agent = new AIAgent('test-key', 'deepseek-chat', config);
        const prompt = agent._buildSystemPrompt();
        expect(prompt).toContain('tags-page-789');
        expect(prompt).toContain('Страница с тегами');
    });

    it('includes all settings when all are set', () => {
        const config = mockConfig({
            default_search_page_id: 'search-id',
            reports_page_id: 'reports-id',
            tags_page_id: 'tags-id',
        });
        const agent = new AIAgent('test-key', 'deepseek-chat', config);
        const prompt = agent._buildSystemPrompt();
        expect(prompt).toContain('search-id');
        expect(prompt).toContain('reports-id');
        expect(prompt).toContain('tags-id');
    });

    it('does not include settings section when all empty', () => {
        const config = mockConfig({
            default_search_page_id: '',
            reports_page_id: '',
            tags_page_id: '',
        });
        const agent = new AIAgent('test-key', 'deepseek-chat', config);
        const prompt = agent._buildSystemPrompt();
        expect(prompt).not.toContain('НАСТРОЙКИ РАБОЧИХ СТРАНИЦ');
    });

    it('uses _buildSystemPrompt in processMessage', async () => {
        const config = mockConfig({ reports_page_id: 'rp-id' });
        const agent = new AIAgent('test-key', 'deepseek-chat', config);

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"thinking":"t","actions":[],"response_template":"ok"}' } }],
            }),
        });

        await agent.processMessage('test');

        const fetchCall = global.fetch.mock.calls[0];
        const proxyBody = JSON.parse(fetchCall[1].body);
        const systemMsg = proxyBody.body.messages[0];
        expect(systemMsg.role).toBe('system');
        expect(systemMsg.content).toContain('rp-id');

        delete global.fetch;
    });
});

describe('extractDocumentId (URL parsing)', () => {
    function extractDocumentId(value) {
        if (!value) return '';
        if (value.startsWith('http')) {
            try {
                const urlObj = new URL(value);
                const path = urlObj.pathname;
                const uuidMatch = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
                if (uuidMatch) return uuidMatch[1];
                const segments = path.split('/').filter(Boolean);
                const lastSegment = segments[segments.length - 1] || '';
                const idMatch = lastSegment.match(/-([0-9a-zA-Z]{20,})$/);
                if (idMatch) return idMatch[1];
                return lastSegment;
            } catch {
                return value;
            }
        }
        return value;
    }

    it('returns empty string for empty input', () => {
        expect(extractDocumentId('')).toBe('');
    });

    it('returns ID as-is when not a URL', () => {
        expect(extractDocumentId('abc-123-def')).toBe('abc-123-def');
    });

    it('extracts UUID from Yonote URL', () => {
        const url = 'https://app.yonote.ru/doc/my-document-a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        expect(extractDocumentId(url)).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('extracts long ID from slug URL', () => {
        const url = 'https://app.yonote.ru/doc/some-title-slug-AbCdEfGhIjKlMnOpQrStUvWx';
        expect(extractDocumentId(url)).toBe('AbCdEfGhIjKlMnOpQrStUvWx');
    });

    it('handles URL with trailing slash', () => {
        const url = 'https://app.yonote.ru/doc/title-a1b2c3d4-e5f6-7890-abcd-ef1234567890/';
        expect(extractDocumentId(url)).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('returns last path segment for unusual URL', () => {
        expect(extractDocumentId('http://example.com/some-page')).toBe('some-page');
    });

    it('returns slug as-is for short Yonote URLs', () => {
        // Short slug like avgodom-EmozI4aR08 (less than 20 chars after last hyphen)
        const url = 'https://app.yonote.ru/doc/avgodom-EmozI4aR08';
        expect(extractDocumentId(url)).toBe('avgodom-EmozI4aR08');
    });
});
