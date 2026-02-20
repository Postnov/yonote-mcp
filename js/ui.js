/**
 * UI module — report generation interface with history sidebar.
 * Loads tags from Yonote, lets user pick one, runs extract_sections.
 */

let _executor = null;
let _eventBus = null;
let _config = null;
let _yonote = null;
let _selectedTags = new Set();
let _isProcessing = false;
let _history = [];
let _currentProjectId = null;

// DOM refs
let tagsGrid, actionSection, btnCreateReport, progressSection, resultSection, historyList;

// --- Utilities ---

export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function extractDocumentId(value) {
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

const MONTHS_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

export function formatReportDate(date) {
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

export function formatReportTitle(tagOrTags, date) {
    const tags = Array.isArray(tagOrTags) ? tagOrTags : [tagOrTags];
    return `Отчет: ${tags.map(capitalizeFirst).join(', ')} — ${formatReportDate(date)}`;
}

function scrollToBottom() {
    const main = document.querySelector('.main-content');
    if (main) main.scrollTop = main.scrollHeight;
}

// --- Timeline ---

export function getOrCreateTimeline(container) {
    let timeline = container.querySelector('.steps-timeline');
    if (!timeline) {
        timeline = document.createElement('div');
        timeline.className = 'steps-timeline';
        const header = document.createElement('div');
        header.className = 'steps-header';
        header.innerHTML = `
            <div class="steps-current"></div>
            <div class="steps-toggle">
                <span class="steps-counter"></span>
                <svg class="steps-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
        `;
        header.addEventListener('click', () => timeline.classList.toggle('collapsed'));
        timeline.appendChild(header);
        const history = document.createElement('div');
        history.className = 'steps-history';
        timeline.appendChild(history);
        container.appendChild(timeline);
    }
    return timeline;
}

export function updateTimelineHeader(timeline) {
    const history = timeline.querySelector('.steps-history');
    const currentEl = timeline.querySelector('.steps-current');
    const counterEl = timeline.querySelector('.steps-counter');
    if (!history || !currentEl || !counterEl) return;
    const allSteps = history.querySelectorAll('.step-item');
    const lastStep = allSteps[allSteps.length - 1];
    if (lastStep) {
        currentEl.innerHTML = lastStep.innerHTML;
        currentEl.className = 'steps-current ' + lastStep.className.replace('step-item', '').trim();
    }
    const completedCount = history.querySelectorAll('.step-item.completed').length;
    if (completedCount > 0) { counterEl.textContent = completedCount; counterEl.style.display = ''; }
    else counterEl.style.display = 'none';
}

export function completeActiveStep(timeline) {
    const history = timeline.querySelector('.steps-history');
    if (!history) return;
    const active = history.querySelector('.step-item.active');
    if (active) {
        active.classList.remove('active');
        active.classList.add('completed');
        const icon = active.querySelector('.step-icon');
        if (icon) icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        const startTime = parseInt(active.dataset.startTime, 10);
        if (startTime) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const timeEl = active.querySelector('.step-time');
            if (timeEl) timeEl.textContent = `${elapsed}s`;
        }
    }
}

export function addStep(timeline, message) {
    completeActiveStep(timeline);
    const history = timeline.querySelector('.steps-history');
    const step = document.createElement('div');
    step.className = 'step-item active';
    step.dataset.startTime = Date.now().toString();
    step.innerHTML = `
        <div class="step-icon"><span class="step-spinner"></span></div>
        <span class="step-text">${escapeHtml(message)}</span>
        <span class="step-time"></span>
    `;
    history.appendChild(step);
    updateTimelineHeader(timeline);
}

export function completeTimeline(container) {
    const timeline = container.querySelector('.steps-timeline');
    if (timeline) {
        completeActiveStep(timeline);
        timeline.classList.add('done');
        updateTimelineHeader(timeline);
    }
}

export function errorTimeline(container, message) {
    const timeline = container.querySelector('.steps-timeline');
    if (timeline) {
        const history = timeline.querySelector('.steps-history');
        if (history) {
            const active = history.querySelector('.step-item.active');
            if (active) {
                active.classList.remove('active');
                active.classList.add('error');
                const icon = active.querySelector('.step-icon');
                if (icon) icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
            }
            updateTimelineHeader(timeline);
        }
    }
}

// --- Tag Parsing ---

export function parseTags(text) {
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

// --- Tag Rendering ---

function renderTags(tags) {
    tagsGrid.innerHTML = '';
    if (!tags.length) {
        tagsGrid.innerHTML = `
            <div class="tags-error">
                <div class="tags-error-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                        <line x1="7" y1="7" x2="7.01" y2="7"/>
                    </svg>
                </div>
                <div>Теги не найдены</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Укажите страницу с тегами в настройках</div>
            </div>
        `;
        return;
    }

    for (const tag of tags) {
        const chip = document.createElement('button');
        chip.className = 'tag-chip';
        chip.textContent = `#${tag}`;
        chip.dataset.tag = tag;
        chip.addEventListener('click', () => selectTag(tag));
        tagsGrid.appendChild(chip);
    }
}

function selectTag(tagName) {
    if (_isProcessing) return;

    // Toggle selection
    if (_selectedTags.has(tagName)) {
        _selectedTags.delete(tagName);
    } else {
        _selectedTags.add(tagName);
    }

    // Update chip styles
    const chips = tagsGrid.querySelectorAll('.tag-chip');
    for (const chip of chips) {
        if (_selectedTags.has(chip.dataset.tag)) {
            chip.classList.add('selected');
        } else {
            chip.classList.remove('selected');
        }
    }

    updateActionButton();
}

function updateActionButton() {
    const count = _selectedTags.size;
    if (count === 0) {
        actionSection.style.display = 'none';
        return;
    }

    actionSection.style.display = '';
    const tags = Array.from(_selectedTags);

    if (count === 1) {
        btnCreateReport.textContent = `Создать отчёт по «${tags[0]}»`;
    } else if (count <= 3) {
        const names = tags.map(t => `«${t}»`).join(', ');
        btnCreateReport.textContent = `Создать отчёт по ${names}`;
    } else {
        btnCreateReport.textContent = `Создать отчёт по ${count} темам`;
    }

    progressSection.innerHTML = '';
    resultSection.innerHTML = '';
}

// --- Load Tags ---

async function loadAndRenderTags() {
    const tagsPageId = _config.get('tags_page_id');
    if (!tagsPageId) {
        tagsGrid.innerHTML = `
            <div class="tags-error">
                <div class="tags-error-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                </div>
                <div>Укажите страницу с тегами</div>
                <button class="tags-error-action" id="btnOpenSettingsFromTags">Открыть настройки</button>
            </div>
        `;
        const btn = document.getElementById('btnOpenSettingsFromTags');
        if (btn) {
            btn.addEventListener('click', () => {
                showSettingsModal(_config, () => window.location.reload());
            });
        }
        return;
    }

    try {
        const result = await _yonote.documentInfo(tagsPageId);
        const doc = result.data || {};
        const text = doc.text || '';
        const tags = parseTags(text);
        renderTags(tags);
    } catch (e) {
        tagsGrid.innerHTML = `
            <div class="tags-error">
                <div class="tags-error-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                </div>
                <div>Ошибка загрузки тегов</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${escapeHtml(e.message)}</div>
            </div>
        `;
    }
}

// --- History Management ---

export function getHistoryKey(projectId) {
    if (projectId) return `yonote_report_history_${projectId}`;
    return 'yonote_report_history';
}

function loadHistory() {
    try {
        const key = getHistoryKey(_currentProjectId);
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch { return []; }
}

function saveHistory() {
    try {
        const key = getHistoryKey(_currentProjectId);
        window.localStorage.setItem(key, JSON.stringify(_history));
    } catch {}
}

function addToHistory(entry) {
    _history.unshift(entry);
    saveHistory();
    renderHistory();
}

function renameHistoryItem(id, newLabel) {
    const item = _history.find(h => h.id === id);
    if (item && newLabel.trim()) {
        item.label = newLabel.trim();
        saveHistory();
        renderHistory();
    }
}

function renderHistory() {
    if (!historyList) return;
    historyList.innerHTML = '';

    if (!_history.length) {
        historyList.innerHTML = '<div class="history-empty">Созданные отчёты будут отображаться здесь</div>';
        return;
    }

    for (const entry of _history) {
        const item = document.createElement('div');
        item.className = 'history-item';

        item.innerHTML = `
            <div class="history-item-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
            </div>
            <div class="history-item-body">
                <div class="history-item-label">${escapeHtml(entry.label)}</div>
                <div class="history-item-date">${escapeHtml(entry.dateFormatted || '')}</div>
            </div>
            <div class="history-item-actions">
                <button class="history-action-btn history-rename-btn" title="Переименовать">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
            </div>
        `;

        // Click on item → open in Yonote
        item.addEventListener('click', (e) => {
            if (e.target.closest('.history-rename-btn') || e.target.closest('.history-rename-input')) return;
            if (entry.url) window.open(entry.url, '_blank');
        });

        // Rename button
        const renameBtn = item.querySelector('.history-rename-btn');
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startRename(entry.id, item);
        });

        historyList.appendChild(item);
    }
}

function startRename(id, itemEl) {
    const entry = _history.find(h => h.id === id);
    if (!entry) return;
    if (itemEl.querySelector('.history-rename-input')) return;

    const labelEl = itemEl.querySelector('.history-item-label');
    if (!labelEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'history-rename-input';
    input.value = entry.label;

    labelEl.style.display = 'none';
    labelEl.parentNode.insertBefore(input, labelEl);

    const finish = () => {
        const val = input.value.trim();
        if (val && val !== entry.label) {
            renameHistoryItem(id, val);
        } else {
            labelEl.style.display = '';
            input.remove();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(); }
        else if (e.key === 'Escape') { e.preventDefault(); labelEl.style.display = ''; input.remove(); }
    });
    input.addEventListener('blur', () => {
        setTimeout(() => { if (document.body.contains(input)) finish(); }, 100);
    });

    input.focus();
    input.select();
}

// --- Report Generation ---

export async function startReport() {
    if (_isProcessing || !_selectedTags.size) return;
    _isProcessing = true;

    const searchPageId = _config.get('default_search_page_id');
    if (!searchPageId) {
        showReportError('Укажите «Страницу для поиска» в настройках');
        _isProcessing = false;
        return;
    }

    // Disable UI
    btnCreateReport.disabled = true;
    const chips = tagsGrid.querySelectorAll('.tag-chip');
    chips.forEach(c => c.style.pointerEvents = 'none');

    // Clear previous results
    progressSection.innerHTML = '';
    resultSection.innerHTML = '';

    const tags = Array.from(_selectedTags);
    const now = new Date();
    const outputTitle = formatReportTitle(tags, now);

    // Subscribe to status events
    const statusHandler = (data) => {
        const timeline = getOrCreateTimeline(progressSection);
        addStep(timeline, data.message);
        scrollToBottom();
    };
    _eventBus.on('status', statusHandler);

    try {
        const result = await _executor._executeExtractSections({
            parent_document_id: searchPageId,
            headings: tags,
            output_title: outputTitle,
            breadcrumbs: true,
        });

        completeTimeline(progressSection);

        const r = result?.result || {};
        if (r.document) {
            showReportResult(r);
            // Add to history
            addToHistory({
                id: Date.now().toString(),
                label: tags.map(t => `#${t}`).join(', '),
                tags,
                title: r.document.title || outputTitle,
                url: r.document.url || '',
                date: now.toISOString(),
                dateFormatted: formatReportDate(now),
                sectionsFound: r.sections_found || 0,
                totalChildren: r.total_children || 0,
            });
        } else {
            showReportError(r.message || 'Секции не найдены');
        }
    } catch (e) {
        errorTimeline(progressSection, e.message);
        showReportError(`Ошибка: ${e.message}`);
    } finally {
        _eventBus.off('status', statusHandler);
        btnCreateReport.disabled = false;
        chips.forEach(c => c.style.pointerEvents = '');
        _isProcessing = false;
    }
}

function showReportResult(result) {
    const doc = result.document || {};
    const sectionsFound = result.sections_found || 0;
    const totalChildren = result.total_children || 0;
    const headingsFound = result.headings_found || {};

    let metaText = `«${escapeHtml(doc.title || '')}» — ${sectionsFound} из ${totalChildren} страниц`;

    // Show per-heading breakdown if multi-heading
    const headingKeys = Object.keys(headingsFound);
    if (headingKeys.length > 1) {
        const breakdown = headingKeys
            .filter(h => headingsFound[h] > 0)
            .map(h => `${h}: ${headingsFound[h]}`)
            .join(', ');
        if (breakdown) metaText += ` (${breakdown})`;
    }

    resultSection.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'result-card-success';
    card.innerHTML = `
        <div class="result-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span class="result-title">Отчёт создан</span>
        </div>
        <div class="result-meta">${metaText}</div>
        <a class="btn-open-report" href="${escapeHtml(doc.url || '#')}" target="_blank">
            Открыть в Yonote
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
        </a>
    `;
    resultSection.appendChild(card);
    scrollToBottom();
}

function showReportError(message) {
    resultSection.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'result-card-error';
    card.innerHTML = `
        <div class="result-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span class="result-title">Не удалось создать отчёт</span>
        </div>
        <div class="result-message">${escapeHtml(message)}</div>
    `;
    resultSection.appendChild(card);
    scrollToBottom();
}

// --- Settings Modal ---

export function showSettingsModal(config, onSaveCallback) {
    const existing = document.getElementById('settingsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'settings-modal-overlay';
    modal.innerHTML = `
        <div class="settings-modal">
            <div class="settings-modal-header">
                <h2>Настройки</h2>
                <p class="settings-modal-subtitle">API-ключи для подключения к сервисам</p>
            </div>
            <div class="settings-modal-body">
                <div class="settings-field">
                    <label for="settingYonoteToken">Yonote API Token</label>
                    <input type="password" id="settingYonoteToken" placeholder="0Amn3Uo..." value="${escapeHtml(config.get('yonote_api_token'))}">
                </div>
                <div class="settings-field">
                    <label for="settingYonoteUrl">Yonote Base URL</label>
                    <input type="text" id="settingYonoteUrl" placeholder="https://app.yonote.ru/api" value="${escapeHtml(config.get('yonote_base_url') || 'https://app.yonote.ru/api')}">
                </div>
                <div class="settings-field">
                    <label for="settingDeepseekKey">DeepSeek API Key</label>
                    <input type="password" id="settingDeepseekKey" placeholder="sk-..." value="${escapeHtml(config.get('deepseek_api_key'))}">
                </div>
            </div>
            <div class="settings-modal-footer">
                <button class="btn-settings-save" id="btnSettingsSave">Сохранить</button>
            </div>
            <div class="settings-modal-error" id="settingsError" style="display:none"></div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnSettingsSave').addEventListener('click', async () => {
        const token = document.getElementById('settingYonoteToken').value.trim();
        const url = document.getElementById('settingYonoteUrl').value.trim();
        const key = document.getElementById('settingDeepseekKey').value.trim();
        const errorEl = document.getElementById('settingsError');

        if (!token) {
            errorEl.textContent = 'Введите Yonote API Token';
            errorEl.style.display = 'block';
            return;
        }

        try {
            await config.save('yonote_api_token', token);
            await config.save('yonote_base_url', url || 'https://app.yonote.ru/api');
            await config.save('deepseek_api_key', key);
            modal.remove();
            if (onSaveCallback) onSaveCallback();
        } catch (e) {
            errorEl.textContent = `Ошибка сохранения: ${e.message}`;
            errorEl.style.display = 'block';
        }
    });
}

// --- Projects View ---

const MONTHS_RU_SHORT = [
    'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'
];

function formatProjectDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return `${d.getDate()} ${MONTHS_RU_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function countProjectSettings(data) {
    if (!data) return 0;
    let count = 0;
    if (data.tags_page_id) count++;
    if (data.default_search_page_id) count++;
    if (data.reports_page_id) count++;
    return count;
}

export function renderProjectsView(projects, { onCreate, onEdit, onDelete, onOpen }) {
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (const project of projects) {
        const card = document.createElement('div');
        card.className = 'project-card';
        const settingsCount = countProjectSettings(project.data);
        const dateStr = formatProjectDate(project.created_at);

        card.innerHTML = `
            <div class="project-card-actions">
                <button class="project-action-btn edit-btn" title="Редактировать">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="project-action-btn danger delete-btn" title="Удалить">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
            <div class="project-card-name">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                ${escapeHtml(project.name)}
            </div>
            <div class="project-card-meta">
                ${settingsCount ? `${settingsCount} ${settingsCount === 1 ? 'настройка' : settingsCount < 5 ? 'настройки' : 'настроек'}` : 'Нет настроек'}
                ${dateStr ? ` &middot; ${dateStr}` : ''}
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.edit-btn') || e.target.closest('.delete-btn')) return;
            onOpen(project);
        });

        card.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onEdit(project);
        });

        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(project);
        });

        grid.appendChild(card);
    }

    // Add "new project" card
    const newCard = document.createElement('div');
    newCard.className = 'project-card project-card-new';
    newCard.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Новый проект</span>
    `;
    newCard.addEventListener('click', () => onCreate());
    grid.appendChild(newCard);
}

export function showProjectModal(project, onSave) {
    const existing = document.getElementById('projectModal');
    if (existing) existing.remove();

    const isEdit = !!project;
    const data = project?.data || {};

    const modal = document.createElement('div');
    modal.id = 'projectModal';
    modal.className = 'project-modal-overlay';
    modal.innerHTML = `
        <div class="project-modal">
            <div class="project-modal-header">
                <h2>${isEdit ? 'Редактировать проект' : 'Новый проект'}</h2>
                <p>${isEdit ? 'Измените настройки проекта' : 'Создайте проект с рабочими страницами'}</p>
            </div>
            <div class="project-modal-body">
                <div class="settings-field">
                    <label for="projectName">Название проекта</label>
                    <input type="text" id="projectName" placeholder="Мой проект" value="${escapeHtml(project?.name || '')}">
                </div>

                <div class="settings-section-divider">
                    <div class="settings-section-title">Рабочие страницы</div>
                    <div class="settings-section-subtitle">Укажите ссылки на страницы Yonote или их ID</div>
                </div>

                <div class="settings-field">
                    <label for="projectTagsPage">Страница с тегами</label>
                    <input type="text" id="projectTagsPage" placeholder="https://app.yonote.ru/doc/... или ID" value="${escapeHtml(data.tags_page_id || '')}">
                    <div class="settings-field-hint">Страница со списком тегов (каждый тег начинается с #)</div>
                </div>
                <div class="settings-field">
                    <label for="projectSearchPage">Страница для поиска</label>
                    <input type="text" id="projectSearchPage" placeholder="https://app.yonote.ru/doc/... или ID" value="${escapeHtml(data.default_search_page_id || '')}">
                    <div class="settings-field-hint">Родительская страница, дочерние документы которой сканируются для отчёта</div>
                </div>
                <div class="settings-field">
                    <label for="projectReportsPage">Страница для отчетов</label>
                    <input type="text" id="projectReportsPage" placeholder="https://app.yonote.ru/doc/... или ID" value="${escapeHtml(data.reports_page_id || '')}">
                    <div class="settings-field-hint">Родительская страница, внутри которой будут создаваться отчеты</div>
                </div>
            </div>
            <div class="project-modal-footer">
                <button class="btn-secondary" id="btnProjectCancel">Отмена</button>
                <button class="btn-primary" id="btnProjectSave">Сохранить</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnProjectCancel').addEventListener('click', () => modal.remove());

    document.getElementById('btnProjectSave').addEventListener('click', async () => {
        const name = document.getElementById('projectName').value.trim() || 'Без названия';
        const tagsPage = document.getElementById('projectTagsPage').value.trim();
        const searchPage = document.getElementById('projectSearchPage').value.trim();
        const reportsPage = document.getElementById('projectReportsPage').value.trim();

        const projectData = {
            tags_page_id: extractDocumentId(tagsPage),
            default_search_page_id: extractDocumentId(searchPage),
            reports_page_id: extractDocumentId(reportsPage),
        };

        modal.remove();
        await onSave(name, projectData);
    });

    // Focus the name field
    setTimeout(() => document.getElementById('projectName')?.focus(), 100);
}

export function showDeleteConfirm(projectName, onConfirm) {
    const existing = document.getElementById('deleteConfirmModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'deleteConfirmModal';
    modal.className = 'project-modal-overlay';
    modal.innerHTML = `
        <div class="project-modal">
            <div class="project-modal-header">
                <h2>Удалить проект</h2>
            </div>
            <div class="project-modal-body">
                <div class="delete-confirm-text">
                    Вы уверены, что хотите удалить проект <span class="delete-confirm-name">${escapeHtml(projectName)}</span>?
                    Это действие нельзя отменить.
                </div>
            </div>
            <div class="project-modal-footer">
                <button class="btn-secondary" id="btnDeleteCancel">Отмена</button>
                <button class="btn-danger" id="btnDeleteConfirm">Удалить</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btnDeleteCancel').addEventListener('click', () => modal.remove());
    document.getElementById('btnDeleteConfirm').addEventListener('click', () => {
        modal.remove();
        onConfirm();
    });
}

// --- Main init ---

export function initReportView(executor, eventBus, config, yonote, projectId) {
    _executor = executor;
    _eventBus = eventBus;
    _config = config;
    _yonote = yonote;
    _currentProjectId = projectId || null;
    _selectedTags = new Set();
    _isProcessing = false;

    tagsGrid = document.getElementById('tagsGrid');
    actionSection = document.getElementById('actionSection');
    btnCreateReport = document.getElementById('btnCreateReport');
    progressSection = document.getElementById('progressSection');
    resultSection = document.getElementById('resultSection');
    historyList = document.getElementById('historyList');

    // Reset UI state
    if (actionSection) actionSection.style.display = 'none';
    if (progressSection) progressSection.innerHTML = '';
    if (resultSection) resultSection.innerHTML = '';
    if (tagsGrid) tagsGrid.innerHTML = `
        <div class="tags-loading">
            <div class="tag-skeleton"></div>
            <div class="tag-skeleton"></div>
            <div class="tag-skeleton"></div>
            <div class="tag-skeleton"></div>
            <div class="tag-skeleton"></div>
        </div>
    `;

    // Load history
    _history = loadHistory();
    renderHistory();

    // Create report button
    if (btnCreateReport) {
        const newBtn = btnCreateReport.cloneNode(true);
        btnCreateReport.parentNode.replaceChild(newBtn, btnCreateReport);
        btnCreateReport = newBtn;
        btnCreateReport.addEventListener('click', () => {
            if (_selectedTags.size) startReport();
        });
    }

    // Load tags
    loadAndRenderTags();
}

// Keep backward compat alias
export const initUI = initReportView;
