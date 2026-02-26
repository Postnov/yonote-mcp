/**
 * Tests for markdown-processor.js — port of test_markdown_processor.py
 */
import { describe, it, expect } from 'vitest';
import {
    isCodeLine, isUrlOnly,
    parseMarkdownBlocks, blocksToMarkdown,
    blocksToYonoteMarkdown, isHeadingCandidate,
    extractSectionFromText,
} from '../src/markdown-processor.js';

// Real Yonote document snippet for testing
const YONOTE_SAMPLE = `Как переносить боковую панель в другие тренинги и уроки
https://disk.yandex.ru/i/EiRHUhT8l_v2tw

Важно!
Не удалять из структуры эти элементы. Если их удалить, боковая панель может работать некорректно
![Untitled](<attachment:4abd716d-c30c-4e59-bfcc-6b53dafaad31>)
Как сделать открытие ссылок в новом окне?
Необходимо кликнуть на блок с ссылкой. Найти поле onClick и ввести window.open('сюда вписать вашу ссылку')
![Untitled](<attachment:7e4241ba-4415-4296-a536-b548a56d950b>)
Кнопки https://disk.yandex.ru/i/0IzyDeThom4P_w
Полезные ссылки https://disk.yandex.ru/i/InlzbsRaq9pWbQ
Классы для иконок
После вставки в «Класс html-элемента» будет меняться иконка.
![Untitled](<attachment:e4f6da64-dfae-4d9c-b07a-1e8c4fb68456>)
remake-link-button
remake-chain-button
Изменить название ссылки «Тренинги»
Необходимо добавить в блок Extra Scripts код ниже.
Код находится в: Сайт → Темы → JS
/**********************************
 * START — Изменить слово «Тренинги»
 **********************************/
/*
  LEFT_MENU — левое меню
  ├── '.menu-item-teach .submenu-item-trainings span:not(.submenu-notify-count)'

  BREADCRUMBS — хлебные крошки
  ├── '.header-box .breadcrumbs a:first-child'
  └── '.breadcrumb li:first-child a'
*/

const REPLACE_TEXT={
    LEFT_MENU:"Мои курсы",
    BREADCRUMBS:"Курсы",
    ANSWERS_PAGE:"Все курсы"
};
function f(s,t){let i=setInterval(()=>{if($(s).length){clearInterval(i),$(s).text(t)}},100)}

/**********************************
 * End — Изменить слово «Тренинги»
 **********************************/
Для чего нужна кнопка switch remake?
Кнопка нужна, чтобы переключить видимость оформления.`;


// === isCodeLine ===

describe('isCodeLine', () => {
    it('detects JS comment start', () => {
        expect(isCodeLine('/**********************************')).toBe(true);
    });

    it('detects JS comment star', () => {
        expect(isCodeLine(' * START — Изменить слово')).toBe(true);
    });

    it('detects JS comment end', () => {
        expect(isCodeLine(' **********************************/')).toBe(true);
    });

    it('detects const declaration', () => {
        expect(isCodeLine('const REPLACE_TEXT={')).toBe(true);
    });

    it('detects function declaration', () => {
        expect(isCodeLine('function f(s,t){let i=setInterval(')).toBe(true);
    });

    it('detects jQuery', () => {
        expect(isCodeLine('$(s).text(t)')).toBe(true);
    });

    it('detects window.*', () => {
        expect(isCodeLine('window.PageChecker.isOneTrainingPage')).toBe(true);
    });

    it('detects tree diagram', () => {
        expect(isCodeLine("  ├── '.menu-item-teach .submenu-item'")).toBe(true);
        expect(isCodeLine("  └── '.breadcrumb li:first-child a'")).toBe(true);
    });

    it('detects semicolon ending', () => {
        expect(isCodeLine('ANSWERS_PAGE:"Все курсы"};')).toBe(true);
    });

    it('rejects normal text', () => {
        expect(isCodeLine('Как переносить боковую панель')).toBe(false);
    });

    it('rejects normal text with punctuation', () => {
        expect(isCodeLine('Важно! Не удалять эти элементы.')).toBe(false);
    });

    it('rejects empty line', () => {
        expect(isCodeLine('')).toBe(false);
    });

    it('detects CSS class names', () => {
        expect(isCodeLine('remake-link-button')).toBe(true);
        expect(isCodeLine('remake-chain-button')).toBe(true);
        expect(isCodeLine('remake-icon-tg-3')).toBe(true);
        expect(isCodeLine('remake-ruble-button-2')).toBe(true);
    });

    it('detects UPPER_CASE key-value', () => {
        expect(isCodeLine('    LEFT_MENU:"Мои курсы",')).toBe(true);
        expect(isCodeLine('    BREADCRUMBS:"Курсы",')).toBe(true);
        expect(isCodeLine('    ANSWERS_PAGE:"Все курсы"')).toBe(true);
    });

    it('detects UPPER_CASE label with dash', () => {
        expect(isCodeLine('  LEFT_MENU — левое меню')).toBe(true);
        expect(isCodeLine('  BREADCRUMBS — хлебные крошки')).toBe(true);
        expect(isCodeLine('  ANSWERS_PAGE — страница «Лента ответов»')).toBe(true);
    });

    it('does not match Cyrillic uppercase as UPPER_CASE', () => {
        expect(isCodeLine('ВАЖНО! Не удалять')).toBe(false);
        expect(isCodeLine('Классы для иконок')).toBe(false);
    });
});


// === isUrlOnly ===

describe('isUrlOnly', () => {
    it('detects standalone URL', () => {
        expect(isUrlOnly('https://disk.yandex.ru/i/abc123')).toBe(true);
    });

    it('detects URL with surrounding spaces', () => {
        expect(isUrlOnly('  https://disk.yandex.ru/i/abc123  ')).toBe(true);
    });

    it('rejects text with URL', () => {
        expect(isUrlOnly('Кнопки https://disk.yandex.ru/i/abc')).toBe(false);
    });

    it('rejects plain text', () => {
        expect(isUrlOnly('Обычный текст')).toBe(false);
    });
});


// === parseMarkdownBlocks ===

describe('parseMarkdownBlocks', () => {
    it('handles empty text', () => {
        expect(parseMarkdownBlocks('')).toEqual([]);
        expect(parseMarkdownBlocks(null)).toEqual([]);
    });

    it('parses single line', () => {
        const blocks = parseMarkdownBlocks('Hello world');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('line');
        expect(blocks[0].translatable).toBe(true);
    });

    it('parses heading', () => {
        const blocks = parseMarkdownBlocks('## My Heading');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('heading');
        expect(blocks[0].translatable).toBe(true);
    });

    it('parses fenced code block', () => {
        const text = '```javascript\nconst x = 1;\n```';
        const blocks = parseMarkdownBlocks(text);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('code_block');
        expect(blocks[0].translatable).toBe(false);
    });

    it('parses image', () => {
        const blocks = parseMarkdownBlocks('![Screenshot](<attachment:abc123>)');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('image');
        expect(blocks[0].translatable).toBe(false);
    });

    it('parses URL-only line', () => {
        const blocks = parseMarkdownBlocks('https://disk.yandex.ru/i/abc123');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('url');
        expect(blocks[0].translatable).toBe(false);
    });

    it('parses empty lines', () => {
        const blocks = parseMarkdownBlocks('Hello\n\nWorld');
        const types = blocks.map(b => b.type);
        expect(types).toEqual(['line', 'empty', 'line']);
    });

    it('keeps each line as separate block', () => {
        const blocks = parseMarkdownBlocks('Line one\nLine two\nLine three');
        expect(blocks).toHaveLength(3);
        expect(blocks.every(b => b.type === 'line')).toBe(true);
        expect(blocks[0].content).toBe('Line one');
        expect(blocks[1].content).toBe('Line two');
        expect(blocks[2].content).toBe('Line three');
    });

    it('parses horizontal rule', () => {
        const blocks = parseMarkdownBlocks('---');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('horizontal_rule');
        expect(blocks[0].translatable).toBe(false);
    });

    it('detects unfenced code', () => {
        const text = `/**********************************
 * START — Изменить слово «Тренинги»
 **********************************/
/*
  LEFT_MENU — левое меню
  ├── '.menu-item-teach .submenu-item-trainings span:not(.submenu-notify-count)'
*/

const REPLACE_TEXT={
    LEFT_MENU:"Мои курсы",
    BREADCRUMBS:"Курсы",
};
function f(s,t){let i=setInterval(()=>{if($(s).length){clearInterval(i),$(s).text(t)}},100)}

/**********************************
 * End — Изменить слово «Тренинги»
 **********************************/`;
        const blocks = parseMarkdownBlocks(text);
        const codeBlocks = blocks.filter(b => b.type === 'code_block');
        expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
        for (const cb of codeBlocks) {
            expect(cb.translatable).toBe(false);
        }
        const translatable = blocks.filter(b => b.translatable);
        for (const tb of translatable) {
            expect(tb.content).not.toContain('const ');
            expect(tb.content).not.toContain('function ');
            expect(tb.content).not.toContain('├──');
        }
    });

    it('marks URL-only lines as not translatable', () => {
        const text = 'Как переносить панель\nhttps://disk.yandex.ru/i/abc123\n\nСледующая тема';
        const blocks = parseMarkdownBlocks(text);
        const urlBlocks = blocks.filter(b => b.type === 'url');
        expect(urlBlocks).toHaveLength(1);
        expect(urlBlocks[0].translatable).toBe(false);
    });

    it('marks mixed text+URL line as translatable', () => {
        const blocks = parseMarkdownBlocks('Кнопки https://disk.yandex.ru/i/abc123');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('line');
        expect(blocks[0].translatable).toBe(true);
    });
});


// === Yonote sample document ===

describe('Yonote sample document', () => {
    it('does not leak JS code into translatable blocks', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const translatable = blocks.filter(b => b.translatable);
        for (const block of translatable) {
            expect(block.content).not.toContain('const REPLACE_TEXT');
            expect(block.content).not.toContain('function f(s,t)');
            expect(block.content).not.toContain('├──');
            expect(block.content).not.toContain('*****');
        }
    });

    it('does not translate CSS class names', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const transText = blocks.filter(b => b.translatable).map(b => b.content).join('\n');
        expect(transText).not.toContain('remake-link-button');
        expect(transText).not.toContain('remake-chain-button');
    });

    it('does not translate JS object properties', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const transText = blocks.filter(b => b.translatable).map(b => b.content).join('\n');
        expect(transText).not.toContain('LEFT_MENU:"Мои курсы"');
        expect(transText).not.toContain('BREADCRUMBS:"Курсы"');
        expect(transText).not.toContain('ANSWERS_PAGE:"Все курсы"');
    });

    it('does not translate JS comment labels', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const transText = blocks.filter(b => b.translatable).map(b => b.content).join('\n');
        expect(transText).not.toContain('LEFT_MENU — левое меню');
        expect(transText).not.toContain('BREADCRUMBS — хлебные крошки');
    });

    it('marks URLs as not translatable', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const translatable = blocks.filter(b => b.translatable);
        for (const block of translatable) {
            if (block.content.trim().startsWith('https://')) {
                expect(isUrlOnly(block.content)).toBe(false);
            }
        }
    });

    it('finds images', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const images = blocks.filter(b => b.type === 'image');
        expect(images.length).toBeGreaterThanOrEqual(3);
        for (const img of images) {
            expect(img.translatable).toBe(false);
        }
    });

    it('marks text lines as translatable', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const transText = blocks.filter(b => b.translatable).map(b => b.content).join('\n');
        expect(transText).toContain('Как переносить боковую панель');
        expect(transText).toContain('Важно!');
        expect(transText).toContain('Для чего нужна кнопка switch remake?');
    });

    it('roundtrips content', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const result = blocksToMarkdown(blocks);
        expect(result).toBe(YONOTE_SAMPLE);
    });
});


// === blocksToMarkdown ===

describe('blocksToMarkdown', () => {
    it('roundtrips simple text', () => {
        const text = '# Hello\n\nWorld';
        expect(blocksToMarkdown(parseMarkdownBlocks(text))).toBe(text);
    });

    it('roundtrips with code', () => {
        const text = 'Text\n\n```js\nconst x = 1;\n```\n\nMore text';
        expect(blocksToMarkdown(parseMarkdownBlocks(text))).toBe(text);
    });
});


// === blocksToYonoteMarkdown ===

describe('blocksToYonoteMarkdown', () => {
    it('separates lines by double newline', () => {
        const blocks = parseMarkdownBlocks('Line one\nLine two\nLine three');
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toBe('## Line one\n\nLine two\n\nLine three');
    });

    it('wraps unfenced code in fences', () => {
        const blocks = parseMarkdownBlocks('Text\nconst x = 1;\nfunction foo() {}\nMore text');
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toContain('```\nconst x = 1;\nfunction foo() {}\n```');
        expect(result).toContain('Text');
        expect(result).toContain('More text');
    });

    it('does not double-wrap fenced code', () => {
        const blocks = parseMarkdownBlocks('Text\n\n```js\nconst x = 1;\n```\n\nMore');
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toContain('```js\nconst x = 1;\n```');
        expect(result).not.toContain('```\n```js');
    });

    it('skips empty blocks', () => {
        const blocks = parseMarkdownBlocks('Hello\n\nWorld');
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toBe('## Hello\n\n## World');
    });

    it('formats URL lines as links', () => {
        const blocks = parseMarkdownBlocks('Title\nhttps://example.com\nNext line');
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toContain('## Title');
        expect(result).toContain('[https://example.com](https://example.com)');
        expect(result).toContain('## Next line');
    });

    it('preserves images', () => {
        const blocks = parseMarkdownBlocks('Text\n![img](<attachment:abc>)\nMore');
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toContain('![img](<attachment:abc>)');
    });

    it('wraps JS code from sample in fences', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toMatch(/```\n\/\*[\s\S]*?\*\//);
        expect(result).toContain('Как переносить боковую панель');
        expect(result).toContain('Для чего нужна кнопка switch remake?');
    });

    it('detects headings after section breaks', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toContain('## Как переносить боковую панель');
        expect(result).toContain('## Важно!');
        expect(result).toContain('## Для чего нужна кнопка switch remake?');
    });

    it('does not make sentences into headings', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).not.toContain('## Не удалять из структуры');
        expect(result).not.toContain('## После вставки');
        expect(result).not.toContain('## Необходимо добавить');
    });

    it('formats standalone URLs as clickable links', () => {
        const blocks = parseMarkdownBlocks(YONOTE_SAMPLE);
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toContain('[https://disk.yandex.ru/i/EiRHUhT8l_v2tw](https://disk.yandex.ru/i/EiRHUhT8l_v2tw)');
    });

    it('does not reformat text+URL lines', () => {
        const blocks = parseMarkdownBlocks('Кнопки https://example.com/test');
        const result = blocksToYonoteMarkdown(blocks);
        expect(result).toBe('Кнопки https://example.com/test');
    });
});


// === isHeadingCandidate ===

describe('isHeadingCandidate', () => {
    it('detects heading after empty block', () => {
        expect(isHeadingCandidate('Заголовок раздела', 'empty', null)).toBe(true);
    });

    it('detects heading after image', () => {
        expect(isHeadingCandidate('Название секции', 'image', '![img](url)')).toBe(true);
    });

    it('detects heading after url', () => {
        expect(isHeadingCandidate('Новый раздел', 'url', 'https://example.com')).toBe(true);
    });

    it('detects heading after code block', () => {
        expect(isHeadingCandidate('Описание кода', 'code_block', 'const x = 1;')).toBe(true);
    });

    it('rejects heading after text line', () => {
        expect(isHeadingCandidate('Продолжение текста', 'line', 'Обычный текст')).toBe(false);
    });

    it('detects heading after text line with URL', () => {
        expect(isHeadingCandidate('Новый раздел', 'line', 'Кнопки https://example.com')).toBe(true);
    });

    it('rejects line ending with period', () => {
        expect(isHeadingCandidate('Это предложение.', 'empty', null)).toBe(false);
    });

    it('rejects too long text', () => {
        const longText = 'Это очень длинный текст '.repeat(10);
        expect(isHeadingCandidate(longText, 'empty', null)).toBe(false);
    });

    it('rejects line containing URL', () => {
        expect(isHeadingCandidate('Кнопки https://example.com', 'empty', null)).toBe(false);
    });

    it('detects first block as heading', () => {
        expect(isHeadingCandidate('Первый заголовок', null, null)).toBe(true);
    });
});


// === extractSectionFromText ===

const YONOTE_ROOM_TEXT = `Геометрия

Стык через метал профиль
Никаких треков, светильники утоплены в цвет потолка, умеренно тёплый свет одного тона

Свет

Светло
Мягко
Скрыта неидеальность
Прибавляет аппетитности

Цвет

Бежевые, пастельные, тёплые оттенки
Может быть контраст небольшим акцентом, например, диван`;

const YONOTE_ROOM_WITH_MARKDOWN = `## Геометрия

Стык через метал профиль

## Свет

- Светло
- Мягко
- Скрыта неидеальность

## Цвет

Бежевые, пастельные`;

describe('extractSectionFromText', () => {
    it('returns null for empty text', () => {
        expect(extractSectionFromText('', 'Свет')).toBeNull();
        expect(extractSectionFromText(null, 'Свет')).toBeNull();
    });

    it('returns null for empty heading', () => {
        expect(extractSectionFromText('Some text', '')).toBeNull();
        expect(extractSectionFromText('Some text', null)).toBeNull();
    });

    it('returns null when heading not found', () => {
        expect(extractSectionFromText(YONOTE_ROOM_TEXT, 'Мебель')).toBeNull();
    });

    it('extracts middle section (plain text)', () => {
        const result = extractSectionFromText(YONOTE_ROOM_TEXT, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Светло');
        expect(result).toContain('Мягко');
        expect(result).toContain('Скрыта неидеальность');
        expect(result).toContain('Прибавляет аппетитности');
        expect(result).not.toContain('Бежевые');
        expect(result).not.toContain('Стык через метал профиль');
    });

    it('extracts first section (plain text)', () => {
        const result = extractSectionFromText(YONOTE_ROOM_TEXT, 'Геометрия');
        expect(result).not.toBeNull();
        expect(result).toContain('Стык через метал профиль');
        expect(result).not.toContain('Светло');
    });

    it('extracts last section (plain text)', () => {
        const result = extractSectionFromText(YONOTE_ROOM_TEXT, 'Цвет');
        expect(result).not.toBeNull();
        expect(result).toContain('Бежевые');
        expect(result).not.toContain('Прибавляет аппетитности');
    });

    it('extracts section with markdown headings', () => {
        const result = extractSectionFromText(YONOTE_ROOM_WITH_MARKDOWN, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Светло');
        expect(result).toContain('Мягко');
        expect(result).not.toContain('Бежевые');
    });

    it('is case insensitive', () => {
        const result = extractSectionFromText(YONOTE_ROOM_TEXT, 'свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Светло');
    });

    it('is case insensitive (uppercase)', () => {
        const result = extractSectionFromText(YONOTE_ROOM_TEXT, 'СВЕТ');
        expect(result).not.toBeNull();
        expect(result).toContain('Светло');
    });

    it('extracts list items from markdown section', () => {
        const result = extractSectionFromText(YONOTE_ROOM_WITH_MARKDOWN, 'Свет');
        expect(result).toContain('- Светло');
        expect(result).toContain('- Мягко');
    });

    it('handles single-section document', () => {
        const text = 'Свет\n\nЯркий, тёплый\nДиммируемый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Яркий, тёплый');
        expect(result).toContain('Диммируемый');
    });

    it('handles ## heading prefix', () => {
        const text = '## Свет\n\nРассеянный\nТёплый\n\n## Цвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).toContain('Рассеянный');
        expect(result).toContain('Тёплый');
        expect(result).not.toContain('Белый');
    });

    it('handles ### heading prefix', () => {
        const text = '### Свет\n\nРассеянный\nТёплый\n\n### Цвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).toContain('Рассеянный');
        expect(result).not.toContain('Белый');
    });

    it('returns null for empty section', () => {
        const text = 'Свет\n\nЦвет\n\nБежевый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).toBeNull();
    });

    it('preserves images in section', () => {
        const text = 'Свет\n\nОсновное освещение — встроенные споты.\n\n![Фото освещения](<attachment:abc123>)\n\nДополнительно — бра у кровати.\n\nЦвет\n\nБежевый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('встроенные споты');
        expect(result).toContain('![Фото освещения](<attachment:abc123>)');
        expect(result).toContain('бра у кровати');
        expect(result).not.toContain('Бежевый');
    });

    it('preserves multiple images', () => {
        const text = 'Свет\n\nЛюстра в центре комнаты, бра у кровати.\n\n![Люстра](<attachment:img1>)\n\n![Бра](<attachment:img2>)\n\nЦвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).toContain('![Люстра](<attachment:img1>)');
        expect(result).toContain('![Бра](<attachment:img2>)');
        expect(result).toContain('Люстра в центре');
        expect(result).not.toContain('Белый');
    });

    it('does not treat links as headings', () => {
        const text = 'Свет\n\nПодробнее тут:\n\n[Каталог светильников](https://example.com/lights)\n\nЕщё варианты.\n\nЦвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).toContain('[Каталог светильников](https://example.com/lights)');
        expect(result).toContain('Ещё варианты');
        expect(result).not.toContain('Белый');
    });

    it('does not treat blockquotes as headings', () => {
        const text = 'Свет\n\n> Важно: диммируемый\n\nВсё остальное тоже.\n\nЦвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).toContain('> Важно: диммируемый');
        expect(result).toContain('Всё остальное тоже');
        expect(result).not.toContain('Белый');
    });

    it('matches bold markdown heading', () => {
        const text = '## **Свет**\n\nДиммеры и споты.\n\n## Цвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Диммеры и споты');
        expect(result).not.toContain('Белый');
    });

    it('matches italic markdown heading', () => {
        const text = '## *Свет*\n\nЛюстра.\n\n## Цвет\n\nСерый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Люстра');
    });

    it('matches bold plain text heading', () => {
        const text = '**Свет**\n\nДиммеры и споты.\n\nЦвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Диммеры');
    });

    it('does not treat table rows as headings', () => {
        const text = 'Свет\n\nНастройки:\n\n| Режим | Яркость |\n|-------|---------|  \n| День  | 100%    |\n\nДополнительно.\n\nЦвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).toContain('| Режим | Яркость |');
        expect(result).toContain('Дополнительно');
        expect(result).not.toContain('Белый');
    });

    it('extracts section with only image', () => {
        const text = '## Свет\n\n![Освещение](<attachment:light123>)\n\n## Цвет\n\nБелый';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('![Освещение](<attachment:light123>)');
    });

    it('extracts section with image then list', () => {
        const text = '## Свет\n\n![screenshot](/api/attachments.redirect?id=abc)\n\n- Светло\n- Мягко\n- Скрыта неидеальность\n\n## Тишина\n\nТихо';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('![screenshot](/api/attachments.redirect?id=abc)');
        expect(result).toContain('- Светло');
        expect(result).toContain('- Мягко');
        expect(result).not.toContain('Тихо');
    });

    it('handles Format B — headings without empty lines', () => {
        const text = 'Геометрия\nСтык через металл профиль\n' +
            'Никаких треков, светильники утоплены в цвет потолка, умеренно тёплый свет одного тона\n' +
            'Свет\nСветло\nМягко\nСкрыта неидеальность\nПрибавляет аппетитности \n\n' +
            'Цвет\nБежевые, пастельные, тёплые оттенки\nМожет быть контраст небольшим акцентом\n\n' +
            'Текстура\nДерево\n';
        const result = extractSectionFromText(text, 'Свет');
        expect(result).not.toBeNull();
        expect(result).toContain('Светло');
        expect(result).toContain('Мягко');
        expect(result).toContain('Скрыта неидеальность');
        expect(result).toContain('Прибавляет аппетитности');
        expect(result).not.toContain('Бежевые');
        expect(result).not.toContain('Дерево');
    });

    it('handles Format B — second section', () => {
        const text = 'Свет\nСветло\nМягко\n\nЦвет\nБежевые оттенки\nТёплые тона\n\nТекстура\nДерево\n';
        const result = extractSectionFromText(text, 'Цвет');
        expect(result).not.toBeNull();
        expect(result).toContain('Бежевые оттенки');
        expect(result).toContain('Тёплые тона');
        expect(result).not.toContain('Дерево');
    });

    it('handles Format B — last section', () => {
        const text = 'Свет\nСветло\nМягко\n\nЦвет\nБежевые оттенки\n';
        const result = extractSectionFromText(text, 'Цвет');
        expect(result).not.toBeNull();
        expect(result).toContain('Бежевые оттенки');
    });

    it('extracts from multiple room documents', () => {
        const rooms = {
            '1 этаж, Гости': 'Геометрия\n\nОткрытая планировка\n\nСвет\n\nСветло\nМягко\n\nЦвет\n\nБежевый',
            '2 этаж, Спальня': 'Геометрия\n\nМинимализм\n\nСвет\n\nДиммеры\nПрикроватные лампы\nТёплый свет\n\nЦвет\n\nСерый',
            'Кухня': 'Геометрия\n\nОстровная\n\nМебель\n\nВстроенная техника',
        };

        const results = {};
        for (const [title, text] of Object.entries(rooms)) {
            const section = extractSectionFromText(text, 'Свет');
            if (section) results[title] = section;
        }

        expect(Object.keys(results)).toHaveLength(2);
        expect(results['1 этаж, Гости']).toBeDefined();
        expect(results['2 этаж, Спальня']).toBeDefined();
        expect(results['Кухня']).toBeUndefined();
        expect(results['1 этаж, Гости']).toContain('Светло');
        expect(results['2 этаж, Спальня']).toContain('Диммеры');
    });
});
