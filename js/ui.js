/**
 * UI module — refactored from static/app.js.
 * No more fetch() to Flask — uses ToolExecutor + EventBus instead.
 */

const STORAGE_KEY = 'yonote_chat_history';
const STORAGE_VERSION = 1;

let chatHistory = [];
let currentChatId = null;
let isProcessing = false;
let _executor = null;
let _eventBus = null;
let _agent = null;
let _config = null;

// DOM refs (set in initUI)
let chatForm, chatInput, chatMessages, welcomeScreen, btnNewChat, chatList, btnSend;

function isLocalStorageAvailable() {
    try {
        const k = '__storage_test__';
        window.localStorage.setItem(k, k);
        window.localStorage.removeItem(k);
        return true;
    } catch { return false; }
}

function saveChats() {
    if (!isLocalStorageAvailable()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, chats: chatHistory }));
    } catch {}
}

function loadChats() {
    if (!isLocalStorageAvailable()) return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (!data.version || data.version !== STORAGE_VERSION) return [];
        return Array.isArray(data.chats) ? data.chats : [];
    } catch { return []; }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideWelcome() {
    if (welcomeScreen) welcomeScreen.style.display = 'none';
}

function ensureChat(firstMessage) {
    if (!currentChatId) {
        currentChatId = Date.now().toString();
        const label = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
        chatHistory.push({ id: currentChatId, label, messages: [] });
        renderChatList();
        saveChats();
    }
}

function startNewChat() {
    currentChatId = null;
    chatMessages.innerHTML = '';
    if (welcomeScreen) {
        chatMessages.appendChild(welcomeScreen);
        welcomeScreen.style.display = '';
    }
    chatInput.value = '';
    chatInput.focus();
    renderChatList();
    if (_agent) _agent.reset();
    if (_executor) _executor.pendingActions = null;
}

function renderChatList() {
    chatList.innerHTML = '';
    chatHistory.slice().reverse().forEach(chat => {
        const item = document.createElement('div');
        item.className = 'chat-list-item' + (chat.id === currentChatId ? ' active' : '');
        item.innerHTML = `
            <svg class="chat-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="chat-label">${escapeHtml(chat.label)}</span>
            <div class="chat-item-actions">
                <button class="chat-edit-btn" title="Переименовать">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="chat-delete-btn" title="Удалить">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </div>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.closest('.chat-edit-btn') || e.target.closest('.chat-delete-btn')) return;
            loadChat(chat.id);
        });

        const editBtn = item.querySelector('.chat-edit-btn');
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); startRenameChat(chat.id); });

        const deleteBtn = item.querySelector('.chat-delete-btn');
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); showDeleteConfirm(chat.id); });

        chatList.appendChild(item);
    });
}

function startRenameChat(chatId) {
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;
    const items = chatList.querySelectorAll('.chat-list-item');
    let targetItem = null;
    items.forEach(item => {
        const label = item.querySelector('.chat-label');
        if (label && label.textContent === chat.label) targetItem = item;
    });
    if (!targetItem || targetItem.querySelector('.chat-rename-input')) return;
    const labelSpan = targetItem.querySelector('.chat-label');
    if (!labelSpan) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-rename-input';
    input.value = chat.label;
    input.style.width = (labelSpan.getBoundingClientRect().width + 10) + 'px';

    labelSpan.style.display = 'none';
    labelSpan.parentNode.insertBefore(input, labelSpan.nextSibling);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finishRename(chatId, input.value); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
    });
    input.addEventListener('blur', () => {
        setTimeout(() => { if (document.body.contains(input)) finishRename(chatId, input.value); }, 100);
    });
    input.focus();
    input.select();
}

function finishRename(chatId, newLabel) {
    const trimmed = newLabel.trim();
    if (!trimmed) { cancelRename(); return; }
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) { cancelRename(); return; }
    chat.label = trimmed;
    saveChats();
    renderChatList();
}

function cancelRename() {
    chatList.querySelectorAll('.chat-rename-input').forEach(input => {
        const labelSpan = input.previousElementSibling;
        if (labelSpan && labelSpan.classList.contains('chat-label')) labelSpan.style.display = '';
        input.remove();
    });
}

function showDeleteConfirm(chatId) {
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;
    const items = chatList.querySelectorAll('.chat-list-item');
    let targetItem = null;
    items.forEach(item => {
        const label = item.querySelector('.chat-label');
        if (label && label.textContent === chat.label) targetItem = item;
    });
    if (!targetItem || targetItem.querySelector('.chat-delete-confirm')) return;

    const originalContent = targetItem.innerHTML;
    targetItem.innerHTML = `
        <div class="chat-delete-confirm" data-chat-id="${chatId}">
            <span class="delete-confirm-text">Удалить?</span>
            <div class="delete-confirm-actions">
                <button class="delete-confirm-btn delete-confirm-yes">Удалить</button>
                <button class="delete-confirm-btn delete-confirm-no">Отмена</button>
            </div>
        </div>
    `;
    targetItem.dataset.originalContent = originalContent;

    targetItem.querySelector('.delete-confirm-yes').addEventListener('click', (e) => { e.stopPropagation(); deleteChat(chatId); });
    targetItem.querySelector('.delete-confirm-no').addEventListener('click', (e) => { e.stopPropagation(); renderChatList(); });
}

function deleteChat(chatId) {
    const idx = chatHistory.findIndex(c => c.id === chatId);
    if (idx === -1) return;
    chatHistory.splice(idx, 1);
    saveChats();
    if (currentChatId === chatId) {
        currentChatId = null;
        chatMessages.innerHTML = '';
        if (welcomeScreen) { chatMessages.appendChild(welcomeScreen); welcomeScreen.style.display = ''; }
        chatInput.value = '';
        chatInput.focus();
        if (_agent) _agent.reset();
    }
    renderChatList();
}

function loadChat(chatId) {
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;
    currentChatId = chatId;
    hideWelcome();
    chatMessages.innerHTML = '';
    chat.messages.forEach(msg => {
        if (msg.type === 'user') {
            addUserMessage(msg.text, false);
        } else {
            const div = document.createElement('div');
            div.innerHTML = msg.html;
            chatMessages.appendChild(div.firstElementChild);
        }
    });
    renderChatList();
    scrollToBottom();
}

function addUserMessage(text, save = true) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `
        <div class="message-avatar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        </div>
        <div class="message-content">
            <div class="message-text">${escapeHtml(text)}</div>
        </div>
    `;
    chatMessages.appendChild(msg);
    scrollToBottom();
    if (save) {
        const chat = chatHistory.find(c => c.id === currentChatId);
        if (chat) { chat.messages.push({ type: 'user', text }); saveChats(); }
    }
}

function addAssistantMessage() {
    const msg = document.createElement('div');
    msg.className = 'message assistant';
    msg.innerHTML = `
        <div class="message-avatar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
            </svg>
        </div>
        <div class="message-content"></div>
    `;
    chatMessages.appendChild(msg);
    scrollToBottom();
    return msg.querySelector('.message-content');
}

// --- Timeline ---

function getOrCreateTimeline(container) {
    let timeline = container.querySelector('.steps-timeline');
    if (!timeline) {
        timeline = document.createElement('div');
        timeline.className = 'steps-timeline collapsed';
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

function updateTimelineHeader(timeline) {
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

function completeActiveStep(timeline) {
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

function addStep(timeline, message) {
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

function completeTimeline(container) {
    const timeline = container.querySelector('.steps-timeline');
    if (timeline) {
        completeActiveStep(timeline);
        timeline.classList.add('done');
        updateTimelineHeader(timeline);
    }
}

function errorTimeline(container, message) {
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
    const errDiv = document.createElement('div');
    errDiv.className = 'error-message';
    errDiv.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        ${escapeHtml(message)}
    `;
    container.appendChild(errDiv);
}

// --- Event handling ---

function handleEvent(eventType, data, container) {
    if (eventType === 'status') {
        const timeline = getOrCreateTimeline(container);
        addStep(timeline, data.message);
        scrollToBottom();
    }
    if (eventType === 'result') {
        completeTimeline(container);
        renderResult(data, container);
        scrollToBottom();
    }
    if (eventType === 'confirm') {
        completeTimeline(container);
        renderConfirm(data, container);
        scrollToBottom();
    }
    if (eventType === 'error') {
        errorTimeline(container, data.message);
        scrollToBottom();
    }
    if (eventType === 'done') {
        completeTimeline(container);
        finishProcessing(container);
    }
}

function renderResult(data, container) {
    if (data.message) {
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = data.message;
        container.appendChild(text);
    }

    if (data.documents && data.documents.length > 0) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `<div class="result-card-header">Документы <span class="badge">${data.documents.length}</span></div>`;
        data.documents.forEach((doc, idx) => {
            const item = document.createElement('div');
            item.className = 'doc-item';
            const num = idx + 1;
            const preview = doc.text ? `<div class="doc-preview">${escapeHtml(doc.text.substring(0, 100))}</div>` : '';
            const link = doc.url ? `<a class="doc-link" href="${escapeHtml(doc.url)}" target="_blank">Открыть</a>` : '';
            item.innerHTML = `
                <div class="doc-item-body">
                    <span class="doc-number">${num}</span>
                    <div>
                        <div class="doc-title">${escapeHtml(doc.title || 'Без названия')}</div>
                        ${preview}
                    </div>
                </div>
                ${link}
            `;
            card.appendChild(item);
        });
        container.appendChild(card);
    }

    if (data.collections && data.collections.length > 0) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `<div class="result-card-header">Коллекции <span class="badge">${data.collections.length}</span></div>`;
        data.collections.forEach(col => {
            const item = document.createElement('div');
            item.className = 'doc-item';
            item.innerHTML = `<div><div class="doc-title">${escapeHtml(col.name || 'Без названия')}</div></div>`;
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => {
                chatInput.value = `Покажи документы в коллекции ${col.name}`;
                chatForm.dispatchEvent(new Event('submit'));
            });
            card.appendChild(item);
        });
        container.appendChild(card);
    }

    if (data.document && data.document.text) {
        const detail = document.createElement('div');
        detail.className = 'doc-detail';
        const link = data.document.url ? `<a class="doc-link" href="${escapeHtml(data.document.url)}" target="_blank">Открыть в Yonote</a>` : '';
        const fullText = data.document.text;
        const maxLen = 300;
        const needsTruncate = fullText.length > maxLen;
        const displayText = needsTruncate ? fullText.substring(0, maxLen) + '...' : fullText;
        detail.innerHTML = `
            <div class="doc-detail-title">${escapeHtml(data.document.title || 'Без названия')} ${link}</div>
            <div class="doc-detail-content">${escapeHtml(displayText)}</div>
        `;
        if (needsTruncate) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn-show-more';
            toggleBtn.textContent = 'Показать полностью';
            let expanded = false;
            toggleBtn.addEventListener('click', () => {
                expanded = !expanded;
                detail.querySelector('.doc-detail-content').textContent = expanded ? fullText : displayText;
                toggleBtn.textContent = expanded ? 'Свернуть' : 'Показать полностью';
            });
            detail.appendChild(toggleBtn);
        }
        container.appendChild(detail);
    }

    if (data.document && !data.document.text && data.document.title) {
        const info = document.createElement('div');
        info.className = 'result-card';
        const link = data.document.url ? `<a class="doc-link" href="${escapeHtml(data.document.url)}" target="_blank">Открыть в Yonote</a>` : '';
        info.innerHTML = `<div class="doc-item"><div><div class="doc-title">${escapeHtml(data.document.title)}</div></div>${link}</div>`;
        container.appendChild(info);
    }
}

function renderConfirm(data, container) {
    if (data.message) {
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = data.message;
        container.appendChild(text);
    }
    const btns = document.createElement('div');
    btns.className = 'confirm-buttons';

    const btnYes = document.createElement('button');
    btnYes.className = 'btn-confirm btn-confirm-yes';
    btnYes.textContent = 'Да, давай';

    const btnNo = document.createElement('button');
    btnNo.className = 'btn-confirm btn-confirm-no';
    btnNo.textContent = 'Отмена';

    btnYes.addEventListener('click', () => {
        btns.remove();
        const timeline = getOrCreateTimeline(container);
        addStep(timeline, 'Выполняю...');
        scrollToBottom();
        confirmAction(container);
    });

    btnNo.addEventListener('click', () => {
        btns.remove();
        const cancelled = document.createElement('div');
        cancelled.className = 'message-text text-muted';
        cancelled.textContent = 'Действие отменено.';
        container.appendChild(cancelled);
        _agent.addContext('user', 'Пользователь отменил действие.');
        finishProcessing(container);
    });

    btns.appendChild(btnYes);
    btns.appendChild(btnNo);
    container.appendChild(btns);
}

async function confirmAction(container) {
    isProcessing = true;
    btnSend.disabled = true;

    // Subscribe to events for this confirmation
    const handlers = {};
    for (const evt of ['status', 'result', 'confirm', 'error', 'done']) {
        handlers[evt] = (data) => handleEvent(evt, data, container);
        _eventBus.on(evt, handlers[evt]);
    }

    await _executor.executeConfirmedActions();

    // Unsubscribe
    for (const evt of Object.keys(handlers)) {
        _eventBus.off(evt, handlers[evt]);
    }
}

async function sendMessage(message) {
    isProcessing = true;
    btnSend.disabled = true;

    const container = addAssistantMessage();

    // Subscribe to events
    const handlers = {};
    for (const evt of ['status', 'result', 'confirm', 'error', 'done']) {
        handlers[evt] = (data) => handleEvent(evt, data, container);
        _eventBus.on(evt, handlers[evt]);
    }

    await _executor.processUserMessage(message);

    // Unsubscribe
    for (const evt of Object.keys(handlers)) {
        _eventBus.off(evt, handlers[evt]);
    }
}

function finishProcessing(container) {
    isProcessing = false;
    btnSend.disabled = false;
    chatInput.focus();
    const chat = chatHistory.find(c => c.id === currentChatId);
    if (chat && container) {
        const msgEl = container.closest('.message');
        if (msgEl) {
            chat.messages.push({ type: 'assistant', html: msgEl.outerHTML });
            saveChats();
        }
    }
}

// --- Settings Modal ---

export function showSettingsModal(config, onSaveCallback) {
    // Remove existing modal if any
    const existing = document.getElementById('settingsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'settings-modal-overlay';
    modal.innerHTML = `
        <div class="settings-modal">
            <div class="settings-modal-header">
                <h2>Настройки</h2>
                <p class="settings-modal-subtitle">Введите API-ключи для работы с Yonote и DeepSeek</p>
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

        if (!token || !key) {
            errorEl.textContent = 'Введите Yonote Token и DeepSeek API Key';
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

// --- Main init ---

export function initUI(executor, eventBus, agent, config) {
    _executor = executor;
    _eventBus = eventBus;
    _agent = agent;
    _config = config;

    chatForm = document.getElementById('chatForm');
    chatInput = document.getElementById('chatInput');
    chatMessages = document.getElementById('chatMessages');
    welcomeScreen = document.getElementById('welcomeScreen');
    btnNewChat = document.getElementById('btnNewChat');
    chatList = document.getElementById('chatList');
    btnSend = document.getElementById('btnSend');

    chatHistory = loadChats();
    renderChatList();

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });

    // Submit on Enter
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Quick actions
    document.querySelectorAll('.quick-action').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.command;
            chatInput.value = cmd;
            chatInput.focus();
            if (!cmd.endsWith(' ')) chatForm.dispatchEvent(new Event('submit'));
        });
    });

    // New chat
    btnNewChat.addEventListener('click', () => startNewChat());

    // Settings button
    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            showSettingsModal(_config, () => {
                // Reload with new settings
                window.location.reload();
            });
        });
    }

    // Form submit
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message || isProcessing) return;
        hideWelcome();
        ensureChat(message);
        addUserMessage(message);
        sendMessage(message);
        chatInput.value = '';
        chatInput.style.height = 'auto';
    });
}
