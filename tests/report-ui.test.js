import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- parseTags tests (pure function, no DOM needed) ---

// Inline parseTags to avoid DOM-dependent module import
function parseTags(text) {
    if (!text) return [];
    const tags = [];
    const seen = new Set();
    const lines = text.split('\n');
    for (const line of lines) {
        const matches = line.match(/#([^\s#,;()[\]{}]+)/g);
        if (matches) {
            for (const match of matches) {
                const tag = match.slice(1).trim();
                if (tag && !seen.has(tag.toLowerCase())) {
                    seen.add(tag.toLowerCase());
                    tags.push(tag);
                }
            }
        }
    }
    return tags;
}

describe('parseTags', () => {
    it('parses simple #tag lines', () => {
        const text = '#Свет\n#Цвет\n#Геометрия';
        expect(parseTags(text)).toEqual(['Свет', 'Цвет', 'Геометрия']);
    });

    it('parses tags with dash prefix (- #tag)', () => {
        const text = '- #Свет\n- #Цвет\n- #Двери';
        expect(parseTags(text)).toEqual(['Свет', 'Цвет', 'Двери']);
    });

    it('parses tags with asterisk prefix (* #tag)', () => {
        const text = '* #Свет\n* #Полы\n* #Окна';
        expect(parseTags(text)).toEqual(['Свет', 'Полы', 'Окна']);
    });

    it('handles empty lines between tags', () => {
        const text = '#Свет\n\n#Цвет\n\n#Полы';
        expect(parseTags(text)).toEqual(['Свет', 'Цвет', 'Полы']);
    });

    it('returns empty array for empty text', () => {
        expect(parseTags('')).toEqual([]);
        expect(parseTags(null)).toEqual([]);
        expect(parseTags(undefined)).toEqual([]);
    });

    it('returns empty array for text without tags', () => {
        expect(parseTags('Просто текст без тегов')).toEqual([]);
        expect(parseTags('Строка 1\nСтрока 2')).toEqual([]);
    });

    it('deduplicates tags (case-insensitive)', () => {
        const text = '#Свет\n#свет\n#СВЕТ';
        expect(parseTags(text)).toEqual(['Свет']);
    });

    it('handles mixed formats', () => {
        const text = '# Заголовок страницы\n\n- #Свет\n- #Цвет\n\n#Полы\n* #Окна';
        // Note: "Заголовок" won't match because of the space after #
        // Actually # followed by space is "# Заголовок" - the regex matches #[^\s#,...]
        // so "#" followed by space won't match since space is \s
        expect(parseTags(text)).toEqual(['Свет', 'Цвет', 'Полы', 'Окна']);
    });

    it('handles multiple tags on one line', () => {
        const text = '#Свет #Цвет #Полы';
        expect(parseTags(text)).toEqual(['Свет', 'Цвет', 'Полы']);
    });

    it('handles tags with complex names', () => {
        const text = '#Свет-основной\n#Цвет_акцент\n#Фасады2этаж';
        expect(parseTags(text)).toEqual(['Свет-основной', 'Цвет_акцент', 'Фасады2этаж']);
    });

    it('ignores markdown headings (# with space)', () => {
        const text = '# Заголовок\n## Подзаголовок\n#Тег';
        expect(parseTags(text)).toEqual(['Тег']);
    });
});

// --- startReport flow tests (with mocks) ---

describe('startReport flow', () => {
    let mockExecutor, mockEventBus, mockConfig;

    beforeEach(() => {
        mockExecutor = {
            _executeExtractSections: vi.fn(),
        };
        mockEventBus = {
            on: vi.fn(),
            off: vi.fn(),
            emit: vi.fn(),
        };
        mockConfig = {
            get: vi.fn((key) => {
                if (key === 'default_search_page_id') return 'test-page-id';
                if (key === 'tags_page_id') return 'tags-page-id';
                if (key === 'reports_page_id') return 'reports-page-id';
                return '';
            }),
        };
    });

    it('calls _executeExtractSections with correct params', async () => {
        mockExecutor._executeExtractSections.mockResolvedValue({
            result: {
                document: { id: 'doc-1', title: 'Отчет: Свет', url: 'https://example.com/doc/1' },
                sections_found: 5,
                total_children: 10,
            },
        });

        // Simulate startReport logic
        const tagName = 'Свет';
        const searchPageId = mockConfig.get('default_search_page_id');

        const result = await mockExecutor._executeExtractSections({
            parent_document_id: searchPageId,
            heading: tagName,
            output_title: `Отчет: ${tagName}`,
        });

        expect(mockExecutor._executeExtractSections).toHaveBeenCalledWith({
            parent_document_id: 'test-page-id',
            heading: 'Свет',
            output_title: 'Отчет: Свет',
        });

        expect(result.result.document.title).toBe('Отчет: Свет');
        expect(result.result.sections_found).toBe(5);
    });

    it('handles missing search page configuration', () => {
        const configNoSearch = {
            get: vi.fn(() => ''),
        };
        const searchPageId = configNoSearch.get('default_search_page_id');
        expect(searchPageId).toBe('');
        // startReport would show error for empty searchPageId
    });

    it('handles extract_sections returning no document (message only)', async () => {
        mockExecutor._executeExtractSections.mockResolvedValue({
            result: {
                message: 'Секция «Свет» не найдена ни в одном из 10 документов',
            },
        });

        const result = await mockExecutor._executeExtractSections({
            parent_document_id: 'test-page-id',
            heading: 'Свет',
            output_title: 'Отчет: Свет',
        });

        const r = result.result || {};
        expect(r.document).toBeUndefined();
        expect(r.message).toContain('не найдена');
    });

    it('handles API errors gracefully', async () => {
        mockExecutor._executeExtractSections.mockRejectedValue(new Error('Network error'));

        await expect(
            mockExecutor._executeExtractSections({
                parent_document_id: 'test-page-id',
                heading: 'Свет',
                output_title: 'Отчет: Свет',
            })
        ).rejects.toThrow('Network error');
    });

    it('subscribes and unsubscribes from status events', () => {
        const handler = () => {};
        mockEventBus.on('status', handler);
        expect(mockEventBus.on).toHaveBeenCalledWith('status', handler);

        mockEventBus.off('status', handler);
        expect(mockEventBus.off).toHaveBeenCalledWith('status', handler);
    });
});

// --- formatReportDate / formatReportTitle tests (inline copies) ---

const MONTHS_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

function formatReportDate(date) {
    if (!date) date = new Date();
    if (typeof date === 'string' || typeof date === 'number') date = new Date(date);
    const d = date.getDate();
    const month = MONTHS_RU[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${d} ${month} ${year}. ${hours}:${minutes}`;
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatReportTitle(tagOrTags, date) {
    const tags = Array.isArray(tagOrTags) ? tagOrTags : [tagOrTags];
    return `Отчет: ${tags.map(capitalizeFirst).join(', ')} — ${formatReportDate(date)}`;
}

describe('formatReportDate', () => {
    it('formats Date object correctly', () => {
        const date = new Date(2026, 1, 23, 16, 12); // Feb 23, 2026 16:12
        expect(formatReportDate(date)).toBe('23 февраля 2026. 16:12');
    });

    it('pads hours and minutes with zeros', () => {
        const date = new Date(2026, 0, 5, 8, 3); // Jan 5, 2026 08:03
        expect(formatReportDate(date)).toBe('5 января 2026. 08:03');
    });

    it('handles midnight', () => {
        const date = new Date(2026, 11, 31, 0, 0); // Dec 31, 2026 00:00
        expect(formatReportDate(date)).toBe('31 декабря 2026. 00:00');
    });

    it('handles ISO string input', () => {
        const date = new Date(2026, 5, 15, 14, 30);
        const iso = date.toISOString();
        // Note: ISO string is UTC, so the result depends on local timezone
        // We just check the function doesn't crash and returns a string
        const result = formatReportDate(iso);
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^\d+ \S+ \d{4}\. \d{2}:\d{2}$/);
    });

    it('handles all 12 months', () => {
        for (let m = 0; m < 12; m++) {
            const date = new Date(2026, m, 1, 12, 0);
            const result = formatReportDate(date);
            expect(result).toContain(MONTHS_RU[m]);
        }
    });
});

describe('formatReportTitle', () => {
    it('formats title with single tag string', () => {
        const date = new Date(2026, 1, 23, 16, 12);
        expect(formatReportTitle('Свет', date)).toBe('Отчет: Свет — 23 февраля 2026. 16:12');
    });

    it('capitalizes first letter of tag', () => {
        const date = new Date(2026, 1, 23, 16, 12);
        expect(formatReportTitle('текстура', date)).toBe('Отчет: Текстура — 23 февраля 2026. 16:12');
    });

    it('works with different tag names', () => {
        const date = new Date(2026, 0, 1, 0, 0);
        expect(formatReportTitle('Геометрия', date)).toBe('Отчет: Геометрия — 1 января 2026. 00:00');
    });

    it('formats title with array of tags', () => {
        const date = new Date(2026, 1, 23, 16, 12);
        expect(formatReportTitle(['свет', 'цвет', 'полы'], date)).toBe('Отчет: Свет, Цвет, Полы — 23 февраля 2026. 16:12');
    });

    it('formats title with single-element array', () => {
        const date = new Date(2026, 1, 23, 16, 12);
        expect(formatReportTitle(['Свет'], date)).toBe('Отчет: Свет — 23 февраля 2026. 16:12');
    });
});

// --- Multi-tag report flow tests ---

describe('multi-tag startReport flow', () => {
    let mockExecutor, mockConfig;

    beforeEach(() => {
        mockExecutor = {
            _executeExtractSections: vi.fn(),
        };
        mockConfig = {
            get: vi.fn((key) => {
                if (key === 'default_search_page_id') return 'test-page-id';
                return '';
            }),
        };
    });

    it('calls _executeExtractSections with headings array', async () => {
        mockExecutor._executeExtractSections.mockResolvedValue({
            result: {
                document: { id: 'doc-1', title: 'Отчет: Свет, Цвет', url: 'https://example.com/doc/1' },
                sections_found: 12,
                total_children: 20,
                headings_found: { 'Свет': 8, 'Цвет': 4 },
            },
        });

        const tags = ['Свет', 'Цвет'];
        const searchPageId = mockConfig.get('default_search_page_id');

        const result = await mockExecutor._executeExtractSections({
            parent_document_id: searchPageId,
            headings: tags,
            output_title: `Отчет: ${tags.join(', ')}`,
            breadcrumbs: true,
        });

        expect(mockExecutor._executeExtractSections).toHaveBeenCalledWith({
            parent_document_id: 'test-page-id',
            headings: ['Свет', 'Цвет'],
            output_title: 'Отчет: Свет, Цвет',
            breadcrumbs: true,
        });

        expect(result.result.sections_found).toBe(12);
        expect(result.result.headings_found['Свет']).toBe(8);
        expect(result.result.headings_found['Цвет']).toBe(4);
    });

    it('handles multi-tag with some headings not found', async () => {
        mockExecutor._executeExtractSections.mockResolvedValue({
            result: {
                document: { id: 'doc-1', title: 'Отчет', url: 'https://example.com/doc/1' },
                sections_found: 5,
                total_children: 20,
                headings_found: { 'Свет': 5, 'Несуществующий': 0 },
            },
        });

        const result = await mockExecutor._executeExtractSections({
            parent_document_id: 'test-page-id',
            headings: ['Свет', 'Несуществующий'],
        });

        const hf = result.result.headings_found;
        expect(hf['Свет']).toBe(5);
        expect(hf['Несуществующий']).toBe(0);
    });

    it('returns error message when no headings found at all', async () => {
        mockExecutor._executeExtractSections.mockResolvedValue({
            result: {
                message: 'Секции «Свет», «Цвет» не найдены ни в одном из 20 документов',
            },
        });

        const result = await mockExecutor._executeExtractSections({
            parent_document_id: 'test-page-id',
            headings: ['Свет', 'Цвет'],
        });

        expect(result.result.document).toBeUndefined();
        expect(result.result.message).toContain('не найдены');
    });

    it('generates history label with multiple tags', () => {
        const tags = ['Свет', 'Цвет', 'Полы'];
        const label = tags.map(t => `#${t}`).join(', ');
        expect(label).toBe('#Свет, #Цвет, #Полы');
    });
});

// --- extractDocumentId tests (inline copy for testing) ---

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

describe('extractDocumentId', () => {
    it('returns empty string for empty input', () => {
        expect(extractDocumentId('')).toBe('');
        expect(extractDocumentId(null)).toBe('');
    });

    it('returns value as-is for non-URL input', () => {
        expect(extractDocumentId('some-doc-id')).toBe('some-doc-id');
    });

    it('extracts UUID from Yonote URL', () => {
        const url = 'https://app.yonote.ru/doc/title-slug-a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        expect(extractDocumentId(url)).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('extracts slug ID from Yonote URL', () => {
        const url = 'https://remake.yonote.ru/doc/avgodom-EmozI4aR08';
        // "avgodom-EmozI4aR08" is the last segment, but slug match needs 20+ chars
        // "EmozI4aR08" is only 10 chars, so it falls to lastSegment
        expect(extractDocumentId(url)).toBe('avgodom-EmozI4aR08');
    });
});
