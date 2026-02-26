/**
 * Tests for yonote-client.js — port of test_yonote_client.py
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YonoteClient } from '../src/yonote-client.js';

// Helper to create a mock fetch that returns proxy responses
function mockFetch(data, status = 200) {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => data,
        text: async () => JSON.stringify(data),
    });
}

describe('YonoteClient initialization', () => {
    it('uses default URL', () => {
        const c = new YonoteClient('my-token');
        expect(c.apiToken).toBe('my-token');
        expect(c.baseUrl).toBe('https://app.yonote.ru/api');
    });

    it('strips trailing slash from custom URL', () => {
        const c = new YonoteClient('tok', 'https://custom.yonote.ru/api/');
        expect(c.baseUrl).toBe('https://custom.yonote.ru/api');
    });

    it('stores apiToken for auth', () => {
        const c = new YonoteClient('test-token');
        expect(c.apiToken).toBe('test-token');
    });

    it('starts with null workspace URL', () => {
        const c = new YonoteClient('tok');
        expect(c._workspaceUrl).toBeNull();
    });

    it('fullUrl passes through http URLs', () => {
        const c = new YonoteClient('tok');
        c._workspaceUrl = 'https://test.yonote.ru';
        expect(c.fullUrl('https://already.full.url/doc')).toBe('https://already.full.url/doc');
    });

    it('fullUrl prepends workspace URL for relative paths', () => {
        const c = new YonoteClient('tok');
        c._workspaceUrl = 'https://test.yonote.ru';
        expect(c.fullUrl('/doc/my-doc-123')).toBe('https://test.yonote.ru/doc/my-doc-123');
    });

    it('fullUrl returns empty for empty string', () => {
        const c = new YonoteClient('tok');
        c._workspaceUrl = 'https://test.yonote.ru';
        expect(c.fullUrl('')).toBe('');
    });
});

describe('YonoteClient API methods', () => {
    let client;

    beforeEach(() => {
        client = new YonoteClient('test-token', 'https://app.yonote.ru/api');
    });

    it('getWorkspaceUrl fetches and caches', async () => {
        global.fetch = mockFetch({ data: { team: { url: 'https://myteam.yonote.ru' } } });

        const url = await client.getWorkspaceUrl();
        expect(url).toBe('https://myteam.yonote.ru');

        // Second call should be cached (no additional fetch)
        const url2 = await client.getWorkspaceUrl();
        expect(url2).toBe('https://myteam.yonote.ru');
        expect(global.fetch).toHaveBeenCalledTimes(1);

        delete global.fetch;
    });

    it('collectionsList fetches collections', async () => {
        global.fetch = mockFetch({ data: [{ id: 'c1', name: 'Col1' }] });
        const result = await client.collectionsList();
        expect(result.data[0].name).toBe('Col1');
        delete global.fetch;
    });

    it('collectionInfo fetches collection by id', async () => {
        global.fetch = mockFetch({ data: { id: 'c1', name: 'Col1' } });
        const result = await client.collectionInfo('c1');
        expect(result.data.id).toBe('c1');
        delete global.fetch;
    });

    it('collectionDocuments fetches documents', async () => {
        global.fetch = mockFetch({ data: [{ id: 'd1' }] });
        const result = await client.collectionDocuments('c1');
        expect(result.data).toHaveLength(1);
        delete global.fetch;
    });

    it('documentsList fetches documents', async () => {
        global.fetch = mockFetch({ data: [{ id: 'd1', title: 'Doc1' }] });
        const result = await client.documentsList(5);
        expect(result.data[0].title).toBe('Doc1');
        delete global.fetch;
    });

    it('documentInfo fetches document by id', async () => {
        global.fetch = mockFetch({ data: { id: 'd1', title: 'Doc1', text: 'Content' } });
        const result = await client.documentInfo('d1');
        expect(result.data.title).toBe('Doc1');
        delete global.fetch;
    });

    it('documentsSearch sends query', async () => {
        global.fetch = mockFetch({ data: [{ document: { id: 'd1', title: 'Match' } }] });
        const result = await client.documentsSearch('test query');
        expect(result.data[0].document.title).toBe('Match');
        delete global.fetch;
    });

    it('documentCreate sends title and text', async () => {
        global.fetch = mockFetch({ data: { id: 'new1', title: 'New Doc' } });
        const result = await client.documentCreate('New Doc', '# Hello', 'c1');
        expect(result.data.title).toBe('New Doc');
        delete global.fetch;
    });

    it('documentUpdate sends id and changes', async () => {
        global.fetch = mockFetch({ data: { id: 'd1', title: 'Updated' } });
        const result = await client.documentUpdate('d1', 'Updated', 'New content');
        expect(result.data.title).toBe('Updated');
        delete global.fetch;
    });

    it('documentDelete sends id', async () => {
        global.fetch = mockFetch({ success: true });
        const result = await client.documentDelete('d1');
        expect(result.success).toBe(true);
        delete global.fetch;
    });

    it('documentMove sends id and collection', async () => {
        global.fetch = mockFetch({ data: { id: 'd1' } });
        const result = await client.documentMove('d1', 'c2');
        expect(result.data.id).toBe('d1');
        delete global.fetch;
    });

    it('documentArchive sends id', async () => {
        global.fetch = mockFetch({ success: true });
        const result = await client.documentArchive('d1');
        expect(result.success).toBe(true);
        delete global.fetch;
    });

    it('documentRestore sends id', async () => {
        global.fetch = mockFetch({ success: true });
        const result = await client.documentRestore('d1');
        expect(result.success).toBe(true);
        delete global.fetch;
    });

    it('documentsDrafts fetches drafts', async () => {
        global.fetch = mockFetch({ data: [{ id: 'd1', title: 'Draft' }] });
        const result = await client.documentsDrafts();
        expect(result.data[0].title).toBe('Draft');
        delete global.fetch;
    });

    it('documentsViewed fetches viewed', async () => {
        global.fetch = mockFetch({ data: [{ id: 'd1' }] });
        const result = await client.documentsViewed();
        expect(result.data).toHaveLength(1);
        delete global.fetch;
    });

    it('collectionCreate sends name', async () => {
        global.fetch = mockFetch({ data: { id: 'c1', name: 'New Col' } });
        const result = await client.collectionCreate('New Col', 'Test');
        expect(result.data.name).toBe('New Col');
        delete global.fetch;
    });

    it('collectionDelete sends id', async () => {
        global.fetch = mockFetch({ success: true });
        const result = await client.collectionDelete('c1');
        expect(result.success).toBe(true);
        delete global.fetch;
    });
});
