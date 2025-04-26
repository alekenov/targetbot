# Facebook Ads Automator (TargetBot)

Проект для автоматизации работы с Facebook Ads API через Cloudflare Worker.

## Функциональность

- Получение списка рекламных кампаний
- Создание и управление Custom Audiences на основе телефонных номеров
- Создание Lookalike Audiences
- Синхронизация данных с внешними источниками

## Структура проекта

```
targetbot/
├── src/
│   ├── index.ts               # Основной файл воркера с API маршрутами
│   ├── audienceManager.ts     # Логика синхронизации аудиторий
│   ├── kvStore.ts             # Утилиты для работы с KV хранилищами
│   ├── facebookApi/           # Модули для работы с Facebook API
│   │   ├── index.ts           # Реэкспорт функций для совместимости
│   │   ├── types.ts           # Общие типы и интерфейсы
│   │   ├── campaigns.ts       # Функции для работы с кампаниями
│   │   ├── audiences.ts       # Функции для работы с аудиториями
│   │   ├── lookalike.ts       # Функции для создания похожих аудиторий
│   │   └── audience-update.ts # Функции для обновления аудиторий
│   └── utils/
│       └── hash.ts            # Функции для хеширования данных
├── public/                    # Статические файлы
│   ├── index.html             # Главная страница
│   └── api.html               # HTML документация API
└── wrangler.toml              # Конфигурация Cloudflare Worker
```

## API Эндпоинты

- `GET /api/campaigns` - Получение списка рекламных кампаний
- `GET /api/audiences` - Получение списка всех Custom Audiences
- `POST /api/sync-audience` - Синхронизация аудитории с телефонными номерами
- `POST /api/create-lookalike` - Создание Lookalike аудитории

## Настройка и запуск

### Требования

- Node.js (14+)
- Wrangler CLI для Cloudflare Workers
- Facebook Ads API доступ (токен и ID рекламного аккаунта)

### Локальное тестирование

```bash
# Установка зависимостей
npm install

# Создание локального .dev.vars файла с секретами
echo "FB_ACCESS_TOKEN=your_token_here" > .dev.vars
echo "FB_AD_ACCOUNT_ID=your_ad_account_id" >> .dev.vars

# Запуск локального сервера для разработки
wrangler dev
```

### Переменные окружения

- `FB_ACCESS_TOKEN` - токен для доступа к Facebook API
- `FB_AD_ACCOUNT_ID` - ID рекламного аккаунта Facebook
- `AUDIENCE_CACHE` - KV namespace для кэширования аудиторий
