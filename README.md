# yonote-mcp

JavaScript-библиотека для управления базой знаний Yonote с помощью ИИ. Использует DeepSeek для обработки команд на естественном языке.

## Возможности

- **Полный доступ к Yonote API** — документы, коллекции, поиск, экспорт
- **ИИ-команды** — интерфейс на естественном языке через DeepSeek
- **19 встроенных инструментов** — поиск, создание, обновление, перевод, извлечение секций
- **Обработка Markdown** — интеллектуальный парсинг и перевод
- **Два режима работы** — Node.js (прямые запросы) и Браузер (через CORS-прокси)

## Установка

```bash
# Клонировать репозиторий
git clone https://github.com/Postnov/yonote-mcp.git
cd yonote-mcp

# Установить dev-зависимости (для тестов)
npm install
```

## Быстрый старт

### Node.js

```javascript
import { createYonoteAgent } from './src/index.js';

const { executor, eventBus } = createYonoteAgent({
    yonoteToken: process.env.YONOTE_TOKEN,
    deepseekKey: process.env.DEEPSEEK_KEY,
});

// Подписка на события
eventBus.on('status', ({ message }) => console.log('Статус:', message));
eventBus.on('result', (data) => console.log('Результат:', data));
eventBus.on('error', ({ message }) => console.error('Ошибка:', message));

// Выполнение команды
await executor.processUserMessage('Найди документы про маркетинг');
```

### Браузер (требуется CORS-прокси)

```html
<script type="module">
import { createYonoteAgent } from './src/index.js';

const { executor, eventBus } = createYonoteAgent({
    yonoteToken: 'ВАШ_YONOTE_TOKEN',
    deepseekKey: 'ВАШ_DEEPSEEK_KEY',
    proxyUrl: '/proxy/proxy.php',  // CORS-прокси
});

eventBus.on('status', ({ message }) => {
    document.getElementById('status').textContent = message;
});

eventBus.on('result', (data) => {
    console.log('Результат:', data);
});

executor.processUserMessage('Покажи все коллекции');
</script>
```

## Конфигурация

### Переменные окружения

Создайте файл `.env`:

```
YONOTE_TOKEN=ваш_токен_yonote
DEEPSEEK_KEY=ваш_ключ_deepseek
```

### Дополнительные настройки

```javascript
const { executor } = createYonoteAgent({
    yonoteToken: '...',
    deepseekKey: '...',
    yonoteBaseUrl: 'https://your-instance.yonote.ru/api',  // Свой URL Yonote
    proxyUrl: '/proxy/proxy.php',  // Для браузера
    config: {
        default_search_page_id: 'page-id',  // Ограничить поиск этой страницей
        reports_page_id: 'page-id',         // Сохранять отчёты сюда
        tags_page_id: 'page-id',            // Страница с тегами
    },
});
```

## Справочник API

### YonoteClient

Клиент для прямого доступа к API Yonote.

```javascript
import { YonoteClient } from './src/yonote-client.js';

const client = new YonoteClient(token, baseUrl, proxyUrl);

// Коллекции
await client.collectionsList();
await client.collectionInfo(collectionId);
await client.collectionCreate(name, description);
await client.collectionDelete(collectionId);

// Документы
await client.documentsList(collectionId, parentDocumentId);
await client.documentInfo(documentId);
await client.documentsSearch(query, collectionId);
await client.documentCreate(title, text, collectionId, parentDocumentId);
await client.documentUpdate(documentId, title, text, append);
await client.documentDelete(documentId);
await client.documentMove(documentId, collectionId, parentDocumentId);
await client.documentDuplicate(documentId, title, publish, recursive);
await client.documentArchive(documentId);
await client.documentRestore(documentId);
await client.documentExportMarkdown(documentId);

// Вложения
await client.attachmentsList(documentId);
```

### AIAgent

ИИ на базе DeepSeek для обработки команд.

```javascript
import { AIAgent } from './src/ai-agent.js';

const agent = new AIAgent(apiKey, model, config, proxyUrl);
const plan = await agent.processMessage('Найди документы про X');
// Возвращает: { thinking, actions, pending_actions, response_template }
```

### ToolExecutor

Выполняет запланированные ИИ действия в Yonote.

```javascript
import { ToolExecutor } from './src/tool-executor.js';

const executor = new ToolExecutor(yonoteClient, agent, eventBus, config);
await executor.processUserMessage('Создай страницу "Заметки"');
await executor.executeConfirmedActions();  // После подтверждения пользователем
```

## Доступные инструменты

| # | Инструмент | Описание |
|---|------------|----------|
| 1 | `search(query)` | Поиск документов по тексту |
| 2 | `list_collections()` | Список всех коллекций |
| 3 | `list_documents(collection_id?, parent_document_id?)` | Список документов |
| 4 | `document_info(document_id)` | Получить содержимое документа |
| 5 | `create_document(title, text, collection_id?)` | Создать документ |
| 6 | `update_document(document_id, title?, text?, append?)` | Обновить документ |
| 7 | `delete_document(document_id)` | Удалить документ |
| 8 | `move_document(document_id, collection_id?, parent_document_id?)` | Переместить документ |
| 9 | `archive_document(document_id)` | Архивировать документ |
| 10 | `restore_document(document_id)` | Восстановить из архива |
| 11 | `list_drafts()` | Список черновиков |
| 12 | `list_viewed()` | Недавно просмотренные |
| 13 | `create_collection(name, description?)` | Создать коллекцию |
| 14 | `delete_collection(collection_id)` | Удалить коллекцию |
| 15 | `translate_document(document_id, target_language, new_title?)` | Перевести документ |
| 16 | `extract_sections(parent_document_id, heading, output_title?, breadcrumbs?)` | Извлечь секции рекурсивно |
| 17 | `duplicate_document(document_id, title?, publish?, recursive?)` | Дублировать документ |
| 18 | `copy_section(document_id, heading, output_title?)` | Скопировать секцию в новую страницу |
| 19 | `deep_search(query, collection_id?, parent_document_id?)` | Глубокий поиск по содержимому |

## События

EventBus генерирует следующие события:

| Событие | Данные | Описание |
|---------|--------|----------|
| `status` | `{ message }` | Обновления прогресса |
| `result` | `{ message, documents?, collections?, document? }` | Результаты операции |
| `confirm` | `{ message, pending_actions }` | Требуется подтверждение |
| `error` | `{ message }` | Произошла ошибка |
| `done` | `{}` | Операция завершена |

## Настройка CORS-прокси

Для работы в браузере разместите `proxy/proxy.php` на PHP-сервере:

```bash
# Структура сервера
/var/www/html/
├── proxy/
│   └── proxy.php
└── your-app/
    └── index.html
```

Прокси разрешает запросы к:
- `*.yonote.ru` — API Yonote
- `api.deepseek.com` — DeepSeek AI
- `storage.yandexcloud.net`, `s3.amazonaws.com` — Скачивание экспорта

## Запуск тестов

```bash
npm test           # Запустить тесты один раз
npm run test:watch # Режим наблюдения
```

## Структура проекта

```
yonote-mcp/
├── src/
│   ├── index.js              # Главный экспорт + createYonoteAgent()
│   ├── yonote-client.js      # Клиент Yonote API
│   ├── ai-agent.js           # Интеграция DeepSeek AI
│   ├── tool-executor.js      # Движок выполнения инструментов
│   ├── markdown-processor.js # Парсинг Markdown
│   └── event-bus.js          # Event emitter
├── proxy/
│   └── proxy.php             # CORS-прокси для браузеров
├── examples/
│   ├── node-example.js       # Пример для Node.js
│   └── browser-example.html  # Пример для браузера
├── tests/                    # Тесты Vitest
├── .env.example              # Шаблон переменных окружения
├── package.json
└── README.md
```

## Лицензия

MIT

## Благодарности

Основано на [yonote-mcp](https://github.com/cutalion/yonote-mcp) — неофициальном MCP-сервере.
