# Changelog — Yonote Manager

## 2026-02-26 — Мобильное бургер-меню

### Что сделано

**Бургер-меню для мобильных устройств**
- Добавлена кнопка бургера (три полоски) в header — видна только на экранах ≤768px
- Боковая панель (drawer) справа с навигацией: Проекты, Пользователи, Настройки, Выйти
- Overlay для закрытия при клике вне меню
- Плавная анимация открытия/закрытия (300ms slide)
- Синхронизация видимости кнопок: если пользователь не admin — Пользователи/Настройки скрыты и в drawer
- Синхронизация active-состояния: текущий пункт меню подсвечен и в header, и в drawer

**Уменьшен логотип на мобильных**
- 768px: высота 18px (было 22px)
- 480px: высота 16px

**Исправлен перенос текста**
- `.hero-reports-link`: добавлен `white-space: nowrap` — "Отчёты проекта" не переносится на две строки
- `.hero-actions`: горизонтальный скролл на маленьких экранах вместо переноса

---

## 2026-02-23 — Навигация в шапке + страница настроек

### Что сделано

**Шапка переработана**
- Логотип всегда виден на всех страницах
- Добавлена центральная навигация: `Проекты` | `Пользователи` | `Настройки`
- Пользователи и Настройки видны только администратору
- Активный пункт меню подсвечивается классом `is-active`
- Клик по логотипу → переход на `#/projects`
- Кнопка «назад» — компактная стрелка без текста, рядом с лого (только на странице проекта)

**Настройки → отдельная страница**
- Маршрут `#/settings` → `loadSettingsView()` → `renderSettingsView()`
- Страница оформлена в стиле страницы пользователей: заголовок + форма + кнопка «Сохранить»
- `showSettingsModal` сохранён только для принудительного первого запуска (нет токена)

**Иконки**
- Иконка настроек заменена на шестерёнку (gear) — в шапке и в кнопке настроек проекта
- Ссылка «Отчёты проекта» получила `padding: 6px 12px` + `border-radius: 6px` + синий hover-фон

---

## 2026-02-23 — Фикс деплоя на хостинг

### Что сделано

**Относительные пути**
- `index.html`: `/css/style.css` → `css/style.css`, `/js/main.js` → `js/main.js`, `/images/` → `images/`
- Все `fetch('/api/...')` в JS-файлах заменены на `fetch('api/...')` (6 файлов)
- `<base href="./">` добавлен в `<head>` — корректный резолв при URL без trailing slash

**Apache / хостинг**
- `.htaccess`: `AddType application/javascript .js .mjs` — правильный MIME для ES-модулей

---

## 2026-02-23 — Доработки страницы пользователей

### Что сделано

**Вёрстка строк пользователей**
- CSS Grid `1fr auto auto` — бейдж и счётчик проектов прижаты к правому краю
- Убрана аватарка из строк
- Бейдж и счётчик проектов поменяны местами: счётчик левее, бейдж правее

**Кнопки редактирования/удаления убраны из строки**
- Работает только клик по строке (для не-admin) → открывает модалку редактирования
- Кнопка удаления перенесена в модальное окно: иконка корзины справа через `margin-left: auto`
- При клике по иконке — подтверждение через `showDeleteConfirm`
- Порядок кнопок в футере: Сохранить → Отмена → [иконка удаления]

**Закрытие модалок**
- Esc — закрывает последнюю открытую модалку
- Клик вне окна — закрывает модалку
- Глобальные обработчики в `ui.js`, работают для всех модалок

**Шапка**
- Убран outline у кнопок хедера (`.header-btn { outline: none }`)

---

## 2026-02-23 — Формат отчёта и шапка

### Что сделано

**Формат отчёта: страница → свойства**
- `_executeExtractSections` в `tool-executor.js`: группировка изменена с «свойство → страницы» на «страница → свойства»
- Построение `pageMap` (Map, порядок вставки) — инвертирование `foundByHeading`
- Новый формат: `# Страница А` → `## Свет`, `## Тепло`, разделитель `---` между страницами

**Имя пользователя убрано из шапки**
- Удалён элемент `#userName` из `index.html`
- Удалён обработчик в `updateHeaderForUser` в `main.js`

---

## 2026-02-23 — Мелкие UX-правки

### Что сделано

**Клик по строке пользователя открывает редактирование**
- В `renderAdminView` добавлен click-хендлер на `user-row` для не-admin пользователей
- Клик на любую часть строки (аватар, имя, email, бейдж, счётчик) → `onEdit(user)`
- Кнопки edit/delete используют `stopPropagation`, чтобы не дублировать вызов
- `cursor: pointer` для кликабельных строк

**Hover карточки проекта — синий градиент вместо чёрного**
- `.project-card:hover`: `background: linear-gradient(135deg, #606c88, #3f4c6b)`, `border-color: transparent`
- Согласован со стилем всех primary-кнопок в приложении

**Отступ сверху на body**
- `body { padding-top: 24px }` — небольшой воздух между хедером и контентом

---

## 2026-02-23 — Доработки UX страницы проекта

### Что сделано

**Удаление отчётов из истории**
- Кнопка удаления (корзина) рядом с переименованием в каждом элементе истории
- При hover кнопка краснеет (`var(--error-dim)`)
- `deleteHistoryItem(id)` — фильтрует `_history`, сохраняет в localStorage, перерисовывает

**Заголовок страницы = название проекта**
- `initReportView` принимает `project` как новый параметр
- `h1` в hero-секции заменяется на `project.name`
- `main.js` передаёт `project` из `_projectApi.get()` в `initReportView`

**Ссылка на страницу отчётов**
- Под заголовком асинхронно загружается ссылка через `yonote.documentInfo(reports_page_id)`
- URL строится через `yonote.fullUrl()` — использует `_workspaceUrl` из `auth.info` (например `https://remake.yonote.ru`), а не `yonote_base_url` (прокси)
- Ссылка всегда синяя (`#4f6ef7`), при hover opacity 0.75
- `.hero-reports-link` — новый CSS-класс

**Подзаголовок «Создать отчёт»**
- `<h2 class="section-heading">Создать отчёт</h2>` добавлен в HTML над блоком тегов
- Стиль: 13px, uppercase, letter-spacing 1.5px, `var(--text-muted)`

**Таймлайн прогресса свёрнут по умолчанию**
- `.steps-timeline` создаётся с классом `collapsed` — шаги скрыты, виден только текущий в хедере
- Раскрывается по клику

---

## 2026-02-23 — Редизайн под mereal.info

### Что сделано
- Применена цветовая палитра сайта mereal.info: кремовый фон (#f8f8f4), тёмный текст (#13131c), акцент (#55607d)
- Логотип mereal.info (`images/mereal-logo.svg`) заменил звёздный SVG + текст "Yonote Reports" в хедере и на страницах авторизации
- Шапка переделана в светлую (cream background) с нижней границей
- Все основные кнопки переведены на gradient: `linear-gradient(135deg, #606c88, #3f4c6b)`
- Заголовки страниц и кнопки оформлены в uppercase с letter-spacing
- Добавлен Google Font Inter для более рафинированной типографики
- Переименован `<title>` на "Mereal Reports"

---

## 2026-02-20 — Авторизация и система доступов

### Что сделано
Реализована полная система авторизации (логин/пароль + сессии) и управления доступами к проектам. Первый запуск → создание admin-аккаунта. Админ управляет пользователями и назначает проекты. Пользователи видят только назначенные проекты.

### Backend

**Новые файлы:**
- `api/auth_middleware.php` — `requireAuth()` (cookie → session → user), `requireAdmin()` (проверка role)
- `api/auth.php` — login (bcrypt + 500ms delay), logout, check (needs_setup detection), setup (first admin), change_password
- `api/users.php` — CRUD пользователей (admin only) + `project_access` (назначение проектов по чекбоксам)

**Изменённые файлы:**
- `api/db.php` — 3 новые таблицы: `users`, `sessions`, `project_access` (FK + каскадное удаление)
- `api/projects.php` — `requireAuth()` + фильтрация: admin видит все, user — только через `project_access` JOIN. POST/PUT/DELETE — admin only
- `api/settings.php` — GET: `requireAuth()`, POST: admin only
- `api/proxy.php` — `requireAuth()` на все запросы

### Frontend

**Новые файлы:**
- `js/auth.js` — AuthClient: check, login, logout, setup, changePassword (cookie-based)
- `js/user-api.js` — UserApi: list, get, create, update, delete

**Изменённые файлы:**
- `index.html` — viewLogin, viewSetup, viewAdmin divs; header с кнопками Пользователи/Настройки/Выйти/имя
- `css/style.css` — auth-page (centered card), admin-page (user table), user-modal (project checkboxes), header-right/header-btn/header-user-name
- `js/ui.js` — showLoginView, showSetupView, renderAdminView, showUserModal, showChangePasswordModal, renderProjectsViewWithRole
- `js/main.js` — auth-first boot: check → setup/login → initApp; маршрут #/admin; role-based header

### Безопасность
- Пароли: `password_hash(PASSWORD_BCRYPT)` — bcrypt с salt
- Токены: `bin2hex(random_bytes(32))` — 64-char crypto-random
- Cookie: httpOnly + SameSite=Strict + path=/
- Срок: 30 дней, автоочистка просроченных
- Защита от перебора: 500ms delay на ошибку логина
- Доступ: каждый endpoint проверяет `requireAuth()` / `requireAdmin()`

### Тесты
- 26 новых тестов в `tests/auth.test.js` (AuthClient, UserApi, UI login/setup/admin, role-based rendering)
- jsdom добавлен как dev-зависимость для DOM-тестов
- **294 теста, все проходят**

---

## 2026-02-20 — Система проектов

### Что сделано
Глобальные настройки page ID заменены системой проектов. Каждый проект — отдельное рабочее пространство со своими страницами (теги, поиск, отчёты). Пользователь заходит → видит список проектов → выбирает → работает в контексте проекта.

### Архитектура
- Глобальные настройки (API-токены) остаются в `settings` таблице
- Проектные настройки (`tags_page_id`, `default_search_page_id`, `reports_page_id`) хранятся в `projects.data` JSON
- `Config.get()` проверяет проект первым для page-ID ключей → ToolExecutor работает без изменений

### Backend: `api/projects.php`
- GET (список) + GET?id (один проект) + POST (создание) + PUT?id (обновление) + DELETE?id (удаление)
- Валидация: `data` может содержать только три допустимых ключа
- `json_decode` при отдаче — клиент получает объект, не строку
- `api/settings.php` — убраны `tags_page_id`, `default_search_page_id`, `reports_page_id` из глобальных настроек

### Frontend: SPA-роутер
- `js/router.js` — hash-based роутер: `#/projects` (список), `#/project/:id` (отчёты)
- `js/project-api.js` — API-клиент: `list()`, `get()`, `create()`, `update()`, `delete()`
- `js/config.js` — `setProject()`, `clearProject()`, `getProject()`, `get()` с приоритетом проекта
- `js/main.js` — полная перестройка boot с роутером, ToolExecutor создаётся при входе в проект

### UI
- Страница проектов: grid карточек с названием, счётчиком настроек, датой. Кнопки редактирования/удаления по hover
- Карточка «+ Новый проект» с dashed border
- Модалка создания/редактирования: название + 3 поля страниц
- Модалка подтверждения удаления
- Кнопка «Проекты» в header для возврата к списку
- Настройки (⚙) — только глобальные поля (API-токены)
- История отчётов скоупирована по ID проекта: `yonote_report_history_${projectId}`

### Файлы изменены
- `api/projects.php` — полный CRUD с валидацией
- `api/settings.php` — убраны page ID ключи
- `js/config.js` — project context
- `js/project-api.js` — новый файл
- `js/router.js` — новый файл
- `js/ui.js` — `renderProjectsView`, `showProjectModal`, `showDeleteConfirm`, `initReportView` (рефакторинг), скоуп истории
- `js/main.js` — роутер + routes
- `index.html` — два контейнера видов + back button
- `css/style.css` — стили проектов, карточек, модалок, view switching

### Тесты
- `tests/projects.test.js` — 28 новых тестов: Config project context, ProjectApi mock, Router matching, UI history key
- 268 тестов, все проходят

---

## 2026-02-20 — Создание отчёта по нескольким темам

### Что сделано
Пользователь может выбрать несколько тегов и создать один общий отчёт. Система сканирует страницы один раз и собирает секции по всем выбранным темам.

### UI: мульти-выбор тегов
- Клик по тегу toggle'ит выбор (можно выбрать несколько одновременно)
- Кнопка адаптируется: 1 тег → «Создать отчёт по «Свет»», 2-3 → «по «Свет», «Цвет»», 4+ → «по N темам»
- Подзаголовок изменён: «Выберите темы для сбора данных»
- Результат показывает per-heading breakdown: «12 из 20 страниц (Свет: 8, Цвет: 4)»
- История: метка «#Свет, #Цвет, #Полы»

### Бэкенд: `_executeExtractSections` с массивом тем
- Новый параметр `headings` (массив) — заменяет `heading` (строка) при мульти-выборе
- Сканирование страниц один раз: для каждой страницы проверяются все темы
- Rich export делается один раз на страницу, если хотя бы одна тема найдена
- Формат отчёта для нескольких тем: `# Свет` → `## Страница` → контент → `---` → `# Цвет` → ...
- Для одной темы — плоский формат (backward compatible, без `# Тема`)
- Результат включает `headings_found: { Свет: 8, Цвет: 4 }`
- `formatReportTitle` поддерживает массив: «Отчет: Свет, Цвет — дата»

### Файлы изменены
- `js/tool-executor.js` — `_executeExtractSections`: `headings[]`, per-heading tracking, grouped compilation
- `js/ui.js` — `_selectedTags` (Set), `selectTag` (toggle), `updateActionButton`, `startReport` (без аргумента), `formatReportTitle` (массив), `showReportResult` (breakdown)
- `index.html` — подзаголовок «Выберите темы для сбора данных»
- `tests/report-ui.test.js` — 6 новых тестов: formatReportTitle с массивом, multi-tag flow, history label
- `tests/settings.test.js` — 5 новых тестов: multi-heading scan, flat format, error cases, backward compat

### Тесты
239 тестов, все проходят

---

## 2026-02-20 — Хлебные крошки, дата в названии, история отчётов

### Что сделано
Улучшения интерфейса создания отчётов: хлебные крошки всегда включены, дата/время добавляется в название отчёта, появился sidebar с историей созданных отчётов.

### Хлебные крошки
- `breadcrumbs: true` всегда передаётся в `extract_sections` — каждая секция в отчёте содержит путь (*Авгодом → Интерьер → 1 этаж, Гости*)

### Дата в названии отчёта
- Название страницы в Yonote: «Отчет: Свет — 23 февраля 2026. 16:12»
- `formatReportDate(date)` — форматирование даты на русском (день месяц год. ЧЧ:ММ)
- `formatReportTitle(tagName, date)` — полный заголовок с тегом и датой

### История отчётов (sidebar)
- Sidebar слева с заголовком «История»
- Каждый созданный отчёт автоматически добавляется в историю (localStorage)
- Отображается: метка (#Тег), дата создания
- Клик по элементу → открытие в Yonote (новая вкладка)
- Переименование: кнопка ✏ → inline input → Enter/Escape/blur
- Пустое состояние: «Созданные отчёты будут отображаться здесь»

### Файлы изменены
- `index.html` — добавлен sidebar (`<aside class="sidebar">`) с `<div class="history-list">`, обёрнуто в `<div class="app-layout">`
- `css/style.css` — новые стили: `.app-layout`, `.sidebar`, `.history-list`, `.history-item`, `.history-rename-input`, `.history-empty`; `.main-content` изменён на `flex: 1`
- `js/ui.js` — новые функции: `formatReportDate`, `formatReportTitle`, `loadHistory`, `saveHistory`, `addToHistory`, `renameHistoryItem`, `renderHistory`, `startRename`; `startReport` обновлён: `breadcrumbs: true`, дата в `output_title`, запись в историю
- `tests/report-ui.test.js` — 7 новых тестов: `formatReportDate` (5), `formatReportTitle` (2)

### Тесты
228 тестов, все проходят

---

## 2026-02-20 — Замена чата на инструмент создания отчётов по тегам

### Что сделано
Чат-интерфейс с AI заменён на специализированный инструмент создания отчётов. Теперь пользователь выбирает тег из списка, и система автоматически сканирует все дочерние страницы, находит секции с этим заголовком, собирает контент и создаёт отчёт в Yonote.

### Новый дизайн
- Тёмный header-бар с логотипом и кнопкой настроек
- Центральная колонка 640px, три зоны: теги → действие → результат
- Tag chips с hover/selected состояниями, border-radius 20px
- Skeleton shimmer при загрузке тегов
- Gradient кнопка «Создать отчёт по тегу»
- Карточка успеха с зелёным left-border и ссылкой на Yonote
- Карточка ошибки с красным left-border
- Timeline прогресса (переиспользован из предыдущей версии)

### Файлы изменены
- `index.html` — полная переделка: убран sidebar, chat, добавлены header, hero, tags grid, action, progress, result
- `css/style.css` — новые стили: app-header, main-content, tag-chip, tags-loading, btn-create-report, result-card-success/error, btn-open-report. Сохранены: timeline, settings modal, :root variables
- `js/ui.js` — убраны все chat-функции. Новые: parseTags, loadAndRenderTags, renderTags, selectTag, startReport, showReportResult, showReportError. Сохранены: escapeHtml, extractDocumentId, timeline functions, showSettingsModal
- `js/main.js` — убран AIAgent, ToolExecutor с agent=null, передача yonote в initUI
- `tests/report-ui.test.js` — 20 новых тестов: parseTags (11 тестов), startReport flow (5 тестов), extractDocumentId (4 теста)

### Удалено
- Sidebar и список чатов
- Все chat-функции (chatHistory, loadChats, saveChats, sendMessage, addUserMessage, addAssistantMessage, renderChatList, etc.)
- Confirmation flow (renderConfirm, confirmAction)
- Quick actions и welcome screen
- AIAgent из main.js boot

### Фикс 403 при создании отчёта
- **Проблема**: `documentCreate` получал 403 Authorization error, потому что `collectionId` бралась из первой публичной коллекции (`collectionsList`), а `reports_page_id` находился в личной/скрытой коллекции. Yonote требует совпадения `collectionId` и коллекции родительского документа.
- **Решение**: при наличии parent документа (reports_page_id) — получаем его `collectionId` через `documentInfo` и используем при создании. Применено в `_executeExtractSections` и `_executeCopySection`.

### Тесты
221 тест, все проходят

---

## 2026-02-20 — Фикс slug ID → UUID + пропагация ошибок

### Проблема
Slug ID из настроек (например `avgodom-EmozI4aR08`) не работал с API `documents.list(parentDocumentId)` — этот endpoint требует UUID. Из-за этого `extract_sections` и scoped `deep_search` не находили дочерних страниц и возвращали "Готово!" вместо ошибки.

### Что исправлено
- `_resolveDocumentId(idOrSlug)` — новый хелпер с кэшированием: резолвит slug → UUID через `documentInfo`
- `deep_search`: резолвит `default_search_page_id` и `parent_document_id` перед поиском потомков
- `extract_sections`: всегда резолвит `parent_document_id` в UUID (убрано условие `if (breadcrumbs)`)
- `copy_section` и `extract_sections`: резолвят `reports_page_id` перед `documentCreate`
- `list_documents`: резолвит `parent_document_id` при вызове
- `_buildResponse`: когда шаблон "Готово!" и документ не создан — показывает ошибки инструментов (раньше они терялись)
- 199 тестов (было 185), все проходят

---

## 2026-02-20 — Настройки рабочих страниц + автоматическое ограничение поиска

### Что сделано
Добавлены три новых настройки для указания рабочих страниц Yonote. Теперь пользователь может задать:
1. **Страница с тегами** — страница со списком тегов (каждый начинается с #)
2. **Страница для поиска** — дефолтная страница, в рамках которой искать данные
3. **Страница для отчетов** — родительская страница, внутри которой создаются отчеты

### Автоматическое ограничение поиска (scoped search)
- `deep_search` теперь поддерживает `parent_document_id` — ограничивает поиск подстраницами конкретного документа
- Когда `default_search_page_id` настроен и `collection_id` не указан, deep_search автоматически сканирует только потомков этой страницы (через `_fetchAllDescendants`), а не все коллекции
- Для каждой страницы сначала пробует `documentInfo` (быстро), при ошибке — `documentExportMarkdown` (fallback)
- AI промпт усилен: при наличии «страницы для поиска» AI не сканирует другие коллекции

### PHP-бэкенд
- `api/settings.php` — добавлены 3 новых ключа: `tags_page_id`, `default_search_page_id`, `reports_page_id`

### UI
- Модалка настроек расширена секцией «Рабочие страницы» с визуальным разделителем
- Каждое поле имеет подсказку (hint) с описанием назначения
- `extractDocumentId()` — парсинг Yonote URL в document ID (UUID или slug-ID)
- Модалка увеличена (520px), добавлен скролл для body

### Логика
- `ToolExecutor` принимает `config`, использует `reports_page_id` как parent при создании отчетов (extract_sections, copy_section)
- `deep_search` автоматически ограничивает поиск `default_search_page_id`
- `AIAgent._buildSystemPrompt()` динамически добавляет настройки в системный промпт
- `main.js` — config прокинут в AIAgent и ToolExecutor

### CSS
- `.settings-section-divider`, `.settings-section-title`, `.settings-section-subtitle`, `.settings-field-hint`

### Тесты
- `tests/settings.test.js` — 20 новых тестов: reports_page_id, scoped deep_search, _buildSystemPrompt, extractDocumentId
- Итого: 185 тестов, все проходят

### Файлы изменены
- `api/settings.php` — новые ключи
- `js/ui.js` — модалка + extractDocumentId
- `js/tool-executor.js` — config + reports_page_id + scoped deep_search
- `js/ai-agent.js` — config + _buildSystemPrompt + deep_search parent_document_id
- `js/main.js` — передача config
- `css/style.css` — стили секций
- `tests/settings.test.js` — новый файл тестов

---

## 2026-02-19 — Миграция на JS-фронтенд + PHP-бэкенд

### Что сделано
Полная миграция с Flask (Python) на архитектуру JS-фронтенд + PHP-бэкенд. Вся бизнес-логика перенесена в браузер (ES-модули), PHP — тонкий слой (CORS-прокси + SQLite хранилище).

### PHP-бэкенд
- `api/proxy.php` — CORS-прокси через cURL, белый список доменов (*.yonote.ru, api.deepseek.com), поддержка noRedirect для export
- `api/settings.php` — CRUD настроек в SQLite (API-ключи на сервере, не в браузере)
- `api/db.php` — инициализация SQLite (data/app.db), таблицы settings и projects
- `.htaccess` — защита data/ от прямого доступа

### JS-модули (порт Python → JavaScript)
- `js/event-bus.js` — EventEmitter (замена Flask SSE)
- `js/config.js` — клиент для settings API
- `js/yonote-client.js` — порт yonote_client.py (20+ методов, включая documentExportMarkdown)
- `js/ai-agent.js` — порт ai_agent.py (системный промпт, DeepSeek, sliding window)
- `js/markdown-processor.js` — порт markdown_processor.py (эвристический парсер, 15+ regex)
- `js/tool-executor.js` — порт app.py (агентный цикл, 19 инструментов, pending actions, deep_search, extract_sections, translate, copy_section)
- `js/ui.js` — рефакторинг static/app.js (EventBus вместо SSE, модалка настроек)
- `js/main.js` — точка входа (boot → config → modules → UI)

### UI
- `index.html` — обновлённая страница с ES-модулями
- `css/style.css` — перенос стилей + модалка настроек API-ключей

### Тесты
- 165 JS-тестов (vitest), порт всех Python-тестов:
  - markdown-processor.test.js — 91 тест
  - tool-executor.test.js — 38 тестов
  - yonote-client.test.js — 24 теста
  - ai-agent.test.js — 12 тестов

### Удалено
- Python: app.py, yonote_client.py, ai_agent.py, markdown_processor.py, requirements.txt
- Debug: debug_api_response.py, debug_attachments.py, debug_deep_search.py, debug_doc.py, debug_export.py, debug_parser.py, debug_personal_docs.py
- Директории: templates/, static/, venv/, __pycache__/, .pytest_cache/
- Python-тесты: tests/test_*.py, tests/__init__.py

### Файлы изменены
Вся кодовая база заменена. Ключевые новые файлы: api/*.php, js/*.js, index.html, css/style.css, package.json

### Тесты
165 тестов, все проходят

---

## 2026-02-18 — deep_search: оптимизация скорости (пре-скан + ранний выход)

### Проблема
Сканирование "(личное)" коллекции занимало ~100 секунд из-за рекурсивного обхода сотен подстраниц (484 API-запроса `documents.list`). Даже когда совпадение уже найдено, продолжался полный обход всего дерева.

### Решение
- **Пре-скан discovery-документов**: `documents.list(limit=100)` уже возвращает 100 недавних документов с text-полями. Раньше мы только извлекали `collectionId` — теперь сразу проверяем text на совпадение
- **Ранний выход**: если discovery или top-level скан нашёл совпадения, рекурсивный обход детей пропускается (`if not found: scan_children_recursive()`)
- Для "керамогранит": совпадение находится в discovery-фазе → рекурсия в "(личное)" не нужна → экономия ~100 секунд

### Файлы изменены
- `app.py` — пре-скан discovery_docs, условный `scan_children_recursive`
- `tests/test_extract_sections.py` — новый тест `test_discovery_prescan_finds_match_skips_recursion`

### Тесты
257 тестов, все проходят

---

## 2026-02-17 — deep_search: обнаружение скрытых коллекций (Личное)

### Проблема
`deep_search` экспортировал 63 страницы, но не находил "керамогранит". Диагностика показала: **коллекция "Личное" не возвращается `collections.list`**! Все документы Авгодома (включая "1 этаж, Гости" с нужным текстом) принадлежат коллекции `f81b2959...`, которой нет в списке API. `deep_search` сканировал только 5 публичных коллекций и не видел приватные.

При этом `document_info("1 этаж, Гости")` возвращает text, содержащий "керамогранит" — проблема не в ProseMirror, а в невидимости коллекции.

### Решение
- После `collections.list` вызываем `documents.list(limit=100)` без `collectionId` — это возвращает документы из ВСЕХ коллекций (включая скрытые)
- Извлекаем `collectionId` из каждого документа, сравниваем с известными
- Неизвестные collectionId добавляем в список сканирования как `"(личное)"`
- Phase 2 (экспорт) сохранён как дополнительная страховка

### Файлы изменены
- `app.py` — блок обнаружения скрытых коллекций в `execute_deep_search_streaming()`
- `tests/test_extract_sections.py` — новый тест `test_discovers_hidden_collections`, обновлены все тесты deep_search (добавлен discovery call mock)

### Тесты
256 тестов, все проходят

---

## 2026-02-17 — deep_search Phase 2: экспорт для неполных text-полей

### Проблема
`deep_search` Phase 1 сканировал text-поля из `documents.list`, но эти поля неполные — ProseMirror-блоки (списки, таблицы) отсутствуют. Страница "1 этаж, Гости" имеет ЧАСТИЧНЫЙ text (заголовки есть, а список с "керамогранит" — нет). Export fallback срабатывал только для страниц с ПУСТЫМ text.

### Решение
- Двухфазный алгоритм: Phase 1 (быстрый скан text) → Phase 2 (экспорт каждой страницы через `document_export_markdown`)
- Phase 2 запускается только если Phase 1 не нашёл результатов
- Все страницы собираются в Phase 1 (id, title, url), в Phase 2 экспортируются для полного контента
- SSE-статусы: «Быстрый скан: N страниц», «Экспорт (M/N)...», «Глубокий поиск завершён»

### Файлы изменены
- `app.py` — переработан `execute_deep_search_streaming()`: collect_page(), Phase 1/Phase 2
- `tests/test_extract_sections.py` — новый тест `test_phase2_export_for_partial_text`, обновлены существующие тесты

### Тесты
255 тестов, все проходят

---

## 2026-02-17 — Глубокий поиск (deep_search) по содержимому документов

### Проблема
Yonote API `documents.search` не находит контент внутри ProseMirror-блоков (списки, таблицы, встроенные элементы). Слово "керамогранит" в списке под заголовком "Текстура" на подподстранице — не индексируется поисковым API.

### Решение
- **`deep_search(query, collection_id?)`** — новый инструмент #19. Сканирует ПОЛНЫЙ текст каждого документа, рекурсивно обходя все коллекции и вложенные страницы.
- Для страниц с пустым `text` (ProseMirror-only) — fallback через `document_export_markdown`.
- Дедупликация результатов по ID, сниппеты с контекстом.
- AI использует цепочку: `search` → если 0 результатов → `deep_search`.

### Файлы изменены
- `app.py` — `execute_deep_search_streaming()`, routing в `execute_action_streaming`, `deep_search` в `read_tools`
- `ai_agent.py` — инструмент #19, обновлён раздел «ПОИСК И НАВИГАЦИЯ», пример fallback
- `tests/test_extract_sections.py` — 8 новых тестов (`TestDeepSearch`)

### Тесты
254 теста, все проходят

---

## 2026-02-17 — Фикс: AI не создаёт страницы при поиске + ссылки на найденные документы

### Проблема 1: AI создавал страницы при поиске
При запросе «Найди информацию про растения» AI после нескольких итераций поиска предлагал создать новую страницу «Растения» с шаблоном.

### Проблема 2: Найденные документы не показывались в UI
При поиске AI находил страницу «Растения», говорил о ней в тексте, но ссылка/карточка не отображалась. Причина: `build_response()` перезаписывал `documents` при каждом новом результате. Последний пустой поиск (`"цветы"`, `"деревья"`) стирал ранее найденные документы.

### Исправлено
- **AI промпт** (`ai_agent.py`): раздел «ПОИСК И НАВИГАЦИЯ» — запрет на создание страниц при поисковых запросах.
- **Agentic loop** (`app.py`): сообщение продолжения запрещает создание страниц при поиске.
- **`build_response()`** (`app.py`): документы из нескольких поисков теперь НАКАПЛИВАЮТСЯ, а не перезаписываются. Дедупликация по ID, перенумерация.

### Файлы изменены
- `ai_agent.py` — SYSTEM_PROMPT: новый раздел «ПОИСК И НАВИГАЦИЯ»
- `app.py` — `build_response()` с аккумуляцией + обновлено сообщение продолжения agentic loop
- `tests/test_extract_sections.py` — 10 новых тестов (`TestBuildResponse` + `TestAIPromptRules`)

### Тесты
246 тестов, все проходят

---

## 2026-02-17 — Полный markdown через documents.export (таблицы + картинки)

### Что сделано
- **`document_export_markdown()`** в `yonote_client.py` — async export pipeline: `documents.export` → `fileOperations.info` (poll) → `fileOperations.redirect` → download. ~1.5s на документ.
- **Гибридный подход** в `extract_sections` и `copy_section`: обнаружение секций через быстрый `document_info`, а полный контент (таблицы, картинки, форматирование) через export только для страниц с найденной секцией.
- **`_resolve_export_urls()`** — конвертация относительных URL из export (`/api/attachments.redirect?id=...`) в абсолютные.
- **Исправлен парсер секций**: `##`-заголовки больше не обрезаются plain-text "заголовками" внутри секции (например, «Описание света» больше не считается границей секции «## Свет»).
- **Fallback**: если export не удался, работает прежняя логика (text + attachments.list + tag filtering).

### Файлы изменены
- `yonote_client.py` — `document_export_markdown()`
- `app.py` — `_resolve_export_urls()`, `_get_rich_text()`, обновлены `execute_extract_sections_streaming` и `execute_copy_section_streaming`, исправлен Path A в парсере
- `tests/test_extract_sections.py` — 8 новых тестов

### Тесты
98 тестов, все проходят

---

## 2026-02-17 — Исследование: ProseMirror JSON контент через Outline/Yonote API

### Задача
Найти способ получения полного блочного контента документов (включая таблицы, изображения, встроенные элементы) через API вместо lossy markdown-поля `text`.

### Ключевые находки

#### 1. Внутренняя структура хранения Outline/Yonote
- Документы хранятся в БД в **ProseMirror JSON** формате (колонка `content` типа JSONB)
- Поле `text` (markdown) помечено как **deprecated** в исходном коде Outline
- Поле `state` (BLOB) содержит Y.js collaborative state для real-time редактирования
- Markdown является **lossy-экспортом** из JSON — таблицы, изображения и другие блоки теряются

#### 2. Способ получения ProseMirror JSON через API
**Заголовок `x-api-version: 3`** в HTTP-запросе к `documents.info` меняет формат ответа:
- При `x-api-version >= 3`: ответ содержит поле `data` с полным ProseMirror JSON деревом
- При `x-api-version < 3` (по умолчанию): ответ содержит поле `text` с markdown
- Можно запросить оба формата одновременно через опции `includeData` и `includeText`

**Пример запроса:**
```python
headers = {
    "Authorization": "Bearer TOKEN",
    "Content-Type": "application/json",
    "x-api-version": "3"
}
response = requests.post(url + "/documents.info", headers=headers, json={"id": doc_id})
data = response.json()["data"]["data"]  # ProseMirror JSON дерево
```

#### 3. Структура ProseMirror JSON
Тип `ProsemirrorData`:
```typescript
type ProsemirrorData = {
  type: string;           // "doc", "paragraph", "heading", "table", "image", etc.
  content?: ProsemirrorData[];  // дочерние ноды
  text?: string;          // текстовое содержимое
  attrs?: JSONObject;     // атрибуты (level для heading, src для image, etc.)
  marks?: { type: string; attrs?: JSONObject }[];  // форматирование (bold, italic, link)
};
```

Корневой документ:
```json
{
  "type": "doc",
  "content": [
    {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Title"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Some text"}]},
    {"type": "image", "attrs": {"src": "...", "width": 800, "height": 600}},
    {"type": "table", "content": [
      {"type": "table_row", "content": [
        {"type": "table_cell", "content": [{"type": "paragraph", "content": [...]}]},
        {"type": "table_cell", "content": [...]}
      ]}
    ]}
  ]
}
```

#### 4. Дополнительные способы получения JSON
- **`documents.export`** с `format: "json"` — экспортирует один документ в JSON (но через file operation, асинхронно)
- **`collections.export_all`** с `format: "json"` — массовый экспорт всей коллекции
- Оба создают ZIP-файл с `.json` файлами для каждого документа

#### 5. Работа с блоками между документами (ProseMirror)
- Блоки можно переносить через JSON: извлечь поддерево из `content`, вставить в другой документ
- Для таблиц: структура `table` -> `table_row` -> `table_cell` -> `paragraph`/`text`
- Для изображений: нода `image` с `attrs.src` содержит URL вложения
- Для копирования блоков между документами: сериализовать в JSON, десериализовать через `nodeFromJSON`

#### 6. API версионирование
- `x-api-version: 2+` — оборачивает ответ в `{document: ...}` вместо плоского объекта
- `x-api-version: 3+` — добавляет поле `data` с ProseMirror JSON (основная находка)

#### 7. Yonote как форк Outline
Yonote основан на коммите `15b1069+` Outline (после перехода на TypeScript). API полностью совместим с Outline. Заголовок `x-api-version` должен работать идентично.

### Практические выводы для проекта
1. **Изображения**: доступны через `data` поле — нода `image` с `attrs.src`
2. **Таблицы**: полная структура с ячейками и содержимым доступна в JSON
3. **Решение проблемы**: добавить `x-api-version: 3` в заголовки `_post()` метода `YonoteClient`
4. **Совместимость**: можно получать и `data` (JSON) и `text` (markdown) одновременно

### Источники
- GitHub Discussion #7396: What storage format does/will Outline use?
- DeepWiki: Document Model and API (outline/outline)
- Outline source: server/presenters/document.ts (условие `x-api-version >= 3`)
- Outline source: server/models/Document.ts (колонки content JSONB, text TEXT deprecated)
- Outline source: shared/types.ts (тип ProsemirrorData)
- Outline API: getoutline.com/developers
- Outline changelog: JSON Import/Export (Feb 2023)

---

## 2026-02-17 — Компактный таймлайн + исключение untagged картинок
- **Таймлайн шагов**: свёрнут по умолчанию, показывает только текущий шаг + бейдж с количеством завершённых. Клик раскрывает всю историю.
- **Untagged картинки исключены**: `image.png` больше не попадает в секции. Только файлы с тегом в имени (`свет — описание.jpeg`) привязываются к секциям.

---

## 2026-02-17 — Дублирование, копирование секций, картинки с тегированием

### Что сделано
- **`duplicate_document`** — серверное дублирование документа через API `documents.duplicate`
- **`copy_section`** — извлечение секции из одного документа по заголовку → создание новой страницы
- **`attachments.list` интеграция с тегированием по имени файла** — картинки фильтруются по тегу в названии файла:
  - `#свет - фото освещения.png` → попадёт в секцию «Свет»
  - `свет - описание.png` → тоже попадёт (# необязателен)
  - `#цвет - палитра.png` → НЕ попадёт в секцию «Свет»
  - `image.png` → НЕ попадёт (untagged картинки исключаются)
  - `рассвет.png` → НЕ попадёт (часть слова, не тег)
- Целое слово: `свет` матчится, `рассвет` — нет
- Диагностика на реальных данных: 81 страница, 3 картинки через `attachments.list`
- AI-промпт: 18 инструментов

### Файлы изменены
- `yonote_client.py` — `document_duplicate()`, `attachments_list()`
- `app.py` — `_match_image_to_heading()`, `fetch_document_images(heading=)`, tools, обогащение секций
- `ai_agent.py` — SYSTEM_PROMPT
- `tests/test_extract_sections.py` — 28 новых тестов

### Тесты
90 тестов, все проходят

---

## 2026-02-17 — Диагностика изображений: выявлено ограничение API

### Проблема (оригинальная)
Изображения из исходных документов не появлялись в создаваемых через `extract_sections` документах.

### Что было сделано
- Реализован `resolve_attachment_refs(text)` в `app.py` и `get_attachment_url()` в `yonote_client.py`
- Написаны тесты (`TestResolveAttachmentRefs`, 6 тестов)
- Пересоздан сломанный venv (конфликт версий Flask/Werkzeug)

### Диагностика на реальных данных
Проверка документа «1 этаж, Гости» (ID: `320cfa7f-...`) показала:
- Поле `text` содержит 937 символов чистого текста — **без единой image-ссылки**
- `documents.export` создаёт асинхронный ZIP-job, не подходящий для реального времени

### Вывод
**Изображения в Yonote хранятся как ProseMirror-блоки** и не попадают в markdown-поле `text`. Это фундаментальное ограничение API, не связанное с кодом. `resolve_attachment_refs` технически корректна, но применять её не к чему.

### Нерешённые вопросы
Выбор стратегии работы с изображениями:
- **A** — принять ограничение (текст без картинок)
- **B** — async export через `documents.export` + polling (медленно)
- **C** — добавлять ссылки на оригинальные страницы Yonote

### Тесты
191 тест, все проходят за ~0.36с
- **53 теста, все проходят**

---

## 2026-02-17 — Исправление парсера: Format B (plain text без пустых строк)

### Проблема
Страницы в Yonote используют два разных формата заголовков в API:
- **Format A** (`## Heading` или plain text с пустыми строками) — работал ✓
- **Format B** (plain text без пустых строк вокруг заголовка) — не работал ✗

Реальный пример Format B из API страницы «1 этаж, Гости»:
```
Геометрия\nСтык через металл профиль\nСвет\nСветло\nМягко\n\nЦвет\n...
```
«Свет» шёл сразу после «Никаких треков...» без пустых строк. Наша эвристика требовала пустые строки с обеих сторон — и не находила его.

### Решение: двухпутёвый алгоритм

- **Path A** (строгий): `## headings` + plain text с пустыми строками с обеих сторон
- **Path B** (для Format B): если Path A не нашёл — ищет точное совпадение строки с заголовком (`_is_plain_heading_candidate`), конец секции — первая строка после пустой строки

Вспомогательная функция `_is_plain_heading_candidate()` вынесена из дубляжа.

### Тесты
- **185 тестов** (было 182): 3 новых — `test_format_b_no_empty_lines_around_heading`, `test_format_b_search_second_section`, `test_format_b_last_section`

---

## 2026-02-17 — Диагностика + починка venv + агент-ревью проекта

### Проблема
Все тесты и импорты `app.py` зависали бесконечно. Причина: `venv` был создан в директории «Новая папка 2» — старом пути проекта до переименования в «yonote-mcp». После переноса `import urllib3` вешал процесс из-за битых симлинков.

### Исправлено
- **Пересоздан venv**: `rm -rf venv && /opt/homebrew/bin/python3 -m venv venv`
- **Переустановлены зависимости**: `pip install -r requirements.txt`
- **181 тест проходит за 0.38с** (было: зависание навсегда)

### Агент-ревью (параллельные агенты)
Запущены три агента одновременно для проверки проекта:

**Парсер:** все функции работают — `extract_section_from_text`, `_strip_markdown_formatting`, `fetch_all_descendants`, breadcrumbs, картинки, таблицы

**UI/CSS (оценка 6.5/10):**
- Хорошо: timeline шагов, кнопки подтверждения, светлая тема, XSS-защита (`escapeHtml`)
- Проблемы: нет `aria-label`, контрастность не WCAG AA, нет `.catch()` на `reader.read()`, `agent_add_context` — утечка соединений, сайдбар не работает на мобильных

**API интеграция:** все 16 инструментов AI совпадают с реальными методами; все endpoints покрыты тестами

---

## 2026-02-17 — Робастный парсер секций + хлебные крошки

### Исправлено: страницы с картинками пропускались при извлечении секций
- **Проблема**: картинки (`![...]`), ссылки (`[...]`), цитаты (`> ...`), таблицы (`| ... |`) ложно определялись как заголовки и «разрезали» секцию. Также строки с пунктуацией (`.!?`) становились ложными заголовками
- **Форматированные заголовки** (`## **Свет**`, `## *Свет*`, `**Свет**`) теперь корректно распознаются — `_strip_markdown_formatting()` снимает `*`, `_`, `~~`, `` ` `` перед сравнением
- **Различение list items и bold**: `* item` (пробел после `*`) = список, `**text**` = жирный заголовок
- **Видимость ошибок**: `except Exception: pass` заменён на SSE-статусы — теперь видно какие страницы не прочитались и где секция не найдена
- **Защита от None**: `text = doc.get("text", "") or ""` — защита от `{"text": null}` из API

### Добавлено: хлебные крошки
- **Параметр `breadcrumbs`** в `extract_sections`: если `true`, под каждым заголовком секции добавляется путь курсивом: *Авгодом → Интерьер → 1 этаж, Гости*
- **Отслеживание пути** в `fetch_all_descendants`: каждая страница хранит полный путь от корня
- **AI промпт**: AI передаёт `breadcrumbs=true` только когда пользователь упоминает «хлебные крошки»

### Тесты
- **181 тестов** (было 164): 17 новых — bold/italic заголовки, таблицы, картинки, ссылки, цитаты, error/skip reporting + хлебные крошки

---

## 2026-02-17 — Рекурсивный обход всех уровней вложенности (extract_sections)

### Проблема
`extract_sections` обходил только прямых детей родительской страницы (1 уровень). Реальная структура Yonote: `Авгодом → Интерьер → 1 этаж, Гости` — секции «Свет» находились на 2-3 уровне вложенности.

### Решение
- **`fetch_all_descendants(parent_id)`** — рекурсивная функция (BFS), собирает ВСЕ потомки на любом уровне вложенности
- `execute_extract_sections_streaming` теперь использует `fetch_all_descendants` вместо одного вызова `documents_list`
- Статус: «Найдено N страниц на всех уровнях вложенности»
- Устойчивость к ошибкам API: если ветка не читается — пропускается

### Тесты
- **164 теста** (было 157): 7 новых — рекурсивный обход (2-3 уровня), множественные ветки, ошибки API, unit-тесты `fetch_all_descendants`

---

## 2026-02-17 — Извлечение секций из подстраниц (extract_sections)

### Добавлено
- **Инструмент `extract_sections`** (#16): автоматически читает все дочерние страницы родительского документа, находит секцию под указанным заголовком в каждой, собирает в отчёт и создаёт новую страницу
- **`extract_section_from_text()`**: программный парсер секций — определяет заголовки (markdown `##` и plain text) и извлекает текст от заголовка до следующего. Heuristic: заголовок = короткая строка, окружённая пустыми строками с обеих сторон
- **`parentDocumentId`** в `documents_list` — получение дочерних страниц документа
- **Стриминговые статусы**: «Читаю «1 этаж, Гости» (1/10)...» → «Найдено в 5 из 10...» → «Создаю страницу...»
- **AI промпт**: описание extract_sections + list_children, пример 2-шагового использования (search → extract_sections)
- **`max_iterations`** увеличен с 5 до 10

### Формат отчёта
```
Заголовок: «Отчет по свету»
## 1 этаж, Гости
(текст из блока «Свет» этой страницы)

## 2 этаж, Спальня
(текст из блока «Свет» этой страницы)
```

### Тесты
- **157 тестов** (было 138): 19 новых тестов — парсер секций (plain text, markdown, edge cases) + стриминговый генератор

## 2026-02-17 — Таймлайн шагов выполнения

### Проблема
При выполнении многошаговых задач (поиск → анализ → создание) одиночный статус-индикатор заменялся на каждом шаге. Пользователь не видел прогресс, не понимал на каком этапе находится задача и работает ли сервис вообще.

### Исправлено
- **Таймлайн шагов**: каждый SSE-событие `status` добавляет новый шаг в визуальный таймлайн, а не заменяет предыдущий
- **Состояния шагов**: активный (спиннер), завершённый (галочка), ошибка (крестик)
- **Время выполнения**: справа от каждого шага показывается время в секундах
- **Ошибки inline**: ошибки отображаются как шаг с красным крестиком + блок с текстом ошибки
- **Плавные анимации**: шаги появляются с slide-in анимацией, таймлайн становится полупрозрачным после завершения

## 2026-02-16 — Исправлена потеря изображений при переводе

### Проблема
При переводе документа одно из 5 изображений (`attachment:6585bda1-...`) поглощалось блоком кода. Причина: «permissive code continuation» (допуск до 2 не-code строк между code строками) захватывала строку `![Untitled](<attachment:...>)` между CSS-классами.

### Исправлено
- **Немедленный break на изображениях**: строки `![...` всегда прерывают code_block — изображения никогда не являются кодом
- **Lookahead не пересекает изображения**: при проверке «продолжается ли код через 1-2 строки» — если встречается изображение, bridging прекращается
- Все 5 изображений из реального документа теперь корректно определяются как `image` блоки (было 4)

### Тесты
- **138 тестов**, все проходят (без изменений — существующие тесты уже покрывали сценарий)

## 2026-02-16 — Заголовки и кликабельные ссылки в переведённых документах

### Проблема
Yonote API не возвращает `#` для заголовков и не форматирует ссылки. Переведённые документы отображались как сплошной текст без визуальной структуры.

### Добавлено
- **Эвристическое определение заголовков** (`_is_heading_candidate()`):
  - Короткие строки (< 100 символов), не заканчивающиеся на `.` или `,`
  - После section break: пустой строки, изображения, URL, блока кода
  - После строки с URL (конец секции)
  - Первая строка документа
  - Добавляется `## ` префикс в выводе
- **Кликабельные ссылки**: standalone URL → `[url](url)` markdown-формат
- Строки с текстом + URL (напр. "Кнопки https://...") НЕ переформатируются

### Тесты
- **138 тестов** (было 124): 10 тестов для heading detection, 4 теста для URL/heading в Yonote sample

## 2026-02-16 — Правильное форматирование создаваемых документов в Yonote

### Проблема
Yonote API возвращает текст с `\n` (одинарными переносами), но при создании документа трактует текст как **markdown**, где одинарный `\n` — тот же абзац. Результат: все строки склеиваются, код отображается как текст, нет разделения между блоками.

### Исправлено
- **`blocks_to_yonote_markdown()`**: новая функция вывода для создания документов в Yonote
  - `\n\n` между всеми блоками → каждая строка = отдельный абзац
  - Код оборачивается в ``` fences → отображается как блок кода
  - Уже fenced код (```) не оборачивается повторно
  - Empty-блоки пропускаются (разделение уже обеспечено `\n\n`)
- **`execute_translate_streaming()`**: использует `blocks_to_yonote_markdown()` вместо `blocks_to_markdown()`
- **`translate_document_blocks()`**: аналогично обновлён

### Тесты
- **124 теста** (было 116): добавлены 8 тестов для `blocks_to_yonote_markdown` (абзацы, code fences, URL, изображения, real Yonote sample)

## 2026-02-16 — Улучшенное определение кода: CSS-классы, JS-свойства, label'ы

### Проблема
Парсер пропускал CSS-классы (`remake-link-button`), JS-свойства (`LEFT_MENU:"Мои курсы",`) и метки в комментариях (`LEFT_MENU — левое меню`). Из 63 «переводимых» блоков 42 были ложными — CSS-классы и код внутри JS-комментариев отправлялись в DeepSeek.

### Исправлено
- **3 новых regex-паттерна**:
  - CSS-классы: `^[a-z][a-z0-9]*(-[a-z0-9]+)+$` (remake-link-button, remake-icon-tg-3)
  - UPPER_CASE key:value: `^\s*[A-Z][A-Z_0-9]+\s*[:=]` (LEFT_MENU:"Мои курсы",)
  - UPPER_CASE em-dash label: `^\s*[A-Z][A-Z_0-9]+\s*[—–]` (LEFT_MENU — левое меню)
- **Permissive code continuation**: допускается до 2 не-code строк между code строками, если далее снова код (для JS-комментариев с текстовыми метками)
- Кириллица НЕ совпадает с `[A-Z]` — русский текст вроде «ВАЖНО!» корректно остаётся переводимым

### Тесты
- **116 тестов** (было 110): добавлены тесты для CSS-классов, JS-свойств, label'ов, кириллицы

## 2026-02-16 — Эвристический парсер для Yonote (без markdown-разметки)

### Проблема
Yonote API возвращает текст документов БЕЗ стандартной markdown-разметки — нет `#` заголовков, нет ``` code fences. UI Yonote рендерит их красиво, но в API поле `text` содержит плоский текст. Старый парсер искал markdown-синтаксис, которого нет, и весь текст уходил на перевод как есть.

### Исправлено
- **Полная переработка `markdown_processor.py`**: эвристический парсер, определяющий код без ``` fences
- **15 regex-паттернов для кода**: JS-комментарии (`/* */`, `//`), ключевые слова (`const`, `function`, `class`), jQuery (`$(`), `window.`, `document.`, tree-диаграммы (`├──`, `└──`), строки с `;` и `{`
- **Каждая строка — отдельный блок**: предотвращает склеивание строк в параграфы (и последующее искажение при переводе DeepSeek)
- **Группировка кода**: последовательные code-like строки объединяются в один `code_block` (с пропуском пустых строк внутри)
- **URL-only строки**: детектируются и не отправляются на перевод
- **Alpha ratio heuristic**: строки с < 30% букв и > 3 символов считаются кодом

### Тесты
- **110 тестов** (было 97): полная переработка тестов парсера с реальным текстом из Yonote API (`YONOTE_SAMPLE`)
- Классы: `TestIsCodeLine`, `TestIsUrlOnly`, `TestParseMarkdownBlocks`, `TestYonoteSampleDocument`, `TestBlocksToMarkdown`, `TestTranslateDocumentStreaming`

## 2026-02-16 — Потоковые статусы при переводе

### Исправлено
- **Нет обратной связи при переводе**: после нажатия «Да, давай» кнопки исчезали и 2 минуты ничего не происходило — пользователь не понимал, что сервис работает
- **Фронтенд**: мгновенный статус «Выполняю...» сразу после нажатия кнопки подтверждения
- **Бэкенд**: `execute_translate_streaming()` — генератор, который yield-ит SSE-события в реальном времени во время перевода (а не буферизует их до конца)
- Пользователь видит: «Загружаю оригинал...» → «Перевожу блок 1/5...» → «Перевожу блок 2/5...» → «Создаю страницу...» → Готово!
- `execute_action_streaming()` — единый интерфейс для всех инструментов: стриминговый для translate_document, обычный для остальных

### Тесты
- 97 тестов (было 95): добавлены тесты для стриминговых генераторов

## 2026-02-16 — Блочный перевод документов с сохранением форматирования

### Добавлено
- **Модуль `markdown_processor.py`**: парсер markdown на типизированные блоки (heading, code_block, image, list, paragraph, empty, horizontal_rule)
- **Блочный переводчик**: `translate_document_blocks()` переводит только текстовые блоки через DeepSeek API, код/картинки/ссылки сохраняет программно
- **Инструмент `translate_document`**: новый инструмент AI (#15) — перевод документа в один вызов с полным сохранением структуры
- **Бэкенд-обработка перевода** в `execute_tool`: загружает документ → парсит блоки → переводит текст → собирает → создаёт новую страницу

### Исправлено
- **Потеря форматирования при переводе**: раньше AI (DeepSeek) получал весь markdown и возвращал плоский текст без заголовков, кода, ссылок. Теперь структура сохраняется программно на бэкенде.
- **AI промпт**: добавлено правило «для переводов ВСЕГДА использовать translate_document» с примером

### Тесты
- 95 тестов (было 71): добавлены 24 теста для парсера, roundtrip, блочного перевода, execute_tool translate_document

## 2026-02-16 — Исправление форматирования ссылок в документах

### Исправлено
- **Ссылки в создаваемых документах**: ранее AI сваливал все URL в одну строку — теперь каждая ссылка отображается отдельным пунктом в markdown-списке с кликабельным форматом `[url](url)`
- **AI-промпт обновлён**: добавлен раздел «ФОРМАТИРОВАНИЕ СОЗДАВАЕМОГО КОНТЕНТА» с правилами и примерами правильного/неправильного оформления списков
- **Бэкенд-обработка `format_text_for_yonote()`**: автоматически определяет и разбивает множественные URL на одной строке в markdown-список (подстраховка на случай, если AI не отформатирует)
- Применяется при `create_document` и `update_document`

### Тесты
- 71 тест (было 62): добавлены 9 тестов для `format_text_for_yonote` (пустые строки, одиночные URL, множественные URL, сохранение markdown-структуры)

## 2026-02-16 — Нумерация документов + Сохранение форматирования

### Добавлено
- **Нумерация документов**: результаты поиска и списки пронумерованы (1, 2, 3...) — можно ссылаться по номеру ("переведи 1 документ")
- **Номера в UI**: визуальные бейджи с номерами рядом с каждым документом
- **Нумерация в AI-контексте**: AI понимает ссылки по номеру из результатов

### Исправлено
- **Markdown-форматирование при переводе**: добавлены подробные правила и примеры правильного/неправильного перевода в промпт AI
- **Сохранение структуры**: заголовки (##), списки (-), ссылки, изображения, переносы строк теперь должны сохраняться
- **max_tokens увеличен до 8000**: для работы с большими документами с полным форматированием
- **timeout увеличен до 60с**: для длительных операций перевода

## 2026-02-16 — Краткость ответов AI + Усечение контента в UI

### Исправлено
- **AI больше не дублирует содержимое документов** в `response_template`: добавлены правила КРАТКОСТЬ ОТВЕТОВ в промпт
- **AI не вызывает `document_info` после `search`** без необходимости — поиск теперь отдаёт только список найденных документов
- **Длинный контент обрезается в UI**: документы > 300 символов показываются с кнопкой «Показать полностью» / «Свернуть»

## 2026-02-16 — Agentic Loop + Расширенный API

### Добавлено
- **Agentic loop**: AI выполняет многошаговые задачи — читает документ, анализирует, предлагает создание/изменение (до 5 итераций)
- **Сохранение контента**: при переводе/копировании AI сохраняет markdown, изображения, ссылки
- **Новые API endpoints из yonote-mcp**: move, archive, restore, drafts, viewed, create/delete collection
- **`append` режим**: `document_update` поддерживает добавление текста в конец документа
- **14 инструментов AI** (было 7): move_document, archive_document, restore_document, list_drafts, list_viewed, create_collection, delete_collection
- **max_tokens увеличен до 4000**: для работы с большими документами и переводами

### Тесты
- 62 теста (было 46): покрытие agentic loop, новых endpoints и execute_tool

## 2026-02-16 — Подтверждение действий + Bugfix: collectionId

### Добавлено
- **Подтверждение мутирующих действий**: AI спрашивает перед create/update/delete, ждёт подтверждения пользователя
- **Кнопки «Да, давай» / «Отмена»** в UI: кликабельное подтверждение вместо ввода текста
- **Endpoint `/api/confirm`**: выполняет ранее предложенные pending actions после подтверждения
- **SSE-событие `confirm`**: новый тип события для передачи pending actions во фронтенд
- **Хранилище `pending_actions_store`**: серверное хранение действий, ожидающих подтверждения

### Исправлено
- **Ошибка 400 при создании документов**: `collectionId` теперь автоматически подставляется (первая доступная коллекция), если не указан
- **Промпт AI обновлён**: чёткое разделение на read-действия (сразу) и write-действия (через pending_actions)
- **Reset очищает pending actions**: `/api/reset` теперь также сбрасывает ожидающие подтверждения

### Тесты
- 46 тестов (было 40): добавлены тесты для pending_actions, /api/confirm, сброса, хранения

## 2026-02-16 — Bugfix: ссылки и {result}

### Исправлено
- **Ссылки на документы**: автоматическое определение URL воркспейса через `auth.info` API, все ссылки теперь полные (напр. `https://remake.yonote.ru/doc/...`)
- **{result} плейсхолдер**: обновлён промпт AI, добавлена очистка плейсхолдеров в `build_response`
- **Тесты**: добавлены тесты для `full_url`, `get_workspace_url`, очистки плейсхолдеров (40 тестов)

## 2026-02-16 — AI Integration + Light Theme

### Добавлено
- **DeepSeek AI агент** (`ai_agent.py`): принимает запросы на естественном языке, решает какие Yonote API вызвать, поддерживает контекст диалога
- **Новый API** (`/api/chat`): AI-driven endpoint вместо командного парсера
- **Сброс контекста** (`/api/reset`): очистка истории диалога с AI

### Изменено
- **Светлая тема**: полный редизайн CSS — белый фон, мягкие тени, синие акценты
- **Фронтенд**: UI переделан под AI-чат, убраны жёсткие команды, добавлены подсказки на естественном языке
- **Тесты**: обновлены под новую архитектуру (33 теста: клиент, AI-агент, execute_tool, build_response)

## 2026-02-16 — MVP Release

### Добавлено
- **Yonote API клиент** (`yonote_client.py`): поддержка collections.list, collections.info, collections.documents, documents.list, documents.info, documents.search, documents.create, documents.update, documents.delete
- **Flask бэкенд** (`app.py`): SSE-стриминг статусов выполнения
- **Фронтенд**: двухпанельный UI (сайдбар + чат), быстрые действия, история чатов, real-time статусы
- **Тесты**: 28 тестов для API-клиента
- **Документация**: architecture.md, project_status.md, changelog.md
