/**
 * Tests for the projects system — Config project context, ProjectApi,
 * Router, and UI rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Config } from '../js/config.js';
import { Router } from '../js/router.js';

// --- Config project context ---

describe('Config project context', () => {
    let config;

    beforeEach(() => {
        config = new Config();
        config._settings = {
            yonote_api_token: 'test-token',
            deepseek_api_key: 'test-key',
            tags_page_id: 'global-tags',
            default_search_page_id: 'global-search',
            reports_page_id: 'global-reports',
        };
        config._loaded = true;
    });

    it('returns global settings when no project is set', () => {
        expect(config.get('tags_page_id')).toBe('global-tags');
        expect(config.get('default_search_page_id')).toBe('global-search');
        expect(config.get('reports_page_id')).toBe('global-reports');
    });

    it('returns project values for page ID keys when project is set', () => {
        config.setProject({
            id: 1,
            name: 'Test Project',
            data: {
                tags_page_id: 'project-tags',
                default_search_page_id: 'project-search',
                reports_page_id: 'project-reports',
            },
        });

        expect(config.get('tags_page_id')).toBe('project-tags');
        expect(config.get('default_search_page_id')).toBe('project-search');
        expect(config.get('reports_page_id')).toBe('project-reports');
    });

    it('falls back to global for page ID keys when project data is empty', () => {
        config.setProject({
            id: 1,
            name: 'Test',
            data: {},
        });

        expect(config.get('tags_page_id')).toBe('global-tags');
        expect(config.get('default_search_page_id')).toBe('global-search');
    });

    it('falls back to global for page ID keys when project value is empty string', () => {
        config.setProject({
            id: 1,
            name: 'Test',
            data: { tags_page_id: '', reports_page_id: 'project-reports' },
        });

        expect(config.get('tags_page_id')).toBe('global-tags');
        expect(config.get('reports_page_id')).toBe('project-reports');
    });

    it('always returns global settings for non-page-ID keys', () => {
        config.setProject({
            id: 1,
            name: 'Test',
            data: { yonote_api_token: 'should-be-ignored' },
        });

        expect(config.get('yonote_api_token')).toBe('test-token');
        expect(config.get('deepseek_api_key')).toBe('test-key');
    });

    it('clearProject resets to global settings', () => {
        config.setProject({
            id: 1,
            name: 'Test',
            data: { tags_page_id: 'project-tags' },
        });

        expect(config.get('tags_page_id')).toBe('project-tags');

        config.clearProject();

        expect(config.get('tags_page_id')).toBe('global-tags');
    });

    it('getProject returns current project', () => {
        expect(config.getProject()).toBeNull();

        const project = { id: 1, name: 'Test', data: {} };
        config.setProject(project);
        expect(config.getProject()).toBe(project);
    });

    it('handles project with null data', () => {
        config.setProject({ id: 1, name: 'Test', data: null });

        expect(config.get('tags_page_id')).toBe('global-tags');
    });
});

// --- ProjectApi ---

describe('ProjectApi', () => {
    let api;

    beforeEach(async () => {
        const { ProjectApi } = await import('../js/project-api.js');
        api = new ProjectApi();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    it('list() fetches all projects', async () => {
        const mockProjects = [
            { id: 1, name: 'Project 1', data: {}, created_at: '2026-01-01' },
        ];
        global.fetch.mockResolvedValue({ ok: true, json: async () => mockProjects });

        const result = await api.list();
        expect(result).toEqual(mockProjects);
        expect(global.fetch).toHaveBeenCalledWith('/api/projects.php');
    });

    it('get(id) fetches single project', async () => {
        const mockProject = { id: 1, name: 'P1', data: {}, created_at: '2026-01-01' };
        global.fetch.mockResolvedValue({ ok: true, json: async () => mockProject });

        const result = await api.get(1);
        expect(result).toEqual(mockProject);
        expect(global.fetch).toHaveBeenCalledWith('/api/projects.php?id=1');
    });

    it('create(name, data) posts new project', async () => {
        const mockResult = { id: 2, name: 'New', data: { tags_page_id: 'abc' }, created_at: '2026-02-20' };
        global.fetch.mockResolvedValue({ ok: true, json: async () => mockResult });

        const result = await api.create('New', { tags_page_id: 'abc' });
        expect(result).toEqual(mockResult);

        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/projects.php');
        expect(opts.method).toBe('POST');
        expect(JSON.parse(opts.body)).toEqual({ name: 'New', data: { tags_page_id: 'abc' } });
    });

    it('update(id, fields) puts updated data', async () => {
        const mockResult = { id: 1, name: 'Updated', data: {}, created_at: '2026-01-01' };
        global.fetch.mockResolvedValue({ ok: true, json: async () => mockResult });

        await api.update(1, { name: 'Updated', data: { tags_page_id: 'xyz' } });

        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/projects.php?id=1');
        expect(opts.method).toBe('PUT');
    });

    it('delete(id) sends DELETE request', async () => {
        global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

        await api.delete(1);

        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/projects.php?id=1');
        expect(opts.method).toBe('DELETE');
    });

    it('throws on failed fetch', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 500 });
        await expect(api.list()).rejects.toThrow('Failed to load projects');
    });

    it('get() throws on 404', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 404 });
        await expect(api.get(999)).rejects.toThrow('Project not found');
    });
});

// --- Router (unit tests for route matching logic) ---

describe('Router route matching', () => {
    let router;

    beforeEach(() => {
        // Mock window.location for Node.js environment
        if (typeof window === 'undefined') {
            global.window = {
                location: { hash: '' },
                addEventListener: vi.fn(),
            };
        }
        router = new Router();
    });

    afterEach(() => {
        if (global.window && !global.window.document) {
            delete global.window;
        }
    });

    it('matches simple route', () => {
        const handler = vi.fn();
        router.add('#/projects', handler);
        window.location.hash = '#/projects';
        router._resolve();
        expect(handler).toHaveBeenCalledWith({});
    });

    it('matches parameterized route', () => {
        const handler = vi.fn();
        router.add('#/project/:id', handler);
        window.location.hash = '#/project/42';
        router._resolve();
        expect(handler).toHaveBeenCalledWith({ id: '42' });
    });

    it('extracts multiple params', () => {
        const handler = vi.fn();
        router.add('#/org/:orgId/project/:id', handler);
        window.location.hash = '#/org/abc/project/123';
        router._resolve();
        expect(handler).toHaveBeenCalledWith({ orgId: 'abc', id: '123' });
    });

    it('redirects empty hash to default', () => {
        window.location.hash = '';
        router._resolve();
        expect(window.location.hash).toBe('#/projects');
    });

    it('redirects #/ to default', () => {
        window.location.hash = '#/';
        router._resolve();
        expect(window.location.hash).toBe('#/projects');
    });

    it('redirects unknown hash to default', () => {
        const handler = vi.fn();
        router.add('#/projects', handler);
        window.location.hash = '#/unknown-route';
        router._resolve();
        expect(window.location.hash).toBe('#/projects');
    });

    it('navigate() changes hash', () => {
        router.navigate('#/project/5');
        expect(window.location.hash).toBe('#/project/5');
    });

    it('decodes URI components in params', () => {
        const handler = vi.fn();
        router.add('#/project/:id', handler);
        window.location.hash = '#/project/hello%20world';
        router._resolve();
        expect(handler).toHaveBeenCalledWith({ id: 'hello world' });
    });

    it('does not match partial routes', () => {
        const handler = vi.fn();
        router.add('#/projects', handler);
        window.location.hash = '#/projects/extra';
        router._resolve();
        expect(handler).not.toHaveBeenCalled();
    });

    it('registers route with start()', () => {
        const handler = vi.fn();
        router.add('#/test', handler);
        window.location.hash = '#/test';
        router.start();
        expect(handler).toHaveBeenCalled();
        expect(window.addEventListener).toHaveBeenCalledWith('hashchange', expect.any(Function));
    });
});

// --- UI functions ---

describe('UI project functions', () => {
    it('getHistoryKey scopes by project ID', async () => {
        const { getHistoryKey } = await import('../js/ui.js');
        expect(getHistoryKey(null)).toBe('yonote_report_history');
        expect(getHistoryKey(undefined)).toBe('yonote_report_history');
        expect(getHistoryKey(42)).toBe('yonote_report_history_42');
        expect(getHistoryKey('abc')).toBe('yonote_report_history_abc');
    });
});

// --- Config backward compatibility ---

describe('Config backward compatibility (no project)', () => {
    it('works exactly as before when no project is set', () => {
        const config = new Config();
        config._settings = {
            yonote_api_token: 'tok',
            tags_page_id: 'tags-id',
        };
        config._loaded = true;

        expect(config.get('yonote_api_token')).toBe('tok');
        expect(config.get('tags_page_id')).toBe('tags-id');
        expect(config.get('missing_key')).toBe('');
        expect(config.getProject()).toBeNull();
    });

    it('isConfigured() checks global settings only', () => {
        const config = new Config();
        config._settings = {
            yonote_api_token: 'tok',
            deepseek_api_key: 'key',
        };
        config._loaded = true;

        config.setProject({
            id: 1,
            name: 'Test',
            data: { yonote_api_token: '' },
        });

        expect(config.isConfigured()).toBe(true);
    });
});
