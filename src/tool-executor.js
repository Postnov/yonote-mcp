/**
 * Tool executor — runs AI agent tools against Yonote API.
 * Dispatches events via EventBus.
 */

import { parseMarkdownBlocks, blocksToYonoteMarkdown, extractSectionFromText } from './markdown-processor.js';
import { translateTextViaAPI, translateHeading } from './ai-agent.js';

export class ToolExecutor {
    /**
     * @param {YonoteClient} yonote - Yonote API client
     * @param {AIAgent} agent - AI agent
     * @param {EventBus} eventBus - Event emitter
     * @param {Object|null} config - Optional config object with page IDs
     */
    constructor(yonote, agent, eventBus, config = null) {
        this.yonote = yonote;
        this.agent = agent;
        this.eventBus = eventBus;
        this.config = config || {};
        this.pendingActions = null;
        this._resolvedIds = new Map();
    }

    _getConfig(key) {
        if (!this.config) return '';
        if (typeof this.config.get === 'function') {
            return this.config.get(key) || '';
        }
        return this.config[key] || '';
    }

    async _resolveDocumentId(idOrSlug) {
        if (!idOrSlug) return null;
        if (this._resolvedIds.has(idOrSlug)) return this._resolvedIds.get(idOrSlug);
        try {
            const result = await this.yonote.documentInfo(idOrSlug);
            const uuid = result?.data?.id || idOrSlug;
            this._resolvedIds.set(idOrSlug, uuid);
            return uuid;
        } catch {
            return idOrSlug;
        }
    }

    // --- Main agentic loop ---

    async processUserMessage(message) {
        try {
            this.eventBus.emit('status', { message: 'Думаю...' });
            let plan = await this.agent.processMessage(message);

            const maxIterations = 10;
            const finalResults = [];

            for (let iteration = 0; iteration < maxIterations; iteration++) {
                const actions = plan.actions || [];
                const pending = plan.pending_actions || [];
                const responseTemplate = plan.response_template || '';

                if (!actions.length && pending.length) {
                    this.pendingActions = pending;
                    this.eventBus.emit('confirm', { message: responseTemplate, pending_actions: pending });
                    this.eventBus.emit('done', {});
                    return;
                }

                if (!actions.length) {
                    const combined = this._buildResponse(finalResults, responseTemplate);
                    this.eventBus.emit('result', combined);
                    this.eventBus.emit('done', {});
                    return;
                }

                const allResults = [];
                const readTools = ['search', 'list_collections', 'list_documents', 'document_info', 'list_drafts', 'list_viewed', 'deep_search'];
                const hasOnlyReadActions = actions.every(a => readTools.includes(a.tool));

                for (const action of actions) {
                    const result = await this._executeAction(action);
                    if (result) allResults.push(result);
                }

                finalResults.push(...allResults);

                const resultsJson = JSON.stringify(allResults);
                this.agent.addContext('user', `Результаты выполнения: ${resultsJson}`);

                if (hasOnlyReadActions) {
                    this.eventBus.emit('status', { message: 'Анализирую результаты...' });
                    plan = await this.agent.processMessage('Продолжай на основе полученных результатов.');
                    continue;
                }

                const combined = this._buildResponse(allResults, responseTemplate);
                this.eventBus.emit('result', combined);
                this.eventBus.emit('done', {});
                return;
            }

            this.eventBus.emit('result', { message: 'Готово!' });
            this.eventBus.emit('done', {});
        } catch (e) {
            this.eventBus.emit('error', { message: `Ошибка: ${e.message}` });
            this.eventBus.emit('done', {});
        }
    }

    async executeConfirmedActions() {
        const actions = this.pendingActions;
        if (!actions) {
            this.eventBus.emit('error', { message: 'Нет действий для подтверждения' });
            this.eventBus.emit('done', {});
            return;
        }
        this.pendingActions = null;

        try {
            const allResults = [];
            for (const action of actions) {
                const result = await this._executeAction(action);
                if (result) allResults.push(result);
            }

            this.agent.addContext('user', 'Пользователь подтвердил действие.');
            this.agent.addContext('user', `Результаты выполнения: ${JSON.stringify(allResults)}`);

            const combined = this._buildResponse(allResults, 'Готово!');
            this.eventBus.emit('result', combined);
            this.eventBus.emit('done', {});
        } catch (e) {
            this.eventBus.emit('error', { message: `Ошибка: ${e.message}` });
            this.eventBus.emit('done', {});
        }
    }

    // --- Action dispatcher ---

    async _executeAction(action) {
        const tool = action.tool || '';
        const params = action.params || {};

        if (tool === 'translate_document') {
            return this._executeTranslate(params);
        } else if (tool === 'copy_section') {
            return this._executeCopySection(params);
        } else if (tool === 'extract_sections') {
            return this._executeExtractSections(params);
        } else if (tool === 'deep_search') {
            return this._executeDeepSearch(params);
        } else {
            const result = await this._executeTool(tool, params);
            return { tool, result };
        }
    }

    // --- Standard tools ---

    async _executeTool(tool, params) {
        const yonote = this.yonote;

        if (tool === 'search') {
            this.eventBus.emit('status', { message: 'Ищу информацию...' });
            const query = params.query || '';
            const apiResult = await yonote.documentsSearch(query);
            const documents = apiResult.data || [];
            const queryLower = query.toLowerCase();
            const docsList = [];

            for (const doc of documents) {
                const d = doc.document || doc;
                const text = d.text || '';
                const ranking = doc.ranking || 0;
                if (!text.trim() && ranking && parseFloat(ranking) < 1e-10) continue;

                const context = doc.context || '';
                let snippet = '';
                if (context) {
                    snippet = context.slice(0, 200);
                } else if (text.trim()) {
                    const idx = text.toLowerCase().indexOf(queryLower);
                    if (idx >= 0) {
                        const start = Math.max(0, idx - 50);
                        snippet = (start > 0 ? '...' : '') + text.slice(start, idx + query.length + 100).trim();
                        if (idx + query.length + 100 < text.length) snippet += '...';
                    } else {
                        snippet = text.slice(0, 200).trim();
                    }
                }

                docsList.push({
                    number: docsList.length + 1,
                    id: d.id,
                    title: d.title,
                    text: text.slice(0, 300),
                    snippet,
                    url: yonote.fullUrl(d.url || ''),
                });
            }

            if (!docsList.length && documents.length) {
                return { documents: [], count: 0, note: `Поиск по «${query}» вернул ${documents.length} результатов, но все оказались пустыми.` };
            }
            return { documents: docsList, count: docsList.length };
        }

        if (tool === 'list_collections') {
            this.eventBus.emit('status', { message: 'Загружаю коллекции...' });
            const apiResult = await yonote.collectionsList();
            const collections = apiResult.data || [];
            const cols = collections.map(c => ({ id: c.id, name: c.name }));
            return { collections: cols, count: cols.length };
        }

        if (tool === 'list_documents') {
            let parentId = params.parent_document_id;
            this.eventBus.emit('status', { message: parentId ? 'Загружаю дочерние страницы...' : 'Загружаю документы...' });
            if (parentId) parentId = await this._resolveDocumentId(parentId);
            const apiResult = await yonote.documentsList(params.collection_id, parentId);
            const documents = apiResult.data || [];
            const docsList = documents.map((d, i) => ({
                number: i + 1,
                id: d.id,
                title: d.title,
                url: yonote.fullUrl(d.url || ''),
            }));
            return { documents: docsList, count: docsList.length };
        }

        if (tool === 'document_info') {
            this.eventBus.emit('status', { message: 'Загружаю документ...' });
            const apiResult = await yonote.documentInfo(params.document_id);
            const doc = apiResult.data || {};
            return {
                document: {
                    id: doc.id,
                    title: doc.title,
                    text: doc.text || '',
                    url: yonote.fullUrl(doc.url || ''),
                },
            };
        }

        if (tool === 'create_document') {
            this.eventBus.emit('status', { message: 'Создаю страницу...' });
            const createParams = { title: params.title || 'Без названия' };
            let text = params.text;
            if (text) text = this._formatTextForYonote(text);
            let colId = params.collection_id;
            if (!colId) {
                const colsResult = await yonote.collectionsList(1);
                const cols = colsResult.data || [];
                if (cols.length) colId = cols[0].id;
            }
            if (text) {
                this.eventBus.emit('status', { message: 'Наполняю контентом...' });
            }
            const apiResult = await yonote.documentCreate(
                createParams.title, text || '', colId || null, null, true
            );
            const doc = apiResult.data || {};
            return {
                document: { id: doc.id, title: doc.title, url: yonote.fullUrl(doc.url || '') },
            };
        }

        if (tool === 'update_document') {
            this.eventBus.emit('status', { message: 'Обновляю документ...' });
            let text = params.text;
            if (text) text = this._formatTextForYonote(text);
            const apiResult = await yonote.documentUpdate(params.document_id, params.title || null, text, params.append || false);
            const doc = apiResult.data || {};
            return {
                document: { id: doc.id, title: doc.title, url: yonote.fullUrl(doc.url || '') },
            };
        }

        if (tool === 'delete_document') {
            this.eventBus.emit('status', { message: 'Удаляю документ...' });
            await yonote.documentDelete(params.document_id);
            return { deleted: true };
        }

        if (tool === 'move_document') {
            this.eventBus.emit('status', { message: 'Перемещаю документ...' });
            const apiResult = await yonote.documentMove(params.document_id, params.collection_id, params.parent_document_id);
            const doc = apiResult.data || {};
            return {
                document: { id: doc.id, title: doc.title, url: yonote.fullUrl(doc.url || '') },
            };
        }

        if (tool === 'archive_document') {
            this.eventBus.emit('status', { message: 'Архивирую документ...' });
            await yonote.documentArchive(params.document_id);
            return { archived: true };
        }

        if (tool === 'restore_document') {
            this.eventBus.emit('status', { message: 'Восстанавливаю документ...' });
            await yonote.documentRestore(params.document_id);
            return { restored: true };
        }

        if (tool === 'list_drafts') {
            this.eventBus.emit('status', { message: 'Загружаю черновики...' });
            const apiResult = await yonote.documentsDrafts();
            const documents = apiResult.data || [];
            const docsList = documents.map(d => ({ id: d.id, title: d.title, url: yonote.fullUrl(d.url || '') }));
            return { documents: docsList, count: docsList.length };
        }

        if (tool === 'list_viewed') {
            this.eventBus.emit('status', { message: 'Загружаю недавние...' });
            const apiResult = await yonote.documentsViewed();
            const documents = apiResult.data || [];
            const docsList = documents.map(d => ({ id: d.id, title: d.title, url: yonote.fullUrl(d.url || '') }));
            return { documents: docsList, count: docsList.length };
        }

        if (tool === 'create_collection') {
            this.eventBus.emit('status', { message: 'Создаю коллекцию...' });
            const apiResult = await yonote.collectionCreate(params.name || 'Без названия', params.description || '');
            const col = apiResult.data || {};
            return { collection: { id: col.id, name: col.name } };
        }

        if (tool === 'duplicate_document') {
            this.eventBus.emit('status', { message: 'Дублирую документ...' });
            const apiResult = await yonote.documentDuplicate(params.document_id, params.title, params.publish !== false, params.recursive || false);
            const doc = apiResult.data || {};
            return {
                document: { id: doc.id, title: doc.title, url: yonote.fullUrl(doc.url || '') },
            };
        }

        if (tool === 'delete_collection') {
            this.eventBus.emit('status', { message: 'Удаляю коллекцию...' });
            await yonote.collectionDelete(params.collection_id);
            return { deleted: true };
        }

        return { error: `Неизвестный инструмент: ${tool}` };
    }

    // --- Complex tools ---

    async _executeTranslate(params) {
        const docId = params.document_id;
        const targetLang = params.target_language || 'English';
        let newTitle = params.new_title || '';

        this.eventBus.emit('status', { message: 'Загружаю оригинал...' });
        const apiResult = await this.yonote.documentInfo(docId);
        const doc = apiResult.data || {};
        const originalText = doc.text || '';
        const originalTitle = doc.title || '';

        if (!newTitle) newTitle = `${originalTitle} (${targetLang})`;

        this.eventBus.emit('status', { message: `Перевожу на ${targetLang}...` });

        const blocks = parseMarkdownBlocks(originalText);
        const translatableBlocks = blocks.filter(b => b.translatable);
        const total = translatableBlocks.length;
        let translatedCount = 0;

        const translatedBlocks = [];
        for (const block of blocks) {
            if (!block.translatable) {
                translatedBlocks.push({ ...block });
                continue;
            }
            translatedCount++;
            this.eventBus.emit('status', { message: `Перевожу блок ${translatedCount}/${total}...` });

            const newBlock = { ...block };
            if (block.type === 'heading') {
                newBlock.content = await translateHeading(block.content, targetLang, this.agent.apiKey, this.agent.model, this.agent.proxyUrl);
            } else {
                newBlock.content = await translateTextViaAPI(block.content, targetLang, this.agent.apiKey, this.agent.model, this.agent.proxyUrl);
            }
            translatedBlocks.push(newBlock);
        }

        const translatedText = blocksToYonoteMarkdown(translatedBlocks);

        this.eventBus.emit('status', { message: 'Создаю переведённую страницу...' });
        let colId = params.collection_id;
        if (!colId) {
            const colsResult = await this.yonote.collectionsList(1);
            const cols = colsResult.data || [];
            if (cols.length) colId = cols[0].id;
        }

        const createResult = await this.yonote.documentCreate(newTitle, translatedText, colId, null, true);
        const newDoc = createResult.data || {};

        return {
            tool: 'translate_document',
            result: {
                document: { id: newDoc.id, title: newDoc.title, url: this.yonote.fullUrl(newDoc.url || '') },
            },
        };
    }

    async _executeCopySection(params) {
        const docId = params.document_id;
        const heading = params.heading;
        const outputTitle = params.output_title || `Копия: ${heading}`;

        this.eventBus.emit('status', { message: 'Загружаю документ...' });
        const apiResult = await this.yonote.documentInfo(docId);
        const doc = apiResult.data || {};
        const text = doc.text || '';
        const sourceTitle = doc.title || '';
        const sourceUrl = this.yonote.fullUrl(doc.url || '');

        if (!text.trim()) {
            return {
                tool: 'copy_section',
                result: { message: `Документ «${sourceTitle}» не содержит текста.` },
            };
        }

        this.eventBus.emit('status', { message: 'Экспортирую полный контент...' });
        let richText = null;
        try { richText = await this.yonote.documentExportMarkdown(docId); } catch {}

        this.eventBus.emit('status', { message: `Ищу секцию «${heading}»...` });
        let section = null;
        if (richText) {
            section = extractSectionFromText(richText, heading);
            if (section) section = this._resolveExportUrls(section);
        }
        if (!section) {
            section = extractSectionFromText(text, heading);
            if (section) {
                section = this._resolveAttachmentRefs(section);
                const images = await this._fetchDocumentImages(docId, heading);
                if (images.length) section += '\n\n' + images.join('\n\n');
            }
        }

        if (!section) {
            return {
                tool: 'copy_section',
                result: { message: `Секция «${heading}» не найдена в документе «${sourceTitle}».` },
            };
        }

        this.eventBus.emit('status', { message: `Создаю страницу «${outputTitle}»...` });
        let colId = params.collection_id;

        const reportsPageId = this._getConfig('reports_page_id');
        let parentForOutput = params.parent_document_id || reportsPageId || null;
        if (parentForOutput) {
            try {
                const parentDoc = await this.yonote.documentInfo(parentForOutput);
                const parentData = parentDoc.data || {};
                parentForOutput = parentData.id || parentForOutput;
                if (!colId && parentData.collectionId) colId = parentData.collectionId;
            } catch {
                parentForOutput = await this._resolveDocumentId(parentForOutput);
            }
        }

        if (!colId) {
            const colsResult = await this.yonote.collectionsList(1);
            const cols = colsResult.data || [];
            if (cols.length) colId = cols[0].id;
        }

        const compiledText = section + `\n\n---\n*Источник: [${sourceTitle}](${sourceUrl})*`;
        const createResult = await this.yonote.documentCreate(
            outputTitle, compiledText, colId, parentForOutput, true
        );
        const newDoc = createResult.data || {};

        return {
            tool: 'copy_section',
            result: {
                document: { id: newDoc.id, title: newDoc.title, url: this.yonote.fullUrl(newDoc.url || '') },
                source_document: sourceTitle,
                heading,
            },
        };
    }

    async _executeExtractSections(params) {
        const parentDocId = params.parent_document_id;
        const headings = params.headings || (params.heading ? [params.heading] : []);
        const isMulti = headings.length > 1;
        const outputTitle = params.output_title || `Отчет: ${headings.map(h => this._capitalizeFirst(h)).join(', ')}`;
        const breadcrumbs = params.breadcrumbs || false;

        if (!headings.length) {
            return { tool: 'extract_sections', result: { message: 'Не указаны темы для поиска' } };
        }

        this.eventBus.emit('status', { message: 'Загружаю дочерние страницы...' });

        let resolvedParentId = parentDocId;
        let rootTitle = null;
        try {
            const rootDoc = await this.yonote.documentInfo(parentDocId);
            resolvedParentId = rootDoc?.data?.id || parentDocId;
            rootTitle = rootDoc?.data?.title;
            if (resolvedParentId !== parentDocId) {
                this._resolvedIds.set(parentDocId, resolvedParentId);
            }
        } catch {}

        const allPages = await this._fetchAllDescendants(resolvedParentId, breadcrumbs ? rootTitle : null);
        const total = allPages.length;

        if (total === 0) {
            return { tool: 'extract_sections', result: { message: 'Дочерних страниц не найдено' } };
        }

        this.eventBus.emit('status', { message: `Найдено ${total} страниц` });

        const foundByHeading = {};
        for (const h of headings) foundByHeading[h] = [];

        const emptyTextPages = [];
        const errorPages = [];
        let pagesWithNoMatch = 0;

        for (let i = 0; i < allPages.length; i++) {
            const page = allPages[i];
            const pageId = page.id;
            const pageTitle = page.title || 'Без названия';

            this.eventBus.emit('status', { message: `Читаю «${pageTitle}» (${i + 1}/${total})...` });

            try {
                const docResult = await this.yonote.documentInfo(pageId);
                const doc = docResult.data || {};
                const text = doc.text || '';

                if (!text.trim()) {
                    emptyTextPages.push(pageTitle);
                    continue;
                }

                const quickMatches = {};
                for (const h of headings) {
                    const section = extractSectionFromText(text, h);
                    if (section) quickMatches[h] = section;
                }

                if (!Object.keys(quickMatches).length) {
                    pagesWithNoMatch++;
                    continue;
                }

                let richText = null;
                try { richText = await this.yonote.documentExportMarkdown(pageId); } catch {}

                for (const h of headings) {
                    if (!quickMatches[h]) continue;

                    let section = quickMatches[h];
                    let richSection = null;
                    if (richText) richSection = extractSectionFromText(richText, h);

                    if (richSection) {
                        section = this._resolveExportUrls(richSection);
                    } else {
                        section = this._resolveAttachmentRefs(section);
                        const images = await this._fetchDocumentImages(pageId, h);
                        if (images.length) section += '\n\n' + images.join('\n\n');
                    }

                    foundByHeading[h].push({ page_title: pageTitle, path: page.path || [], content: section });
                }
            } catch (e) {
                errorPages.push(`${pageTitle}: ${e.message}`);
            }
        }

        const totalFound = Object.values(foundByHeading).reduce((sum, arr) => sum + arr.length, 0);

        if (totalFound === 0) {
            const headingsStr = headings.map(h => `«${h}»`).join(', ');
            return {
                tool: 'extract_sections',
                result: { message: `Секции ${headingsStr} не найдены ни в одном из ${total} документов` },
            };
        }

        this.eventBus.emit('status', { message: `Найдено ${totalFound} секций. Собираю отчёт...` });

        const compiledParts = [];

        if (isMulti) {
            const pageMap = new Map();
            for (const h of headings) {
                for (const section of (foundByHeading[h] || [])) {
                    if (!pageMap.has(section.page_title)) {
                        pageMap.set(section.page_title, { page_title: section.page_title, path: section.path, headingSections: [] });
                    }
                    pageMap.get(section.page_title).headingSections.push({ heading: h, content: section.content });
                }
            }

            let firstPage = true;
            for (const [, page] of pageMap) {
                if (!firstPage) {
                    compiledParts.push('', '---', '');
                }
                firstPage = false;

                compiledParts.push(`# ${page.page_title}`);
                if (breadcrumbs && page.path.length) {
                    compiledParts.push(`*${page.path.join(' → ')}*`);
                }
                compiledParts.push('');

                for (const { heading, content } of page.headingSections) {
                    compiledParts.push(`## ${this._capitalizeFirst(heading)}`);
                    compiledParts.push('');
                    compiledParts.push(content);
                    compiledParts.push('');
                }
            }
        } else {
            const sections = foundByHeading[headings[0]] || [];
            for (const section of sections) {
                compiledParts.push(`## ${section.page_title}`);
                if (breadcrumbs && section.path.length) {
                    compiledParts.push(`*${section.path.join(' → ')}*`);
                }
                compiledParts.push('');
                compiledParts.push(section.content);
                compiledParts.push('', '');
            }
        }

        const compiledText = compiledParts.join('\n').trim();

        this.eventBus.emit('status', { message: `Создаю страницу «${outputTitle}»...` });
        let colId = params.collection_id;

        const reportsPageId = this._getConfig('reports_page_id');
        let outputParentId = params.parent_output_document_id || reportsPageId || null;
        if (outputParentId) {
            try {
                const parentDoc = await this.yonote.documentInfo(outputParentId);
                const parentData = parentDoc.data || {};
                outputParentId = parentData.id || outputParentId;
                if (!colId && parentData.collectionId) colId = parentData.collectionId;
            } catch {
                outputParentId = await this._resolveDocumentId(outputParentId);
            }
        }

        if (!colId) {
            const colsResult = await this.yonote.collectionsList(1);
            const cols = colsResult.data || [];
            if (cols.length) colId = cols[0].id;
        }

        const createResult = await this.yonote.documentCreate(outputTitle, compiledText, colId, outputParentId, true);
        const newDoc = createResult.data || {};

        return {
            tool: 'extract_sections',
            result: {
                document: { id: newDoc.id, title: newDoc.title, url: this.yonote.fullUrl(newDoc.url || '') },
                sections_found: totalFound,
                total_children: total,
            },
        };
    }

    async _executeDeepSearch(params) {
        const query = (params.query || '').trim();
        const collectionId = params.collection_id;
        const parentDocumentId = params.parent_document_id || this._getConfig('default_search_page_id') || '';

        if (!query) {
            return { tool: 'deep_search', result: { documents: [], count: 0, message: 'Пустой запрос' } };
        }

        const queryLower = query.toLowerCase();
        const found = [];
        const seenIds = new Set();
        let totalScanned = 0;

        const makeSnippet = (text, qLower, qLen) => {
            const idx = text.toLowerCase().indexOf(qLower);
            if (idx < 0) return text.slice(0, 200).trim();
            const start = Math.max(0, idx - 60);
            const end = Math.min(text.length, idx + qLen + 100);
            let snippet = start > 0 ? '...' : '';
            snippet += text.slice(start, end).trim();
            if (end < text.length) snippet += '...';
            return snippet;
        };

        const checkDocument = (docId, docTitle, docUrl, text) => {
            totalScanned++;
            if (seenIds.has(docId)) return;
            if (!text || !text.trim()) return;
            if (text.toLowerCase().includes(queryLower)) {
                seenIds.add(docId);
                found.push({
                    id: docId,
                    title: docTitle,
                    url: docUrl ? this.yonote.fullUrl(docUrl) : '',
                    snippet: makeSnippet(text, queryLower, query.length),
                });
            }
        };

        if (parentDocumentId && !collectionId) {
            this.eventBus.emit('status', { message: 'Загружаю дочерние страницы...' });
            const resolvedParentId = await this._resolveDocumentId(parentDocumentId);
            const allDescendants = await this._fetchAllDescendants(resolvedParentId);
            const total = allDescendants.length;

            if (total === 0) {
                return { tool: 'deep_search', result: { documents: [], count: 0, message: 'Дочерних страниц не найдено' } };
            }

            this.eventBus.emit('status', { message: `Сканирую ${total} страниц...` });

            for (let i = 0; i < allDescendants.length; i++) {
                const page = allDescendants[i];
                if ((i + 1) % 10 === 0 || i === 0) {
                    this.eventBus.emit('status', { message: `Сканирую (${i + 1}/${total})...` });
                }

                try {
                    const docResult = await this.yonote.documentInfo(page.id);
                    const doc = docResult.data || {};
                    checkDocument(page.id, page.title, doc.url || '', doc.text || '');
                } catch {
                    try {
                        const richText = await this.yonote.documentExportMarkdown(page.id);
                        if (richText) checkDocument(page.id, page.title, '', richText);
                    } catch {}
                }
            }
        } else {
            this.eventBus.emit('status', { message: 'Загружаю коллекции...' });
            let collections;
            try {
                const colsResult = await this.yonote.collectionsList(100);
                collections = collectionId ? [{ id: collectionId }] : (colsResult.data || []);
            } catch (e) {
                return { tool: 'deep_search', result: { documents: [], count: 0, message: `Ошибка: ${e.message}` } };
            }

            for (const col of collections) {
                this.eventBus.emit('status', { message: `Сканирую коллекцию...` });
                try {
                    const result = await this.yonote.documentsList(col.id, null, 100);
                    const docs = result.data || [];
                    for (const doc of docs) {
                        checkDocument(doc.id, doc.title || '', doc.url || '', doc.text || '');
                    }
                } catch {}
            }
        }

        found.forEach((doc, i) => { doc.number = i + 1; });

        const result = { documents: found, count: found.length };
        if (!found.length) {
            result.note = `Глубокий поиск по «${query}» просканировал ${totalScanned} страниц — совпадений не найдено.`;
        }
        return { tool: 'deep_search', result };
    }

    // --- Helper methods ---

    async _fetchAllDescendants(parentId, rootTitle = null) {
        const allPages = [];
        const rootPath = rootTitle ? [rootTitle] : [];
        const queue = [[parentId, rootPath]];

        while (queue.length) {
            const [currentParent, parentPath] = queue.shift();
            let children;
            try {
                const result = await this.yonote.documentsList(null, currentParent, 100);
                children = result.data || [];
            } catch { continue; }

            for (const child of children) {
                const childTitle = child.title || 'Без названия';
                const childPath = [...parentPath, childTitle];
                allPages.push({ id: child.id, title: childTitle, path: childPath });
                queue.push([child.id, childPath]);
            }
        }

        return allPages;
    }

    async _fetchDocumentImages(documentId, heading = null) {
        let attachments;
        try {
            const result = await this.yonote.attachmentsList(documentId);
            attachments = result.data || [];
        } catch { return []; }

        const images = [];
        for (const att of attachments) {
            const contentType = att.contentType || '';
            if (!contentType.startsWith('image/')) continue;
            const name = att.name || 'image';
            const redirectUrl = att.redirectUrl || '';
            if (!redirectUrl) continue;

            if (heading) {
                const nameLower = name.replace(/\.\w+$/, '').toLowerCase();
                const headingLower = heading.toLowerCase().trim();
                const pattern = new RegExp('^#?' + this._escapeRegex(headingLower) + '(?:\\s*[-—]|\\s+|$)', 'i');
                if (!pattern.test(nameLower)) continue;
            }

            const fullUrl = this.yonote.fullUrl(redirectUrl);
            images.push(`![${name}](${fullUrl})`);
        }
        return images;
    }

    _capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    _escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    _formatTextForYonote(text) {
        if (!text) return text;
        const lines = text.split('\n');
        const resultLines = [];

        for (const line of lines) {
            const urls = line.match(/https?:\/\/\S+/g);
            if (urls && urls.length >= 2) {
                let remaining = line;
                const prefixParts = [];
                for (const url of urls) {
                    const idx = remaining.indexOf(url);
                    const before = remaining.slice(0, idx).trim();
                    if (before) prefixParts.push(before);
                    remaining = remaining.slice(idx + url.length);
                }
                const trailing = remaining.trim();

                if (prefixParts.length) {
                    resultLines.push(prefixParts.join(' '));
                    resultLines.push('');
                }
                for (const url of urls) {
                    const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
                    resultLines.push(`- [${cleanUrl}](${cleanUrl})`);
                }
                if (trailing) {
                    resultLines.push('');
                    resultLines.push(trailing);
                }
            } else {
                resultLines.push(line);
            }
        }
        return resultLines.join('\n');
    }

    _resolveAttachmentRefs(text) {
        if (!text) return text;
        return text.replace(
            /(!\[[^\]]*\])\(<attachment:([^>]+)>\)/g,
            (match, imgPrefix, uuid) => {
                const url = this.yonote.getAttachmentUrl(uuid);
                return `${imgPrefix}(${url})`;
            }
        );
    }

    _resolveExportUrls(text) {
        return text.replace(
            /!\[([^\]]*)\]\((\/api\/[^)]+)\)/g,
            (match, alt, url) => {
                const full = this.yonote.fullUrl(url);
                return `![${alt}](${full})`;
            }
        );
    }

    _buildResponse(allResults, responseTemplate) {
        let message = (responseTemplate || '').replace(/\{result\}/g, '').trim();
        if (!message) message = 'Готово!';

        const combined = { message };
        const seenDocIds = new Set();
        const allDocuments = [];
        let hasAnyDocument = false;

        for (const item of allResults) {
            const r = item.result || {};
            if (r.documents) {
                for (const doc of r.documents) {
                    const docId = doc.id;
                    if (docId && !seenDocIds.has(docId)) {
                        seenDocIds.add(docId);
                        allDocuments.push(doc);
                    }
                }
            }
            if (r.collections) combined.collections = r.collections;
            if (r.document) {
                combined.document = r.document;
                hasAnyDocument = true;
            }
        }

        if (message === 'Готово!' && !hasAnyDocument && !allDocuments.length) {
            const toolMessages = allResults
                .map(item => (item.result || {}).message)
                .filter(Boolean);
            if (toolMessages.length) {
                combined.message = toolMessages.join('\n');
            }
        }

        if (allDocuments.length) {
            allDocuments.forEach((doc, i) => { doc.number = i + 1; });
            combined.documents = allDocuments;
        }

        return combined;
    }
}
