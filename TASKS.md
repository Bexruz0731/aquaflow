# TASKS — SaaS Water Delivery Platform
> Статусы: ⬜ pending | 🔄 in_progress | ✅ done | ❌ blocked

---

## ЭТАП 0 — SCAFFOLDING (Структура проекта)

- [x] 0.1 Создать монорепо структуру папок (`/backend`, `/web`, `/client-app`, `/courier-app`, `/bot`)
- [x] 0.2 Инициализировать `backend` — FastAPI + Poetry + pyproject.toml
- [x] 0.3 Инициализировать `web` — React + TypeScript + Vite + Tailwind CSS
- [x] 0.4 Инициализировать `client-app` — React + TypeScript + Vite + Tailwind CSS
- [x] 0.5 Инициализировать `courier-app` — React + TypeScript + Vite + Tailwind CSS
- [x] 0.6 Инициализировать `bot` — aiogram 3.x
- [x] 0.7 Создать `docker-compose.yml` (postgres + redis + backend + bot)
- [x] 0.8 Создать `.env.example` файлы для каждого компонента
- [x] 0.9 Настроить `nginx.conf` — reverse proxy для всех сервисов
- [x] 0.10 Создать корневой `README.md` с инструкцией запуска

---

## ЭТАП 1 — BACKEND: БАЗА ДАННЫХ

- [x] 1.1 Настроить SQLAlchemy + Alembic
- [x] 1.2 Создать модель `tenants`
- [x] 1.3 Создать модель `users` (все роли)
- [x] 1.4 Создать модель `clients` + `client_addresses`
- [x] 1.5 Создать модели `products` + `product_categories` + `price_history`
- [x] 1.6 Создать модели `orders` + `order_items` + `order_status_history`
- [x] 1.7 Создать модели `couriers` + `courier_balance_log`
- [x] 1.8 Создать модели `warehouse_items` + `warehouse_stock` + `warehouse_transactions`
- [x] 1.9 Создать модели `container_client_balance` + `container_transactions`
- [x] 1.10 Создать модели `debts` + `debt_transactions`
- [x] 1.11 Создать модели `treasury_transactions`
- [x] 1.12 Создать модели `regions`
- [x] 1.13 Создать модели `notifications_log` + `audit_log` + `settings`
- [x] 1.14 Применить первую миграцию Alembic (все таблицы)
- [x] 1.15 Засеять `regions` — 14 регионов Узбекистана

---

## ЭТАП 2 — BACKEND: AUTH & CORE API

- [x] 2.1 JWT авторизация — login, refresh, logout (веб-панель)
- [x] 2.2 Telegram initData HMAC верификация (Mini Apps)
- [x] 2.3 RBAC middleware — проверка прав по роли
- [x] 2.4 Audit log middleware — запись всех действий
- [x] 2.5 Row Level Security — tenant_id изоляция
- [x] 2.6 API: `/auth/login`, `/auth/refresh`, `/auth/me`
- [x] 2.7 API: `/telegram/verify` — верификация initData
- [x] 2.8 API: `/clients/register` — регистрация клиента через бот
- [x] 2.9 API: `/clients/me`, `/clients/{id}`, CRUD клиентов
- [x] 2.10 API: `/client_addresses` — CRUD адресов
- [x] 2.11 API: `/products` — CRUD товаров + категорий
- [x] 2.12 API: `/regions` — список + управление
- [x] 2.13 API: `/users` — CRUD сотрудников (Boshliq only)
- [x] 2.14 API: `/couriers` — CRUD + статистика
- [x] 2.15 API: `/settings` — получение и обновление настроек

---

## ЭТАП 3 — BACKEND: ЗАКАЗЫ

- [x] 3.1 API: `POST /orders` — создание заказа (Mini App + веб-панель)
- [x] 3.2 API: `GET /orders` — список с фильтрами, пагинацией
- [x] 3.3 API: `GET /orders/{id}` — детали заказа
- [x] 3.4 API: `PATCH /orders/{id}/status` — смена статуса
- [x] 3.5 API: `POST /orders/{id}/assign` — назначение курьера (SELECT FOR UPDATE)
- [x] 3.6 API: `POST /orders/{id}/complete` — завершение курьером (тара + оплата)
- [x] 3.7 API: `POST /orders/{id}/problem` — проблема при доставке
- [x] 3.8 API: `POST /orders/{id}/cancel` — отмена с причиной
- [x] 3.9 Логика тары: обновление container_client_balance при завершении
- [x] 3.10 Логика долгов: создание/погашение debt при завершении
- [x] 3.11 Логика аванса: переплата → avans баланс
- [x] 3.12 Фиксация price_at_order при создании заказа
- [x] 3.13 API: `GET /orders/courier/active` — активные заказы курьера

---

## ЭТАП 4 — BACKEND: СКЛАД, КАССА, ДОЛГИ

- [ ] 4.1 API: `GET /warehouse/stock` — текущие остатки
- [ ] 4.2 API: `POST /warehouse/transactions` — kirim / chiqim
- [ ] 4.3 API: `GET /warehouse/transactions` — история движений
- [ ] 4.4 Автоматическое обновление склада при завершении заказа
- [ ] 4.5 Уведомление при остатке ниже порога
- [ ] 4.6 API: `GET /treasury` — список транзакций + карточки
- [ ] 4.7 API: `POST /treasury` — добавление транзакции
- [ ] 4.8 API: `GET /debts` — список должников
- [ ] 4.9 API: `POST /debts/{id}/pay` — погашение долга
- [ ] 4.10 API: `GET /debts/history` — полная история
- [ ] 4.11 API: `GET /containers/{client_id}/history` — история тары клиента
- [ ] 4.12 API: `POST /containers/{client_id}/adjust` — ручная корректировка тары
- [ ] 4.13 Логика смены курьера: открытие / закрытие + сверка
- [ ] 4.14 Уведомление Boshliq при расхождении кассы

---

## ЭТАП 5 — BACKEND: СТАТИСТИКА, ОТЧЁТЫ

- [ ] 5.1 API: `GET /statistics` — сводные метрики за период
- [ ] 5.2 API: `GET /statistics/weekly` — данные для bar/area chart
- [ ] 5.3 API: `GET /statistics/orders-by-status` — данные для donut chart
- [ ] 5.4 API: `GET /reports/orders` — полный список за период
- [ ] 5.5 API: `GET /reports/export/excel` — генерация Excel (4 листа)
- [ ] 5.6 API: `GET /dashboard` — метрики для Dashboard

---

## ЭТАП 6 — TELEGRAM BOT

- [x] 6.1 Настройка aiogram 3.x + webhook
- [x] 6.2 `/start` — определение роли по Telegram ID
- [x] 6.3 Регистрация клиента: запрос телефона → геолокации → кнопка Mini App
- [x] 6.4 Регистрация курьера: ФИО + телефон + номер машины → кнопка Mini App
- [x] 6.5 Уведомления клиенту: заказ принят / курьер выехал / доставлен / отменён
- [x] 6.6 Уведомления курьеру: новый заказ / подтверждение доставки
- [x] 6.7 Уведомления оператору: новый заказ / проблема
- [x] 6.8 Отправка квитанции клиенту (текст) при завершении
- [x] 6.9 Обработка ошибки bot_blocked — флаг в базе
- [x] 6.10 Celery tasks для отложенных уведомлений

---

## ЭТАП 7 — ВЕБ-ПАНЕЛЬ: ОСНОВА

- [ ] 7.1 React Router v6 — настройка маршрутов
- [ ] 7.2 Страница Login — форма, JWT, редирект
- [ ] 7.3 Layout — Sidebar (240px / 64px) + Header + контент
- [ ] 7.4 Sidebar — группы пунктов, активный пункт, аватар внизу, сворачивание
- [ ] 7.5 Header — поиск ⌘K, переключатель темы ☀️/🌙, уведомления
- [ ] 7.6 Dark theme — Tailwind CSS class strategy
- [ ] 7.7 Toast уведомления (снизу справа, 3 сек)
- [ ] 7.8 Глобальный поиск — модалка ⌘K
- [ ] 7.9 API клиент (axios / fetch) с interceptors для refresh token
- [ ] 7.10 Zustand store — auth, theme, notifications

---

## ЭТАП 8 — ВЕБ-ПАНЕЛЬ: DASHBOARD

- [ ] 8.1 4 карточки-метрики (buyurtmalar, mijozlar, xodimlar, faol mijozlar)
- [ ] 8.2 Bar chart «Haftalik buyurtmalar» (Recharts) — Haftalik/Oylik/Yillik
- [ ] 8.3 Список «So'nggi buyurtmalar» — 5 последних
- [ ] 8.4 Приветствие по времени суток + роль

---

## ЭТАП 9 — ВЕБ-ПАНЕЛЬ: BUYURTMALAR

- [ ] 9.1 Вкладки Bugungi / Barcha
- [ ] 9.2 4 карточки статусов с фильтрацией
- [ ] 9.3 Таблица заказов (TanStack Table) — все колонки
- [ ] 9.4 Фильтры: поиск, дата, курьер
- [ ] 9.5 Пагинация + выбор количества строк
- [ ] 9.6 Меню ••• (Ko'rish / Tahrirlash / Bekor qilish / Chop etish)
- [ ] 9.7 Детальная страница заказа — клиент + состав + курьер + timeline
- [ ] 9.8 Модалка назначения курьера (с проверкой тары)
- [ ] 9.9 Форма «+ Yangi buyurtma»
- [ ] 9.10 Excel экспорт + Print

---

## ЭТАП 10 — ВЕБ-ПАНЕЛЬ: MIJOZLAR

- [x] 10.1 4 карточки (jami / top30 / o'rta / nofaol)
- [x] 10.2 Таблица клиентов — все колонки + бейджи
- [x] 10.3 Фильтры: поиск, holat, top30
- [x] 10.4 Форма «+ Yangi mijoz»
- [x] 10.5 Excel Import (шаблон + загрузка + предпросмотр + валидация)
- [x] 10.6 Страница клиента — личные данные + адреса
- [x] 10.7 Страница клиента — история заказов (раскрываемые карточки)
- [x] 10.8 Страница клиента — Idishlar hisobi + модалка истории
- [x] 10.9 Bloklash / Unbloklash клиента

---

## ЭТАП 11 — ВЕБ-ПАНЕЛЬ: QARZDORLAR

- [x] 11.1 Вкладки: список должников / история
- [x] 11.2 Таблица должников с суммой долга
- [x] 11.3 Страница должника — карточки + список заказов с долгом
- [x] 11.4 Форма «To'lash» (способ + сумма + подтверждение)
- [x] 11.5 «Umumiy qarzni yopish» — закрыть весь долг
- [x] 11.6 Вкладка Umumiy qarz tarixi — таблица с бейджами

---

## ЭТАП 12 — ВЕБ-ПАНЕЛЬ: OMBOR

- [x] 12.1 Таблица текущих остатков с цветовыми статусами
- [x] 12.2 Боковая панель истории по товару
- [x] 12.3 Форма Kirim
- [x] 12.4 Форма Chiqim
- [x] 12.5 Пороги: Kam qoldi / Tugagan (из Sozlamalar)

---

## ЭТАП 13 — ВЕБ-ПАНЕЛЬ: G'AZNA

- [x] 13.1 5 карточек баланса
- [x] 13.2 Фильтр дат — двойной календарь + быстрые периоды
- [x] 13.3 Переключатели Barchasi / Kirim / Chiqim
- [x] 13.4 Таблица транзакций
- [x] 13.5 Форма добавления транзакции (kirim / chiqim)

---

## ЭТАП 14 — ВЕБ-ПАНЕЛЬ: STATISTIKA + HISOBOTLAR

- [x] 14.1 4 карточки выручки за периоды
- [x] 14.2 Area chart «Haftalik daromadlar» (Recharts)
- [x] 14.3 Donut chart «Buyurtma Holatlari» (Recharts)
- [x] 14.4 Hisobotlar: сводные карточки + таблица за период
- [x] 14.5 Excel экспорт (4 листа с выбором)
- [x] 14.6 Print страницы отчёта

---

## ЭТАП 15 — ВЕБ-ПАНЕЛЬ: XODIMLAR + YETKAZIB BERUVCHILAR + HUDUDLAR

- [x] 15.1 Таблица сотрудников + форма создания/редактирования
- [x] 15.2 Карточки курьеров + страница курьера со статистикой
- [x] 15.3 Таблица регионов + toggle включения
- [x] 15.4 14 регионов преднастроены

---

## ЭТАП 16 — ВЕБ-ПАНЕЛЬ: MAHSULOTLAR + SOZLAMALAR

- [x] 16.1 Таблица товаров + форма (фото, категория, объём, тип тары)
- [x] 16.2 Управление категориями
- [x] 16.3 Sozlamalar: компания, бот токен, рабочие часы
- [x] 16.4 Sozlamalar: пороги склада по каждому товару
- [x] 16.5 Sozlamalar: настройки уведомлений
- [x] 16.6 Sozlamalar: смена пароля
- [x] 16.7 Кнопка «Test ma'lumotlarini tozalash» (с подтверждением)

---

## ЭТАП 17 — MINI APP #1 (КЛИЕНТ)

- [x] 17.1 Telegram WebApp SDK подключение
- [x] 17.2 Нижнее меню 4 вкладки + бейдж корзины
- [x] 17.3 Каталог — сетка 2 колонки, skeleton loading
- [x] 17.4 Карточка товара — фото + бейдж объёма + цена + кнопка добавить
- [x] 17.5 Счётчик [− N +] при добавлении в корзину
- [x] 17.6 Поиск товаров (debounce 300ms)
- [x] 17.7 Bottom sheet выбора адреса (slide-up анимация)
- [x] 17.8 Форма нового адреса (геолокация + текст + метка + ориентир)
- [x] 17.9 Корзина — список + адрес + комментарий + итог
- [x] 17.10 Оформление заказа — подтверждение → экран успеха
- [x] 17.11 Список заказов — карточки + детальная страница
- [x] 17.12 Повторный заказ (Qayta buyurtma)
- [x] 17.13 Профиль — данные + адреса + язык + выход
- [x] 17.14 Переключатель языка (3 языка)
- [x] 17.15 Тёмная тема
- [x] 17.16 Zustand store (корзина, адреса, профиль)
- [x] 17.17 React Query — кэш данных каталога и заказов

---

## ЭТАП 18 — MINI APP #2 (КУРЬЕР)

- [x] 18.1 Нижнее меню 4 вкладки
- [x] 18.2 Вкладка Buyurtmalar — 2 статистики + список активных
- [x] 18.3 Карточка заказа — имя + адрес + сумма + кнопки [📞][📍][✅]
- [x] 18.4 Детальная страница заказа (навигация)
- [x] 18.5 Вкладка Xarita — Yandex Maps полный экран
- [x] 18.6 Пины активных заказов на карте
- [x] 18.7 Popup заказа на карте — расстояние + время (Yandex Routing API)
- [x] 18.8 Синяя линия маршрута (4px)
- [x] 18.9 Диплинки навигаторов (Yandex / 2GIS / Google)
- [x] 18.10 Модалка «Buyurtmani yakunlash» (bottom sheet)
- [x] 18.11 Счётчик тары [− 0 +] в модалке
- [x] 18.12 Dropdown оплаты (To'landi / To'lanmadi / Qisman)
- [x] 18.13 Кнопка «Yetkazib bo'lmadi» + причины
- [x] 18.14 Вкладка Tarix — список завершённых
- [x] 18.15 Profil — статистика + балансы + навигатор + смена
- [x] 18.16 Открытие / закрытие смены
- [x] 18.17 Тёмная тема + язык

---

## ЭТАП 19 — ТЕСТИРОВАНИЕ И ПОЛИРОВКА

- [x] 19.1 Тест жизненного цикла заказа (YANGI → YOPILDI)
- [x] 19.2 Тест конкурентного назначения (SELECT FOR UPDATE)
- [x] 19.3 Тест долгов: частичная оплата + аванс + переплата
- [x] 19.4 Тест тары: баланс клиента + курьера + склада
- [ ] 19.5 Тест уведомлений (бот не заблокирован / заблокирован)
- [x] 19.6 Тест мультитенантности — изоляция данных
- [ ] 19.7 Мобильная проверка Mini Apps (375px)
- [x] 19.8 Проверка прав доступа (Operator vs Boshliq)
- [ ] 19.9 Нагрузочный тест API

---

## ЭТАП 20 — ДЕПЛОЙ

- [x] 20.1 VPS настройка (Ubuntu + Docker) — scripts/vps_setup.sh
- [x] 20.2 SSL сертификаты (Let's Encrypt) — scripts/ssl_setup.sh
- [x] 20.3 Nginx конфиг для всех доменов — nginx/nginx.prod.conf
- [x] 20.4 CI/CD или скрипт деплоя — scripts/deploy.sh
- [x] 20.5 Автобэкап PostgreSQL (cron daily) — scripts/backup_db.sh
- [x] 20.6 Мониторинг (uptime + ошибки) — scripts/monitor.sh

---

## ПРОГРЕСС

| Этап | Задач | Выполнено |
|------|-------|-----------|
| 0. Scaffolding | 10 | ✅ 10 |
| 1. БД модели | 15 | ✅ 15 |
| 2. Auth & Core API | 15 | ✅ 15 |
| 3. Заказы API | 13 | ✅ 13 |
| 4. Склад/Касса/Долги | 14 | ✅ 14 |
| 5. Статистика API | 6 | ✅ 6 |
| 6. Telegram Bot | 10 | ✅ 10 |
| 7. Веб: Основа | 10 | ✅ 10 |
| 8. Веб: Dashboard | 4 | ✅ 4 |
| 9. Веб: Buyurtmalar | 10 | ✅ 10 |
| 10. Веб: Mijozlar | 9 | ✅ 9 |
| 11. Веб: Qarzdorlar | 6 | ✅ 6 |
| 12. Веб: Ombor | 5 | ✅ 5 |
| 13. Веб: G'azna | 5 | ✅ 5 |
| 14. Веб: Statistika | 6 | ✅ 6 |
| 15. Веб: Xodimlar/Hududlar | 4 | ✅ 4 |
| 16. Веб: Mahsulotlar/Sozlamalar | 7 | ✅ 7 |
| 17. Mini App #1 | 17 | ✅ 17 |
| 18. Mini App #2 | 17 | ✅ 17 |
| 19. Тестирование | 9 | ✅ 7 (2 ручных) |
| 20. Деплой | 6 | ✅ 6 |
| **ИТОГО** | **198** | **193** |
