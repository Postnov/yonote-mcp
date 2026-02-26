/**
 * DeepSeek-powered AI agent for Yonote.
 * Supports both browser (via proxy) and Node.js (direct requests) modes.
 */

const SYSTEM_PROMPT = `Ты — AI-ассистент для управления базой знаний Yonote.
У тебя есть доступ к следующим инструментам для работы с Yonote:

1. search(query) — поиск документов по тексту
2. list_collections() — список всех коллекций
3. list_documents(collection_id?, parent_document_id?) — список документов
4. document_info(document_id) — подробная информация о документе (ПОЛНЫЙ текст в markdown)
5. create_document(title, text, collection_id?) — создать новый документ
6. update_document(document_id, title?, text?, append?) — обновить документ
7. delete_document(document_id) — удалить документ
8. move_document(document_id, collection_id?, parent_document_id?) — переместить документ
9. archive_document(document_id) — архивировать документ
10. restore_document(document_id) — восстановить из архива
11. list_drafts() — список черновиков
12. list_viewed() — недавно просмотренные документы
13. create_collection(name, description?) — создать коллекцию
14. delete_collection(collection_id) — удалить коллекцию
15. translate_document(document_id, target_language, new_title?) — перевод документа
16. extract_sections(parent_document_id, heading, output_title?, breadcrumbs?) — извлечение секций рекурсивно
17. duplicate_document(document_id, title?, publish?, recursive?) — дублирование документа
18. copy_section(document_id, heading, output_title?) — копирование секции
19. deep_search(query, collection_id?, parent_document_id?) — глубокий поиск по содержимому

ПРАВИЛА:
1. Действия чтения (search, deep_search, list_*, document_info) выполняй СРАЗУ через actions.
2. Действия изменения (create_*, update_*, delete_*, move_*, archive_*, restore_*, translate_*, extract_*, duplicate_*, copy_*) СНАЧАЛА ПРЕДЛОЖИ через pending_actions.
3. Когда пользователь подтверждает — перемести pending_actions в actions.

Формат ответа — JSON:
{
    "thinking": "...",
    "actions": [{"tool": "...", "params": {...}}],
    "pending_actions": [{"tool": "...", "params": {...}}],
    "response_template": "Краткий ответ пользователю"
}`;

export class AIAgent {
    /**
     * @param {string} apiKey - DeepSeek API key
     * @param {string} model - Model name (default: deepseek-chat)
     * @param {Object|null} config - Optional config with page IDs
     * @param {string|null} proxyUrl - URL of CORS proxy for browser mode
     */
    constructor(apiKey, model = 'deepseek-chat', config = null, proxyUrl = null) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = 'https://api.deepseek.com/v1';
        this.conversationHistory = [];
        this.config = config;
        this.proxyUrl = proxyUrl;
    }

    reset() {
        this.conversationHistory = [];
    }

    _buildSystemPrompt() {
        let prompt = SYSTEM_PROMPT;

        if (this.config) {
            const parts = [];
            const searchPageId = this.config.default_search_page_id || this.config.get?.('default_search_page_id');
            const reportsPageId = this.config.reports_page_id || this.config.get?.('reports_page_id');
            const tagsPageId = this.config.tags_page_id || this.config.get?.('tags_page_id');

            if (searchPageId) {
                parts.push(`- Страница для поиска: "${searchPageId}". Используй как parent_document_id для поиска.`);
            }
            if (reportsPageId) {
                parts.push(`- Страница для отчетов: "${reportsPageId}". Создавай отчёты внутри этой страницы.`);
            }
            if (tagsPageId) {
                parts.push(`- Страница с тегами: "${tagsPageId}".`);
            }

            if (parts.length) {
                prompt += '\n\nНАСТРОЙКИ:\n' + parts.join('\n');
            }
        }

        return prompt;
    }

    async processMessage(userMessage) {
        this.conversationHistory.push({ role: 'user', content: userMessage });

        const messages = [
            { role: 'system', content: this._buildSystemPrompt() },
            ...this.conversationHistory.slice(-10),
        ];

        const requestBody = {
            model: this.model,
            messages,
            temperature: 0.3,
            max_tokens: 8000,
        };

        let resp;
        if (this.proxyUrl) {
            resp = await fetch(this.proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: `${this.baseUrl}/chat/completions`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: requestBody,
                }),
            });
        } else {
            resp = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
        }

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`DeepSeek API error ${resp.status}: ${text}`);
        }

        const data = await resp.json();
        const assistantMessage = data.choices[0].message.content;
        this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

        return this._parseResponse(assistantMessage);
    }

    addContext(role, content) {
        this.conversationHistory.push({ role, content });
    }

    _parseResponse(text) {
        text = text.trim();
        if (text.startsWith('```json')) text = text.slice(7);
        if (text.startsWith('```')) text = text.slice(3);
        if (text.endsWith('```')) text = text.slice(0, -3);
        text = text.trim();

        try {
            return JSON.parse(text);
        } catch {
            return {
                thinking: '',
                actions: [],
                response_template: text,
            };
        }
    }
}

/**
 * Translate text using DeepSeek API.
 */
export async function translateTextViaAPI(text, targetLanguage, apiKey, model = 'deepseek-chat', proxyUrl = null) {
    if (!text || !text.trim()) return text;

    const prompt = `Translate the following text to ${targetLanguage}.

RULES:
- Translate ONLY the human-readable text
- Keep ALL markdown syntax exactly as-is
- Keep ALL URLs unchanged
- Return ONLY the translated text

Text to translate:
${text}`;

    const requestBody = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4000,
    };

    let resp;
    if (proxyUrl) {
        resp = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: 'https://api.deepseek.com/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: requestBody,
            }),
        });
    } else {
        resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
    }

    if (!resp.ok) throw new Error(`Translation API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices[0].message.content.trim();
}

export async function translateHeading(headingLine, targetLanguage, apiKey, model = 'deepseek-chat', proxyUrl = null) {
    const match = headingLine.match(/^(#{1,6}\s+)(.*)/);
    if (!match) return headingLine;
    const prefix = match[1];
    const text = match[2];
    const translated = await translateTextViaAPI(text, targetLanguage, apiKey, model, proxyUrl);
    return `${prefix}${translated}`;
}
