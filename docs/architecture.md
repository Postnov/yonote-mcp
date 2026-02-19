# Архитектура проекта — Yonote Manager

## Стек технологий
- **Frontend:** JavaScript (ES-модули), HTML, CSS
- **Backend:** PHP 7.4+ (CORS-прокси + SQLite)
- **API:** Yonote API (Outline-совместимый, RPC-стиль), DeepSeek API
- **Тесты:** vitest
- **AI:** DeepSeek Chat (через PHP-прокси)

## Структура папок

```
yonote-mcp/
├── index.html                     # Главная страница
├── css/
│   └── style.css                  # Стили (светлая тема + модалка настроек)
├── js/
│   ├── main.js                    # Точка входа, инициализация
│   ├── event-bus.js               # EventEmitter (замена SSE)
│   ├── config.js                  # Работа с настройками (из PHP API)
│   ├── yonote-client.js           # API-клиент Yonote (через прокси)
│   ├── ai-agent.js                # AI-агент (DeepSeek, системный промпт)
│   ├── markdown-processor.js      # Парсер markdown (эвристический)
│   ├── tool-executor.js           # Агентный цикл, 19 инструментов
│   └── ui.js                      # UI чата, рендеринг, localStorage
├── api/
│   ├── proxy.php                  # CORS-прокси (cURL → Yonote/DeepSeek)
│   ├── settings.php               # CRUD настроек (SQLite)
│   ├── projects.php               # API проектов (заготовка)
│   └── db.php                     # SQLite инициализация
├── data/
│   └── .gitkeep                   # SQLite БД создаётся автоматически
├── tests/
│   ├── markdown-processor.test.js # 91 тест — парсер markdown
│   ├── yonote-client.test.js      # 24 теста — API-клиент
│   ├── tool-executor.test.js      # 38 тестов — агентный цикл, инструменты
│   └── ai-agent.test.js           # 12 тестов — AI-агент, парсинг JSON
├── package.json                   # vitest
├── .htaccess                      # Защита data/ от прямого доступа
├── .gitignore
├── CLAUDE.md
└── docs/
    ├── architecture.md            # Этот файл
    ├── project_status.md          # Статус проекта
    └── changelog.md               # Журнал изменений
```

## Архитектура

```
┌─────────────────────────────────────────────┐
│                 Браузер (JS)                 │
│                                             │
│  main.js → config.js → yonote-client.js     │
│            ai-agent.js                      │
│            tool-executor.js (агентный цикл) │
│            markdown-processor.js            │
│            event-bus.js → ui.js             │
└──────────┬──────────────────┬───────────────┘
           │                  │
    fetch('/api/proxy.php')   fetch('/api/settings.php')
           │                  │
┌──────────▼──────────────────▼───────────────┐
│              PHP-бэкенд                      │
│                                             │
│  proxy.php  → cURL → Yonote API / DeepSeek  │
│  settings.php → SQLite (data/app.db)        │
│  db.php → PDO SQLite                        │
└─────────────────────────────────────────────┘
```

## Слои приложения

### 1. PHP-бэкенд (тонкий слой)

#### `api/proxy.php` — CORS-прокси
- Принимает JSON: `{url, method, headers, body, noRedirect}`
- Выполняет запрос через cURL к целевому API
- Белый список доменов: `*.yonote.ru`, `api.deepseek.com`
- `noRedirect: true` — для document export (не следует за редиректами)
- Добавляет CORS-заголовки в ответ

#### `api/settings.php` — Хранилище настроек
- `GET` — все настройки
- `POST {key, value}` — сохранить настройку
- Хранит: `yonote_api_token`, `yonote_base_url`, `deepseek_api_key`
- API-ключи на сервере (SQLite), НЕ в localStorage

#### `api/db.php` — SQLite
- Создаёт БД `data/app.db` при первом запросе
- Таблицы: `settings`, `projects` (заготовка)

### 2. JS-модули (вся бизнес-логика в браузере)

#### `js/event-bus.js` — EventEmitter
- `on(event, fn)`, `off(event, fn)`, `emit(event, data)`
- События: `status`, `result`, `confirm`, `error`, `done`
- Замена Flask SSE

#### `js/config.js` — Настройки
- `loadSettings()` → GET `/api/settings.php`
- `saveSetting(key, value)` → POST `/api/settings.php`
- `isConfigured()` — проверка заполненности ключей

#### `js/yonote-client.js` — API-клиент Yonote
- 20+ методов: search, create, update, delete, export, collections, attachments
- Все запросы через `/api/proxy.php`
- Кэширование `workspaceUrl`
- `documentExportMarkdown()` — 4-шаговый async export pipeline

#### `js/ai-agent.js` — AI-агент
- Системный промпт (209 строк, 19 инструментов)
- `processMessage()` → DeepSeek через proxy.php
- `_parseResponse()` — извлечение JSON из ```json``` оборачивания
- Скользящее окно последних 10 сообщений

#### `js/markdown-processor.js` — Парсер markdown
- `parseMarkdownBlocks(text)` — эвристический парсер (15+ regex-паттернов)
- `blocksToYonoteMarkdown(blocks)` — сборка для Yonote API
- `extractSectionFromText(text, heading)` — двухпутёвый алгоритм (Path A + Path B)
- `isHeadingCandidate(line)` — определение заголовков без markdown-разметки

#### `js/tool-executor.js` — Агентный цикл
- `processUserMessage(message)` — до 10 итераций (think → act → observe → repeat)
- `_executeTool(tool, params)` — диспетчер 19 инструментов
- Стриминговые инструменты: deep_search, extract_sections, translate, copy_section
- Pending actions: подтверждение мутирующих операций
- `_buildResponse()` — аккумуляция результатов, дедупликация

#### `js/ui.js` — Интерфейс
- Рендеринг чата, результатов, подтверждений
- Таймлайн шагов (сворачиваемый)
- История чатов в localStorage
- Модалка настроек (API-ключи)

#### `js/main.js` — Точка входа
- Загрузка настроек → инициализация модулей → запуск UI

## Деплой

Загрузить файлы на любой хостинг с PHP 7.4+ и SQLite:
```
php -S localhost:8000  # Локальная разработка
```

## 165 тестов (vitest)
```
npm test  # vitest run
```
