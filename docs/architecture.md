# Архитектура проекта — Yonote Manager

## Стек технологий
- **Backend:** Python 3, Flask
- **Frontend:** HTML, CSS, JavaScript (чистый)
- **API:** Yonote API (Outline-совместимый, RPC-стиль)
- **Тесты:** pytest

## Структура папок

```
├── app.py                  # Flask-сервер, маршруты, парсинг команд
├── yonote_client.py        # HTTP-клиент для Yonote API
├── requirements.txt        # Зависимости Python
├── .env                    # API_TOKEN, API_BASE_URL
├── templates/
│   └── index.html          # Главная страница (UI чата)
├── static/
│   ├── style.css           # Стили (тёмная тема)
│   └── app.js              # Логика чата, SSE-обработка
├── tests/
│   └── test_yonote_client.py  # Тесты клиента и парсера команд
├── docs/
│   ├── architecture.md     # Этот файл
│   ├── project_status.md   # Статус проекта
│   └── changelog.md        # Журнал изменений
└── CLAUDE.md               # Инструкции для AI-ассистента
```

## Слои приложения

### 1. Yonote API Client (`yonote_client.py`)
HTTP-клиент для Yonote API. Все запросы — POST (RPC-стиль). Поддерживаемые операции:
- Коллекции: list, info, documents
- Документы: list, info, search, create, update, delete

### 2. Flask Backend (`app.py`)
- `GET /` — отдаёт HTML-страницу
- `POST /api/execute` — принимает команду, возвращает SSE-поток со статусами и результатами
- Парсер команд: преобразует текстовые команды в действия API

### 3. Frontend (`templates/index.html`, `static/`)
- Двухпанельный UI: сайдбар с историей чатов + область чата
- SSE (Server-Sent Events) для real-time обновлений статуса
- Современный тёмный дизайн
