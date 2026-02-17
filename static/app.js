document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const btnNewChat = document.getElementById('btnNewChat');
    const chatList = document.getElementById('chatList');
    const btnSend = document.getElementById('btnSend');

    let chatHistory = [];
    let currentChatId = null;
    let isProcessing = false;

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });

    // Submit on Enter (Shift+Enter for new line)
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
            if (!cmd.endsWith(' ')) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        });
    });

    // New chat
    btnNewChat.addEventListener('click', () => {
        startNewChat();
    });

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

    function hideWelcome() {
        if (welcomeScreen) {
            welcomeScreen.style.display = 'none';
        }
    }

    function ensureChat(firstMessage) {
        if (!currentChatId) {
            currentChatId = Date.now().toString();
            const label = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
            chatHistory.push({ id: currentChatId, label, messages: [] });
            renderChatList();
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

        // Reset AI conversation
        fetch('/api/reset', { method: 'POST' }).catch(() => {});
    }

    function renderChatList() {
        chatList.innerHTML = '';
        chatHistory.slice().reverse().forEach(chat => {
            const item = document.createElement('div');
            item.className = 'chat-list-item' + (chat.id === currentChatId ? ' active' : '');
            item.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                ${escapeHtml(chat.label)}
            `;
            item.addEventListener('click', () => loadChat(chat.id));
            chatList.appendChild(item);
        });
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
            if (chat) chat.messages.push({ type: 'user', text });
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

    function sendMessage(message) {
        isProcessing = true;
        btnSend.disabled = true;

        const container = addAssistantMessage();

        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        }).then(response => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            function read() {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        finishProcessing(container);
                        return;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    let eventType = '';

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.substring(7);
                        } else if (line.startsWith('data: ')) {
                            const eventData = line.substring(6);
                            try {
                                const data = JSON.parse(eventData);
                                handleEvent(eventType, data, container);
                            } catch (e) {
                                // ignore
                            }
                            eventType = '';
                        }
                    }
                    read();
                });
            }
            read();
        }).catch(err => {
            container.innerHTML = `
                <div class="error-message">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    Ошибка соединения: ${escapeHtml(err.message)}
                </div>
            `;
            finishProcessing(container);
        });
    }

    function getOrCreateTimeline(container) {
        let timeline = container.querySelector('.steps-timeline');
        if (!timeline) {
            timeline = document.createElement('div');
            timeline.className = 'steps-timeline';
            container.appendChild(timeline);
        }
        return timeline;
    }

    function completeActiveStep(timeline) {
        const active = timeline.querySelector('.step-item.active');
        if (active) {
            active.classList.remove('active');
            active.classList.add('completed');
            const icon = active.querySelector('.step-icon');
            if (icon) {
                icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
            }
            // Set elapsed time
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
        const step = document.createElement('div');
        step.className = 'step-item active';
        step.dataset.startTime = Date.now().toString();
        step.innerHTML = `
            <div class="step-icon"><span class="step-spinner"></span></div>
            <span class="step-text">${escapeHtml(message)}</span>
            <span class="step-time"></span>
        `;
        timeline.appendChild(step);
    }

    function completeTimeline(container) {
        const timeline = container.querySelector('.steps-timeline');
        if (timeline) {
            completeActiveStep(timeline);
            timeline.classList.add('done');
        }
    }

    function errorTimeline(container, message) {
        const timeline = container.querySelector('.steps-timeline');
        if (timeline) {
            const active = timeline.querySelector('.step-item.active');
            if (active) {
                active.classList.remove('active');
                active.classList.add('error');
                const icon = active.querySelector('.step-icon');
                if (icon) {
                    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
                }
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

        // Documents list
        if (data.documents && data.documents.length > 0) {
            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `
                <div class="result-card-header">
                    Документы
                    <span class="badge">${data.documents.length}</span>
                </div>
            `;
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

        // Collections list
        if (data.collections && data.collections.length > 0) {
            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `
                <div class="result-card-header">
                    Коллекции
                    <span class="badge">${data.collections.length}</span>
                </div>
            `;
            data.collections.forEach(col => {
                const item = document.createElement('div');
                item.className = 'doc-item';
                item.innerHTML = `
                    <div>
                        <div class="doc-title">${escapeHtml(col.name || 'Без названия')}</div>
                    </div>
                `;
                item.style.cursor = 'pointer';
                item.addEventListener('click', () => {
                    chatInput.value = `Покажи документы в коллекции ${col.name}`;
                    chatForm.dispatchEvent(new Event('submit'));
                });
                card.appendChild(item);
            });
            container.appendChild(card);
        }

        // Single document detail
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

        // Single document created/updated (without full text)
        if (data.document && !data.document.text && data.document.title) {
            const info = document.createElement('div');
            info.className = 'result-card';
            const link = data.document.url ? `<a class="doc-link" href="${escapeHtml(data.document.url)}" target="_blank">Открыть в Yonote</a>` : '';
            info.innerHTML = `
                <div class="doc-item">
                    <div><div class="doc-title">${escapeHtml(data.document.title)}</div></div>
                    ${link}
                </div>
            `;
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
            sendConfirm(container);
        });

        btnNo.addEventListener('click', () => {
            btns.remove();
            const cancelled = document.createElement('div');
            cancelled.className = 'message-text text-muted';
            cancelled.textContent = 'Действие отменено.';
            container.appendChild(cancelled);
            agent_add_context('Пользователь отменил действие.');
        });

        btns.appendChild(btnYes);
        btns.appendChild(btnNo);
        container.appendChild(btns);
    }

    function sendConfirm(container) {
        isProcessing = true;
        btnSend.disabled = true;

        fetch('/api/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }).then(response => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            function read() {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        finishProcessing(container);
                        return;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    let eventType = '';
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.substring(7);
                        } else if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                handleEvent(eventType, data, container);
                            } catch (e) {}
                            eventType = '';
                        }
                    }
                    read();
                });
            }
            read();
        }).catch(err => {
            const errDiv = document.createElement('div');
            errDiv.className = 'error-message';
            errDiv.textContent = 'Ошибка: ' + err.message;
            container.appendChild(errDiv);
            finishProcessing(container);
        });
    }

    function agent_add_context(text) {
        fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
        }).catch(() => {});
    }

    function finishProcessing(container) {
        isProcessing = false;
        btnSend.disabled = false;
        chatInput.focus();

        // Save to history
        const chat = chatHistory.find(c => c.id === currentChatId);
        if (chat && container) {
            const msgEl = container.closest('.message');
            if (msgEl) {
                chat.messages.push({ type: 'assistant', html: msgEl.outerHTML });
            }
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
