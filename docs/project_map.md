---
name: Project Map - SuvPro
description: Полная карта проекта SuvPro — БД, потоки, фичи, ловушки, деплой
type: project
originSessionId: 2bb5b669-df23-4519-868b-9edf26cd3169
---
# SuvPro — Карта проекта

**SuvPro** — мультитенантная система управления доставкой воды.  
**Стек**: FastAPI + PostgreSQL + SQLAlchemy async (asyncpg), Redis, React + TypeScript + Vite, aiogram.

---

## Структура проекта

```
/root/suvpro/
├── backend/          FastAPI REST API
├── web/              Веб-панель администратора
├── courier-app/      Приложение курьера (TG Mini-App)
├── client-app/       Приложение клиента (TG Mini-App)
└── bot/              Telegram бот (aiogram)
```

**Config backend**: `backend/.env` → `app/core/config.py` (pydantic-settings)  
Ключевые переменные: `SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_ORIGINS`

---

## Роли и доступ

| Роль | Кто | Доступ |
|------|-----|--------|
| `super_admin` | Разработчик/владелец | Всё, включая settings |
| `boshliq` | Директор/владелец компании | Финансы, отчёты, управление курьерами |
| `operator` | Менеджер/оператор | Заказы, клиенты, курьеры (без финансов) |
| `courier` | Курьер | Только свои заказы, смена, долги |
| `client` | Клиент (TG) | Только своя корзина и заказы |

`secondary_role` — второй ролевой бит (напр. оператор+курьер одновременно).

```
require_boshliq   = BOSHLIQ + SUPER_ADMIN
require_operator  = OPERATOR + BOSHLIQ + SUPER_ADMIN
require_courier   = COURIER
verify_bot_secret = X-Bot-Secret: {TELEGRAM_BOT_TOKEN}  ← только для бота
```

---

## База данных — таблицы и ключевые поля

### `tenants`
- `id` UUID, `name`, `slug` (unique), `bot_token`, `settings` (JSON text), `is_active`

### `users`
- `id` UUID, `tenant_id` (NULL = super_admin), `telegram_id` bigint unique
- `role` enum, `secondary_role` str (опционально)
- `hashed_password` — только web-панель пользователи
- `cash_balance` / `card_balance` — наличные у оператора (UZS, денормализованный кэш)
- `bot_blocked` bool, `language` (uz/uz_cyrillic/ru)

### `clients`
- `id` UUID, `tenant_id`, `user_id` FK→users (NULL если без TG)
- `first_name` / `last_name` — `first_name='-'` нормально (Excel-импорт)
- `is_active` / `is_blocked` / `is_deleted` (soft delete)
- `container_balance` int — бутыли у клиента (денормализованный кэш)
- `debt_amount` / `advance_amount` — денормализованные кэши долгов
- `group_id` FK→client_groups

### `client_addresses`
- `client_id`, `address_text` — **главный идентификатор клиента**
- `label` (Uy/Ish/Boshqa), `landmark`, `apartment`, `floor`, `entrance`
- `latitude` / `longitude`, `region_id`, `is_primary`

### `orders`
- `id` **int autoincrement** (не UUID!) — отображается как #52, #65
- `tenant_id`, `client_id`, `courier_id`, `address_id`
- `status` enum: `yangi → qabul_qilindi → tayinlandi → yolda → yetkazildi → yopildi / bekor_qilindi / muammo`
- `payment_status`: `tolangan / tolanmagan / qisman`
- `payment_method`: `NAQD / KARTA / PAYME / CLICK / QARZ` (PLASTIK — deprecated = KARTA)
- `total_amount` — сумма товаров
- `paid_amount = cash_amount + card_amount + payme_amount` (split payment)
- `debt_amount` — остаток долга после оплаты
- `containers_delivered` / `containers_returned` — 18.9L движение
- `is_phone_order` bool — создал оператор по телефону
- `is_walkin` bool — уличная продажа без клиента (walkin_phone / walkin_address)
- `is_deleted` / `deleted_at` — soft delete

### `order_items`
- `quantity` — заказано, `delivered_quantity` — реально доставлено (может быть меньше)
- `price_at_order` — **цена ЗАФИКСИРОВАНА** на момент создания, не меняется
- `total = delivered_quantity × price_at_order`

### `couriers`
- `user_id` FK→users, `shift_status` (open/closed), `is_active`
- `cash_balance` / `card_balance` / `payme_balance` — накоплено за смену
- `full_containers` — то'лa (выдано со склада), `empty_containers` — бо'ш (собрано у клиентов)
- `preferred_navigator` (yandex/2gis/google)

### `courier_inventory`
Текущий остаток всех товаров, выданных курьеру на смену.

### `courier_expenses`
- `title`, `amount`, `payment_method` (naqd/karta)

### `courier_balance_log`
Лог всех изменений балансов курьера: shift_open / delivery / return / shift_close

### `products`
- `price` int (UZS), `is_active`, `is_deleted` (soft delete), `show_to_clients`
- `is_returnable_container` bool — если true, это 18.9L (считаем тару)
- `inactive_threshold_days` int — порог для отчёта "неактивные клиенты"
- `container_product_id` — FK на пустую тару как отдельный продукт
- `containers_per_unit` — сколько тары на 1 единицу товара

### `debts` / `debt_transactions`
- `debts` — один долг = один заказ. `remaining_amount` уменьшается при платежах
- `debt_transactions` — неизменяемый лог. Типы: debt / payment / advance / advance_used
- `amount` может быть отрицательным (платёж)

### `courier_cash_collections`
Запись инкассации при закрытии смены. **Может иметь отрицательные суммы** (reversal при отмене).

### `treasury_transactions`
- Типы: `kirim` / `chiqim`
- Категории: suv_savdosi / kuler_ijarasi / yoqilgi / ish_haqi / ofis / tamirlash / boshqa_*

### `admin_expenses`
Расходы операторов/боссов (не курьеры). `title`, `amount`, `payment_method`.

### `operator_cash_submissions`
Сдача кассы оператора боссу (аналог инкассации, но для операторов).

### `warehouse_items` / `warehouse_stock` / `warehouse_transactions`
- `warehouse_items` — типы товаров; `is_container` + `is_full` = тара (полная/пустая)
- `warehouse_stock` — `quantity` (полные) + `empty_quantity` (пустые 18.9L)
- Статусы автоматически: OK / LOW / OUT по `low_threshold` / `out_threshold`

### `container_client_balance` / `container_transactions`
Баланс 18.9L бутылей у каждого клиента + история всех движений.

### `regions`
`tenant_id=NULL` → системные (общие для всех тенантов). Имена: uz / uz_cyrillic / ru.

### `price_history`, `order_status_history`, `client_groups`
Логи изменений. `order_status_history` — каждый переход + кто изменил.

---

## Ключевые потоки

### 1. Жизненный цикл заказа

```
[OPERATOR] POST /orders/             → status: yangi
     ↓
[OPERATOR] POST /orders/{id}/assign  → status: tayinlandi
     ↓
[COURIER]  PATCH /orders/{id}/status → yolda (курьер едет)
     ↓
[COURIER]  POST /orders/{id}/complete →
     • статус: yetkazildi
     • пересчёт total по delivered_quantity
     • split payment → courier.cash/card/payme_balance += ...
     • courier.full_containers -= delivered, courier.empty_containers += returned
     • warehouse.empty_quantity += containers_returned
     • client.container_balance обновляется
     • если debt > 0 → создаётся Debt + DebtTransaction + client.debt_amount += debt
     • если переплата → client.advance_amount += overpayment
     • отнимает из courier_inventory
     ↓
[OPERATOR] PATCH /orders/{id}/status → yopildi  (финальное закрытие)
```

Альтернативы: `bekor_qilindi` (отмена — обратный ход денег), `muammo` (проблема, курьер не доставил).

### 2. Денежный поток (смена курьера)

```
Склад → open_shift → courier.full_containers += N, warehouse.quantity -= N
  ↓
  Доставка (complete_order):
    courier.cash_balance   += cash_amount
    courier.card_balance   += card_amount
    courier.payme_balance  += payme_amount
  ↓
close_shift:
    courier_cash_collections запись (инкассация)
    warehouse.quantity     += actual_full_containers  (нераспроданный остаток)
    warehouse.empty_quantity += actual_empty_containers
    courier.*_balance = 0, full_containers = 0, empty_containers = 0
```

Если `actual_cash != courier.cash_balance` → `notify_shift_discrepancy` (Celery task → уведомление боссу).

### 3. Движение тары (18.9L)

```
warehouse.quantity (полные)
  → open_shift: -= full_containers (выдали курьеру)
  ← close_shift: += actual_full_containers (вернул нераспроданное)

courier.full_containers
  → complete_order: -= delivered_quantity (18.9L)
  courier.empty_containers += containers_returned

warehouse.empty_quantity (пустые)
  ← complete_order: += containers_returned (клиент вернул пустые)
  ← close_shift: += actual_empty_containers

client.container_balance  (денормализованный кэш)
  += containers_delivered, -= containers_returned
```

### 4. Долговой поток

```
complete_order: debt_amount > 0
  → Debt(order_id, remaining_amount=debt_amount)
  → DebtTransaction(type=debt, amount=+debt_amount)
  → client.debt_amount += debt_amount

Оператор/курьер принимает оплату (POST /debts/{client_id}/pay):
  → debt.remaining_amount -= amount
  → если remaining_amount=0 → debt.is_paid=True
  → DebtTransaction(type=payment, amount=-amount)
  → client.debt_amount -= amount
  → если cash: operator.cash_balance += amount
```

### 5. Авторизация

```
Web-панель: POST /auth/login (login+password) → access_token (60min) + refresh_token (30d)
Mini-app:   POST /auth/telegram/auth (HMAC-SHA256 от initData) → те же токены
Bot:        GET /auth/telegram/user/{id} с X-Bot-Secret header

Refresh: POST /auth/refresh → новый access_token
         + проверяет Redis blacklist (ключ blacklist:refresh:{sha256(token)})
Logout:  POST /auth/logout → refresh_token → blacklist в Redis с TTL
```

### 6. Регистрация клиента через бот

```
/start → get_user_by_telegram_id(id)
  404 → пользователь новый → FSM регистрация (имя, телефон, адрес)
  200 → пользователь найден → показать меню

POST /clients/register:
  - если telegram_id уже привязан к НЕ удалённому клиенту → 400
  - создаёт User(role=CLIENT) + Client + ClientAddress
```

---

## API Endpoints (app/api/v1/endpoints/)

| Файл | Ключевые эндпоинты | Роли |
|------|--------------------|------|
| `auth.py` | POST /login, POST /telegram/auth, GET /telegram/user/{id}, POST /refresh, POST /logout | — |
| `orders.py` | GET/POST /, GET /{id}, POST /{id}/assign, POST /{id}/complete, POST /{id}/cancel, POST /{id}/problem, DELETE /{id}, PATCH /{id}/edit | operator+/courier |
| `couriers.py` | GET /, GET /{id}, POST /invite, POST /me/shift/open, POST /me/shift/close, POST /{id}/issue-products, GET /{id}/daily-summary, GET /{id}/debt-summary, POST /me/expenses | operator+/courier |
| `clients.py` | GET/POST /, GET /{id}, PATCH /{id}, DELETE /{id} (soft), POST /register, PATCH /{id}/addresses, POST /{id}/make-operator | operator+/bot |
| `products.py` | GET/POST /, PATCH /{id} (включая inactive_threshold_days) | operator+ |
| `warehouse.py` | GET /stock, POST /transactions | operator+ |
| `debts.py` | GET /, POST /{client_id}/pay, POST /courier/{client_id}/pay | operator+/courier |
| `reports.py` | GET /inactive-by-product, GET /never-ordered, GET /orders (Excel) | boshliq+ |
| `cash_register.py` | GET /collections, GET /collections/summary | boshliq+ |
| `treasury.py` | GET /, POST / | boshliq+ |
| `statistics.py` | GET /dashboard, GET /weekly, GET /financial-dashboard | operator+ |
| `containers.py` | GET /{client_id}/history, POST /{client_id}/adjust | operator+ |
| `admin_expenses.py` | GET /, POST / | operator+ |
| `operator.py` | GET /me/balance, POST /me/submit | operator |
| `users.py` | GET /, POST /, PATCH /{id} | boshliq+ |
| `client_groups.py` | GET /, POST /, PATCH /{id}, DELETE /{id} | operator+ |
| `regions.py` | GET /, POST / | operator+ |
| `settings.py` | GET /, PATCH / | super_admin |

---

## Web Admin: /root/suvpro/web/src/

### Pages — что отображает и какие API вызывает

| Страница | Файл | API вызовы |
|----------|------|-----------|
| Dashboard | `Dashboard.tsx` | GET /statistics/dashboard, /statistics/weekly |
| Заказы | `Orders.tsx` | GET/POST /orders/, /orders/{id}/assign, /orders/{id}/edit, DELETE /orders/{id}, GET /clients/, /products/, /couriers/ |
| Курьеры | `Couriers.tsx` | GET /couriers/, /couriers/{id}, /products/, /warehouse/stock; POST /couriers/invite, /couriers/{id}/issue-products, /couriers/{id}/expenses |
| Клиенты | `pages/clients/ClientsList.tsx` | GET /clients/, /client-groups/; PATCH /clients/{id}; DELETE /clients/{id}; POST /client-groups/ |
| Карточка клиента | `pages/clients/ClientDetail.tsx` | GET /clients/{id}, /orders/, /containers/{id}/history; PATCH /clients/{id}, /clients/{id}/addresses; POST /clients/{id}/change-role, /clients/{id}/make-operator |
| Товары | `Products.tsx` | GET/POST/PATCH /products/ |
| Склад | `Warehouse.tsx` | GET /warehouse/stock; POST /warehouse/transactions |
| Долги | `Debts.tsx` | GET /debts/, /debts/history; POST /debts/{id}/pay |
| Финансы | `Finance.tsx` | GET /statistics/financial-dashboard |
| Казна | `Treasury.tsx` | GET/POST /treasury/ |
| Отчёты | `Reports.tsx` | GET /reports/* |
| Касса | `CashRegister.tsx` | GET /cash-register/collections, /cash-register/collections/summary |
| Неактивные | `InactiveClients.tsx` | GET /products/, /reports/inactive-by-product, /reports/never-ordered; PATCH /products/{id} |
| Настройки | `Settings.tsx` | GET/PATCH /settings/ |

### Ключевые утилиты

| Файл | Описание |
|------|----------|
| `src/api/client.ts` | axios-инстанс, baseURL=/api/v1, interceptor авто-refresh |
| `src/utils/format.ts` | formatMoney, clientDisplay (адрес → телефон), formatDate |
| `src/types/index.ts` | TypeScript-интерфейсы |
| `src/store/auth.ts` | Zustand: login, logout (POST /auth/logout + clear localStorage) |

---

## Client App: /root/suvpro/client-app/src/

| Файл | Описание |
|------|----------|
| `App.tsx` | Читает TG initData → POST /auth/telegram/auth → токены |
| `components/TdesktopLogin.tsx` | Fallback для Telegram Desktop (ввод телефона вручную) |
| `pages/CatalogPage.tsx` | Каталог товаров (только show_to_clients=true) |
| `pages/CartPage.tsx` | Корзина + оформление заказа |
| `pages/OrdersPage.tsx` | История заказов клиента |
| `pages/ProfilePage.tsx` | Профиль + адреса |
| `components/AddressSheet.tsx` | Bottom sheet адресов |
| `store/auth.ts` | Zustand auth (profile + tokens) |
| `store/cart.ts` | Корзина (товары, кол-во) |

**Build**: `base: '/client/'` → ассеты `/client/assets/...`

---

## Courier App: /root/suvpro/courier-app/src/

| Файл | Описание |
|------|----------|
| `pages/OrdersTab.tsx` | Активные заказы |
| `pages/HistoryTab.tsx` | История доставок |
| `pages/DebtPaymentTab.tsx` | Приём оплаты долгов клиентов |
| `pages/WalkinTab.tsx` | Уличная продажа (is_walkin=true) |
| `pages/ProfileTab.tsx` | Профиль, навигатор |
| `pages/MapTab.tsx` | Карта заказов |
| `components/CompletionModal.tsx` | Завершение заказа (кол-во, оплата, тара) |
| `components/ProblemModal.tsx` | Отметить проблему |

**Build**: `base: '/courier/'` → ассеты `/courier/assets/...`

---

## Bot: /root/suvpro/bot/

| Файл | Описание |
|------|----------|
| `main.py` | Инициализация, polling, mini-app URLs |
| `config.py` | BOT_TOKEN, API_BASE_URL, WEBHOOK_URL |
| `states.py` | FSM состояния |
| `handlers/start.py` | /start → get_user_by_telegram_id → меню |
| `handlers/registration.py` | Регистрация клиента/курьера (FSM) |
| `handlers/notifications.py` | Входящие уведомления |
| `handlers/webhook_notify.py` | Push-уведомления из backend |
| `services/api_client.py` | httpx-клиент; **все запросы с X-Bot-Secret header** |

---

## Деплой / Nginx

| Что | Путь |
|-----|------|
| Web admin (prod) | `/var/www/suvpro/web/` |
| Client app (prod) | `/var/www/suvpro/client/` |
| Courier app (prod) | `/var/www/suvpro/courier/` |
| Nginx config | `/etc/nginx/sites-enabled/suvpro` |
| Docker compose (dev) | `/root/suvpro/docker-compose.dev.yml` |
| Docker compose (prod) | `/root/suvpro/docker-compose.yml` |

**Nginx routing**: `/` → web, `/client/` → client-app, `/courier/` → courier-app, `/api/v1/` → backend:8000  
**Деплой frontend**: `docker run node:20-alpine npm install && vite build` → `cp -r dist/* /var/www/suvpro/{app}/`  
**Деплой backend**: `docker compose up -d --build` → миграции через psql (psycopg2 недоступен в контейнере)

---

## Ловушки и неочевидные вещи

| Модуль | Ловушка |
|--------|---------|
| **Order.id** | int, не UUID — используй integer в URL `/orders/52`, не UUID |
| **price_at_order** | фиксируется навсегда, не меняется при изменении цены товара |
| **client.debt_amount** | денормализованный кэш — обновляется в complete_order и pay_debt; не считай вручную |
| **client.container_balance** | то же, кэш — источник правды: container_client_balance.balance |
| **PLASTIK** | deprecated enum = KARTA; старые данные могут содержать PLASTIK — не ломай |
| **CourierCashCollection** | отрицательные суммы при reversal отмены заказа — норма |
| **is_active на Courier** | false = курьер не виден в веб-панели; бот создаёт Courier(is_active=false) при /start |
| **Две таблицы курьера** | users (role=COURIER) + couriers (профиль) — нужны ОБЕ |
| **soft delete клиента** | is_deleted=True + user.telegram_id=None → клиент может снова зарегистрироваться |
| **order_items.delivered_quantity** | может быть < quantity (частичная доставка), total пересчитывается |
| **warehouse.empty_quantity** | отдельное поле от quantity — пустые 18.9L лежат здесь |
| **Region(tenant_id=NULL)** | системные регионы, общие для всех тенантов |
| **first_name='-'** | норма для Excel-импорта клиентов |
| **advance_amount** | переплата клиента — накапливается при paid > total |
| **shift discrepancy** | если actual != balance → Celery notify_shift_discrepancy → уведомление боссу |
| **InactiveClients** | отчёт требует двух условий: заказывал ХОТЯ БЫ РАЗ И не заказывал последние N дней |
