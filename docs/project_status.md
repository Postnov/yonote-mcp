# Статус проекта — Yonote Manager

## Этапы разработки

### Этап 1: MVP ✅
- [x] Yonote API клиент (search, create, update, delete, list)
- [x] Flask бэкенд с SSE-стримингом статусов
- [x] UI чата с двухпанельным макетом
- [x] Тесты
- [x] Документация

### Этап 2: AI + Light Theme ✅
- [x] Подключение DeepSeek AI как "мозга" для управления Yonote
- [x] AI-агент: парсит запросы на естественном языке, решает какие API вызвать
- [x] Светлая тема (полный редизайн CSS)
- [x] Обновлён фронтенд под AI-чат (убраны команды, добавлен NLP)
- [x] Тесты обновлены (33 теста, все проходят)

### Этап 2.5: Bugfixes + Confirmation Flow ✅
- [x] Исправлены ссылки на документы (определение workspace URL через `auth.info`)
- [x] Исправлен `{result}` плейсхолдер в ответах AI
- [x] Исправлена ошибка 400 при создании документов (автоподстановка `collectionId`)
- [x] Подтверждение действий: AI спрашивает перед мутирующими операциями
- [x] Кнопки «Да, давай» / «Отмена» в UI для подтверждения
- [x] Новый endpoint `/api/confirm` для выполнения подтверждённых действий
- [x] Тесты обновлены (46 тестов, все проходят)

### Этап 3: Agentic Loop + Расширенный API ✅
- [x] Agentic loop: AI выполняет многошаговые задачи (read → analyze → create)
- [x] Сохранение контента при переводе/копировании (markdown, изображения, ссылки)
- [x] Новые endpoints из yonote-mcp: move, archive, restore, drafts, viewed, collection CRUD
- [x] `append` режим для document_update
- [x] 14 инструментов AI (было 7)
- [x] 62 теста, все проходят

### Этап 4: Улучшения (Планируется)
- [ ] Markdown-рендеринг контента документов в UI
- [ ] Сохранение истории чатов в localStorage
- [ ] Фильтрация по коллекциям в UI
- [ ] Пагинация результатов
- [ ] Загрузка файлов/изображений через attachments.create

### Этап 3.5: Блочный перевод документов ✅
- [x] Markdown-парсер: разбивает документ на типизированные блоки (heading, code_block, image, list, paragraph)
- [x] Блочный переводчик: переводит только текстовые блоки, код/картинки/ссылки сохраняет программно
- [x] Инструмент `translate_document` в AI и бэкенде — перевод в один вызов
- [x] AI промпт обновлён — для переводов использует translate_document вместо ручного чтения+создания
- [x] 95 тестов, все проходят

### Этап 5: UX — Таймлайн шагов ✅
- [x] Статус-бар заменён на таймлайн шагов: каждый шаг виден, спиннер → галочка → ошибка
- [x] Время выполнения каждого шага
- [x] Ошибки отображаются inline в таймлайне

### Этап 6: Извлечение секций из подстраниц ✅
- [x] `parentDocumentId` в `documents_list` — получение дочерних страниц
- [x] `extract_section_from_text()` — программный парсер секций по заголовку
- [x] `extract_sections` — стриминговый инструмент: чтение дочерних страниц → парсинг → компиляция отчёта → создание документа
- [x] AI промпт обновлён — extract_sections + list_children
- [x] `max_iterations` увеличен до 10
- [x] Рекурсивный обход: `fetch_all_descendants()` — BFS по всем уровням вложенности
- [x] Хлебные крошки (`breadcrumbs`): путь к каждой секции в отчёте (*Авгодом → Интерьер → Гости*)
- [x] Робастный парсер: картинки, таблицы, bold/italic заголовки, пунктуация
- [x] Видимость ошибок: SSE-статусы для пропущенных/ошибочных страниц
- [x] 181 тестов, все проходят

### Этап 7: Диагностика и починка окружения ✅
- [x] Обнаружена причина зависания тестов: venv был создан в старой директории «Новая папка 2» и сломался при переименовании проекта
- [x] Пересоздан venv на базе `/opt/homebrew/bin/python3`
- [x] Переустановлены все зависимости из `requirements.txt`
- [x] Проверка всех трёх компонентов командой агентов: парсер (181 тест), UI/CSS (оценка 6.5/10), API интеграция (все endpoints покрыты)

### Этап 8: Поддержка Format B в парсере секций ✅
- [x] Обнаружены два формата Yonote: Format A (`## heading` / plain text с пустыми строками) и Format B (plain text без пустых строк)
- [x] Двухпутёвый алгоритм: Path A (строгий) → Path B (exact match + next-after-empty-line)
- [x] Отдельная функция `_is_plain_heading_candidate()` без дубляжа
- [x] Диагностика empty_text_pages vs section_not_found_pages в SSE
- [x] 185 тестов, все проходят

### Этап 9: Исследование изображений — выявлено ограничение API ⚠️
- [x] Реализован `resolve_attachment_refs(text)` + `get_attachment_url(uuid)` (код работает корректно)
- [x] Пересоздан сломанный venv (конфликт Flask/Werkzeug)
- [x] **Диагностика на реальных данных**: поле `text` у документов Yonote НЕ содержит изображений
- [x] Изображения хранятся как **ProseMirror-блоки** — они не отражаются в markdown-поле `text`
- [x] `documents.export` создаёт асинхронный ZIP-job (не подходит для реального времени)
- [x] 191 тест, все проходят

### Этап 10: Дублирование, копирование секций, обогащение картинками ✅
- [x] `duplicate_document` — серверное дублирование через API (сохраняет всё, включая картинки)
- [x] `copy_section` — извлечение секции из одного документа → создание новой страницы
- [x] `attachments_list()` в `yonote_client.py` — запрос вложений документа
- [x] `fetch_document_images()` — хелпер: получает image-вложения, возвращает markdown
- [x] `extract_sections` и `copy_section` обогащены: подгружают картинки через `attachments.list` и вставляют их в секцию
- [x] Диагностика на реальных данных: 81 страница, 3 картинки найдены через `attachments.list`
- [x] AI-промпт обновлён: 18 инструментов, правила выбора между duplicate/copy/extract
- [x] Тегирование картинок по имени файла: `#свет - описание.png` → привязка к секции «Свет»
- [x] `_match_image_to_heading()` — whole-word matching (не путает «свет» и «рассвет»)
- [x] Логика: tagged match → включить, tagged mismatch/untagged → исключить
- [x] UX: таймлайн шагов свёрнут по умолчанию, показывает только текущий шаг + счётчик завершённых, раскрывается по клику
- [x] 90 тестов, все проходят

### ⚠️ Известное ограничение API Yonote
Изображения в документах хранятся в блочном (ProseMirror) формате и недоступны через поле `text` в `documents.info`. Обходные пути:
- **`attachments.list`** — возвращает список вложений документа (включая картинки). Привязка к документу, но НЕ к секции. Используется в `extract_sections` и `copy_section` для добавления картинок в конец секции.
- **`duplicate_document`** — серверная копия через `documents.duplicate`, сохраняет ВСЁ содержимое.

### Этап 11: Полный markdown через documents.export ✅
- [x] `x-api-version: 3` не работает в Yonote (старая версия Outline)
- [x] `documents.export` → `fileOperations.redirect` → полный markdown с таблицами, картинками, `##` заголовками
- [x] `document_export_markdown()` в `yonote_client.py` — обёртка над async export pipeline (~1.5s на документ)
- [x] Гибридный подход: обнаружение секций через быстрый `document_info`, обогащение через export только для найденных
- [x] `_resolve_export_urls()` — конвертация относительных URL картинок в абсолютные
- [x] Парсер секций: `##`-заголовки больше не обрезаются plain-text "заголовками" внутри секции
- [x] Fallback: если export не удался, работает прежняя логика (text + attachments.list)
- [x] 98 тестов, все проходят

### Этап 11.5: Фильтрация результатов поиска ✅
- [x] Фильтрация пустых страниц (text="") с ranking < 1e-10
- [x] Сниппеты текста с подсветкой совпадений
- [x] Информативное сообщение при отсутствии релевантных результатов
- [x] AI промпт обновлён: при пустом поиске пробовать другие подходы
- [x] 98 тестов, все проходят

### Этап 11.6: Фикс поиска — AI не создаёт страницы + ссылки на документы ✅
- [x] AI промпт: раздел «ПОИСК И НАВИГАЦИЯ» — запрет на создание страниц при поисковых запросах
- [x] Agentic loop: сообщение продолжения запрещает создание страниц при поиске
- [x] `build_response()`: документы из нескольких поисков аккумулируются (не перезаписываются), дедупликация по ID
- [x] 246 тестов, все проходят

### Этап 12: Глубокий поиск (deep_search) ✅
- [x] `deep_search(query, collection_id?)` — полнотекстовый поиск по содержимому всех документов (инструмент #19)
- [x] Рекурсивный обход: все коллекции → документы → вложенные страницы (до 5 уровней)
- [x] Fallback: для страниц с пустым `text` (ProseMirror) — `document_export_markdown`
- [x] AI промпт: цепочка search → deep_search при 0 результатах
- [x] Двухфазный алгоритм: Phase 1 (быстрый скан text) → Phase 2 (экспорт каждой страницы, если Phase 1 не нашёл)
- [x] Обнаружение скрытых коллекций: `documents.list()` без `collectionId` находит документы из коллекций, не возвращаемых `collections.list` (личные/приватные)
- [x] Оптимизация: пре-скан discovery-документов (бесплатно), ранний выход без рекурсии при найденных совпадениях
- [x] 257 тестов, все проходят

### Этап 13: Миграция на JS-фронтенд + PHP-бэкенд ✅
- [x] PHP-бэкенд: `api/proxy.php` (CORS-прокси), `api/settings.php` (CRUD), `api/db.php` (SQLite), `.htaccess`
- [x] JS-модули: `event-bus.js`, `config.js`, `yonote-client.js`, `ai-agent.js`, `markdown-processor.js`
- [x] Агентный цикл: `tool-executor.js` — порт app.py (19 инструментов, pending actions, deep_search, extract_sections, translate, copy_section)
- [x] UI: `index.html`, `css/style.css`, `js/ui.js`, `js/main.js` — порт с рефакторингом (EventBus вместо SSE, модалка настроек)
- [x] Тесты: 165 JS-тестов (vitest) — порт всех Python-тестов
- [x] Очистка: удалены Python-файлы (app.py, yonote_client.py, ai_agent.py, markdown_processor.py, debug_*.py, requirements.txt, templates/, static/, venv/, __pycache__/)
- [x] Документация обновлена

### Этап 14: Настройки рабочих страниц ✅
- [x] Три новых поля в настройках: «Страница с тегами», «Страница для поиска», «Страница для отчетов»
- [x] PHP-бэкенд: 3 новых ключа (tags_page_id, default_search_page_id, reports_page_id)
- [x] UI: секция «Рабочие страницы» в модалке настроек с подсказками
- [x] Парсинг URL → ID документа (extractDocumentId)
- [x] ToolExecutor: отчеты (extract_sections, copy_section) автоматически создаются внутри reports_page_id
- [x] AI Agent: системный промпт динамически включает настройки рабочих страниц
- [x] CSS: стили для секций и подсказок в модалке
- [x] deep_search автоматически ограничивает поиск подстраницами default_search_page_id
- [x] AI промпт усилен: при наличии «страницы для поиска» не ищет по всем коллекциям
- [x] 185 тестов, все проходят

### Этап 14.1: Фикс slug ID → UUID + пропагация ошибок ✅
- [x] `_resolveDocumentId(idOrSlug)` — резолвит slug ID (например `avgodom-EmozI4aR08`) в UUID через `documentInfo`, с кэшированием
- [x] deep_search: резолвит `default_search_page_id` и `parent_document_id` перед `_fetchAllDescendants`
- [x] extract_sections: всегда резолвит `parent_document_id` в UUID (раньше slug не работал с `documents.list`)
- [x] copy_section и extract_sections: резолвят `reports_page_id` перед `documentCreate`
- [x] list_documents: резолвит `parent_document_id` для корректной работы с slug ID
- [x] `_buildResponse`: когда шаблон "Готово!" и документ не создан — показывает ошибки инструментов вместо скрытого "Готово!"
- [x] 199 тестов, все проходят

### Этап 15: Замена чата на инструмент создания отчётов ✅
- [x] Полная переделка `index.html` — тёмный header, hero-секция, теги, кнопка действия, прогресс, результат
- [x] Новый дизайн `css/style.css` — минималистичный, центральная колонка 640px, tag chips, gradient кнопка, skeleton loading, result cards
- [x] Переписан `js/ui.js` — parseTags, loadAndRenderTags, selectTag, startReport, showReportResult/Error, timeline сохранён
- [x] Упрощён `js/main.js` — убран AIAgent, ToolExecutor с agent=null
- [x] Новые тесты `tests/report-ui.test.js` — 20 тестов (parseTags, startReport flow, extractDocumentId)
- [x] Фикс 403 при создании отчёта: collectionId берётся из родительского документа (reports_page), а не из первой коллекции
- [x] 221 тест, все проходят

### Этап 15.1: Хлебные крошки, дата в названии, история отчётов ✅
- [x] `breadcrumbs: true` всегда передаётся в `extract_sections`
- [x] Дата и время в названии отчёта в Yonote: «Отчет: Свет — 23 февраля 2026. 16:12»
- [x] `formatReportDate(date)` и `formatReportTitle(tagName, date)` — форматирование даты на русском
- [x] Sidebar с историей созданных отчётов (localStorage)
- [x] Клик по элементу истории → открыть в Yonote
- [x] Переименование элементов истории (inline edit)
- [x] 228 тестов, все проходят

### Этап 15.2: Создание отчёта по нескольким темам ✅
- [x] Мульти-выбор тегов: клик toggle'ит тег (можно выбрать несколько)
- [x] Кнопка адаптируется: 1 тег → «по «Свет»», 2-3 → перечисление, 4+ → счётчик
- [x] `_executeExtractSections` поддерживает `headings[]` — сканирует страницы один раз, ищет секции по всем темам
- [x] Формат: группировка по темам с `# Тема` → `## Страница` → контент, разделитель `---`
- [x] Backward compat: `heading` (строка) работает как раньше
- [x] Результат: `headings_found` с per-heading breakdown в UI
- [x] Название: «Отчет: Свет, Цвет, Полы — дата»
- [x] История: метка «#Свет, #Цвет, #Полы»
- [x] 239 тестов, все проходят

### Этап 16: Система проектов ✅
- [x] PHP-бэкенд: `api/projects.php` — полный CRUD (GET list, GET single, POST create, PUT update, DELETE)
- [x] Валидация данных: только `tags_page_id`, `default_search_page_id`, `reports_page_id` в data
- [x] `js/config.js` — project context: `setProject()`, `clearProject()`, `getProject()`, `get()` с приоритетом проектных настроек
- [x] `js/project-api.js` — API-клиент: `list()`, `get()`, `create()`, `update()`, `delete()`
- [x] `js/router.js` — hash-based SPA роутер: `#/projects`, `#/project/:id`, редирект по умолчанию
- [x] `index.html` — два контейнера видов (viewProjects, viewReport), кнопка «Проекты» в header
- [x] CSS — стили: projects grid, project cards, модалки создания/удаления, кнопка назад, view switching
- [x] `js/ui.js` — `renderProjectsView()`, `showProjectModal()`, `showDeleteConfirm()`, `initReportView()` (рефакторинг initUI), история скоупирована по проекту
- [x] `js/main.js` — роутер с двумя маршрутами, ToolExecutor создаётся при входе в проект
- [x] Настройки (⚙) — только глобальные (API-токены), page ID переехали в проект
- [x] `api/settings.php` — убраны page ID из глобальных настроек
- [x] 268 тестов, все проходят

### Этап 17: Авторизация и система доступов ✅
- [x] SQLite: таблицы `users`, `sessions`, `project_access` с FK + каскадным удалением
- [x] `api/auth_middleware.php` — `requireAuth()` / `requireAdmin()`, валидация cookie `session_token`
- [x] `api/auth.php` — login (bcrypt verify + 500ms delay), logout, session check (needs_setup), setup (первый admin), change_password
- [x] `api/users.php` — CRUD пользователей (admin only) с `project_access` (назначение проектов)
- [x] Защита endpoints: `projects.php` (admin: все; user: только назначенные), `settings.php` (POST admin only), `proxy.php` (requireAuth)
- [x] `js/auth.js` — AuthClient: check, login, logout, setup, changePassword
- [x] `js/user-api.js` — UserApi: list, get, create, update, delete
- [x] `index.html` — viewLogin, viewSetup, viewAdmin; header с кнопками Пользователи/Настройки/Выйти/имя пользователя
- [x] CSS — стили: auth-page (login/setup), admin-page (таблица пользователей), user-modal (чекбоксы проектов), header-btn/header-user-name
- [x] `js/ui.js` — showLoginView, showSetupView, renderAdminView, showUserModal (с чекбоксами проектов), showChangePasswordModal, renderProjectsViewWithRole (скрытие edit/delete для user)
- [x] `js/main.js` — auth-first boot: check → setup/login → initApp; маршрут #/admin; role-based header
- [x] Безопасность: bcrypt, crypto-random 64-char tokens, httpOnly+SameSite cookies, 30-day expiry, brute-force delay
- [x] Тесты: 26 новых (AuthClient, UserApi, UI login/setup/admin, role-based rendering)
- [x] 294 теста, все проходят

### Этап 18: Редизайн под mereal.info ✅
- [x] Цветовая палитра: кремовый фон (#f8f8f4), тёмный текст (#13131c), slate-blue акцент (#55607d)
- [x] Логотип mereal.info (`images/mereal-logo.svg`) в хедере и на страницах авторизации
- [x] TTFirsNeue — все 9 весов через Tilda CDN, font-weight 400 для всего
- [x] Убраны border-radius (плоские карточки), большие плашки проектов
- [x] Контентная область 1440px, padding 80px, левое выравнивание
- [x] Меню (Пользователи / Настройки / Выход) перенесено в header справа
- [x] История отчётов — фиксированная панель снизу по центру, раскрывается вверх (flex-direction: column-reverse), скруглённые углы 32px
- [x] При наведении на отчёт в истории: текст меняется на «Открыть в Yonote» (синий #4f6ef7)
- [x] Все primary-кнопки — синий градиент `linear-gradient(135deg, #606c88, #3f4c6b)`
- [x] Таймлайн прогресса свёрнут по умолчанию (класс `collapsed` при создании)

### Этап 19: Доработки UX страницы проекта ✅
- [x] Удаление отчётов из истории: кнопка-корзина, `deleteHistoryItem()`, красный hover
- [x] Заголовок страницы = название проекта (`project.name` → `h1`)
- [x] Ссылка на страницу отчётов под заголовком (через `yonote.fullUrl()` от workspace URL)
- [x] Подзаголовок «Создать отчёт» над блоком тегов (`<h2 class="section-heading">`)
- [x] Ссылка всегда синяя (#4f6ef7)

### Этап 20: Мелкие UX-правки ✅
- [x] Клик по строке пользователя (вне кнопок) открывает модалку редактирования
- [x] Hover карточки проекта: синий градиент `#606c88 → #3f4c6b` вместо чёрного
- [x] `body { padding-top: 24px }` — воздух между хедером и контентом

### Этап 21: Формат отчёта и шапка ✅
- [x] Формат отчёта изменён: группировка по странице (`# страница`) → свойства (`## свойство`), было наоборот
- [x] `_executeExtractSections`: построение `pageMap` (Map), инвертирование `foundByHeading`
- [x] Имя пользователя убрано из шапки (элемент `#userName` и обработчик удалены)

### Этап 22: Доработки страницы пользователей ✅
- [x] CSS Grid `1fr auto auto` — бейдж и счётчик проектов прижаты к правому краю
- [x] Убрана аватарка; бейдж и счётчик поменяны местами (счётчик левее, бейдж правее)
- [x] Кнопки edit/delete убраны из строки; работает клик по строке для не-admin
- [x] Кнопка удаления → иконка корзины в футере модалки (`margin-left: auto`), подтверждение через `showDeleteConfirm`
- [x] Порядок в футере: Сохранить → Отмена → иконка удаления
- [x] Глобальное закрытие модалок: Esc и клик вне окна (два обработчика в `ui.js`)
- [x] Убран outline у кнопок хедера

### Этап 23: Навигация в шапке + страница настроек ✅
- [x] Логотип всегда виден (убрана логика скрытия)
- [x] Центральная навигация: Проекты / Пользователи / Настройки (только для admin)
- [x] Активный пункт меню подсвечивается (`is-active`) при переходе между страницами
- [x] Настройки переделаны из модального окна в отдельную страницу (`#/settings`, `viewSettings`)
- [x] Клик по логотипу → переход на страницу проектов
- [x] Кнопка «назад» — компактная стрелка рядом с лого (только в проекте)
- [x] Иконка настроек заменена на шестерёнку (в шапке и в проекте)
- [x] Ссылка «Отчёты проекта» получила hover-стиль как у кнопок (полупрозрачный синий фон)

### Этап 24: Фикс деплоя на хостинг ✅
- [x] Все пути в `index.html` и JS-файлах изменены с абсолютных (`/css/`, `/api/`) на относительные (`css/`, `api/`)
- [x] `<base href="./">` в `index.html` — корректный резолв путей при URL без trailing slash
- [x] `AddType application/javascript` в `.htaccess` — правильный MIME-тип для ES-модулей на Apache
- [x] Пути к логотипу в `ui.js` (login/setup) исправлены на `./images/`

### Этап 25: Мобильное бургер-меню ✅
- [x] Кнопка бургера в header (видна только на ≤768px)
- [x] Боковая панель (drawer) справа с навигацией
- [x] Overlay для закрытия при клике вне меню
- [x] Плавная анимация открытия/закрытия (300ms)
- [x] Синхронизация видимости кнопок с ролью пользователя
- [x] Синхронизация active-состояния между header и drawer
- [x] Уменьшен логотип на мобильных (18px на 768px, 16px на 480px)
- [x] `.hero-reports-link`: `white-space: nowrap` — текст не переносится
- [x] `.hero-actions`: горизонтальный скролл на маленьких экранах

## Где остановились
**Дата:** 2026-02-26

Закончен этап 25: добавлено мобильное бургер-меню с боковой панелью.

**Следующий шаг:** дальнейшие правки дизайна или новые функции по запросу.
