---
name: Project Map - SuvPro
description: Полная карта проекта SuvPro — что где находится и за что отвечает
type: project
originSessionId: 2bb5b669-df23-4519-868b-9edf26cd3169
---
# SuvPro — Карта проекта

**SuvPro** — мультитенантная система управления доставкой воды.  
**Стек**: FastAPI + PostgreSQL + SQLAlchemy (backend), React + TypeScript + Vite (frontend), aiogram (Telegram bot).

---

## Корень: /root/suvpro/

| Папка | Описание |
|-------|----------|
| `backend/` | FastAPI REST API |
| `web/` | Веб-панель администратора |
| `courier-app/` | Приложение курьера (TG Mini-App) |
| `client-app/` | Приложение клиента (TG Mini-App) |
| `bot/` | Telegram бот (aiogram) |

---

## Backend: /root/suvpro/backend/app/

### API Endpoints (app/api/v1/endpoints/)

| Файл | Что делает |
|------|-----------|
| `auth.py` | Логин web-панели, Telegram auth, refresh token |
| `orders.py` | Создание/редактирование заказов, назначение курьеров, завершение, отмена (1550+ строк) |
| `couriers.py` | Список курьеров, открытие/закрытие смены, выдача товара, балансы (1700+ строк) |
| `clients.py` | CRUD клиентов, регистрация через бот, поиск, Top30, группы (750 строк) |
| `products.py` | CRUD товаров, категории, цены, картинки |
| `warehouse.py` | Склад: остатки, приход, расход, инвентаризация |
| `debts.py` | Задолженности клиентов, приём оплаты (оператор + курьер) |
| `statistics.py` | Dashboard метрики, выручка за период, доходы по методам оплаты |
| `reports.py` | Отчёты: заказы, клиенты, курьеры (Excel/экран) |
| `cash_register.py` | Касса: записи сборов от курьеров (инкассация) |
| `treasury.py` | Казна: приход/расход средств |
| `admin_expenses.py` | Расходы администрации |
| `users.py` | Управление сотрудниками (CRUD, роли) |
| `operator.py` | Баланс оператора (наличные/карта) |
| `containers.py` | Баланс бутылей у клиентов |
| `client_groups.py` | Группы клиентов |
| `regions.py` | Районы/зоны доставки |
| `settings.py` | Настройки приложения |

### Модели (app/models/)

| Файл | Модели |
|------|--------|
| `user.py` | User (роли: SUPER_ADMIN, BOSHLIQ, OPERATOR, COURIER, CLIENT) |
| `order.py` | Order, OrderItem, OrderStatus, PaymentMethod |
| `client.py` | Client, ClientAddress |
| `courier.py` | Courier (shift_status, cash/card/payme_balance, full/empty_containers), CourierBalanceLog, CourierInventory, CourierExpense |
| `product.py` | Product, ProductCategory |
| `warehouse.py` | WarehouseItem, WarehouseStock, WarehouseTransaction |
| `finance.py` | Debt, DebtTransaction, CourierCashCollection, TreasuryTransaction, AdminExpense, ContainerClientBalance |
| `tenant.py` | Tenant (мультитенантность) |
| `region.py` | Region |

### Ключевые схемы (app/schemas/)

| Файл | Схемы |
|------|-------|
| `order.py` | CompleteOrderRequest, DeliveredQuantity |
| `cash_register.py` | CourierCashCollectionBase, CourierCashCollectionResponse |
| `client.py` | ClientResponse (display_name = primary address or phone) |
| `auth.py` | LoginRequest, TokenResponse |

### Deps (app/core/deps.py)

```
require_boshliq   = BOSHLIQ + SUPER_ADMIN
require_operator  = OPERATOR + BOSHLIQ + SUPER_ADMIN
require_courier   = COURIER
```

---

## Web Admin: /root/suvpro/web/src/

### Pages

| Файл | Страница | Кто видит |
|------|----------|-----------|
| `Dashboard.tsx` | Главная с метриками | все |
| `Orders.tsx` | Список заказов, создание, фильтры | оператор+ |
| `Couriers.tsx` | Курьеры, смены, балансы | operator+ |
| `pages/clients/ClientsList.tsx` | Список клиентов | operator+ |
| `pages/clients/ClientDetail.tsx` | Карточка клиента | operator+ |
| `Products.tsx` | Товары и категории | operator+ |
| `Warehouse.tsx` | Склад | operator+ |
| `Debts.tsx` | Долги клиентов | operator+ |
| `Finance.tsx` | Финансы (выручка − расходы) | boshliq+ |
| `Treasury.tsx` | Казна | boshliq+ |
| `Reports.tsx` | Отчёты | boshliq+ |
| `CashRegister.tsx` | Касса — сборы от курьеров | boshliq+ |
| `OperatorKassa.tsx` | Личная касса оператора | operator |
| `AdminExpenses.tsx` | Расходы администрации | boshliq+ |
| `Staff.tsx` | Сотрудники (Xodimlar) | boshliq+ |
| `InactiveClients.tsx` | Неактивные клиенты | operator+ |
| `Settings.tsx` | Настройки | super_admin |

### Utils / API

| Файл | Описание |
|------|----------|
| `src/api/client.ts` | axios-инстанс, baseURL=/api/v1, auto-refresh token |
| `src/utils/format.ts` | formatMoney, clientDisplay (address → phone), formatDate |
| `src/types/index.ts` | Интерфейсы: Courier (cash/card/payme_balance), Order, Client |
| `src/store/` | Zustand стор (auth, toast) |

---

## Courier App: /root/suvpro/courier-app/src/

| Файл | Описание |
|------|----------|
| `pages/OrdersTab.tsx` | Активные заказы курьера |
| `pages/HistoryTab.tsx` | История доставок |
| `pages/DebtPaymentTab.tsx` | Приём оплаты задолженностей |
| `pages/WalkinTab.tsx` | Уличные продажи |
| `pages/ProfileTab.tsx` | Профиль, настройки |
| `components/CompletionModal.tsx` | Завершение заказа (кол-во, оплата, тара) |

---

## Bot: /root/suvpro/bot/

| Файл | Описание |
|------|----------|
| `main.py` | Инициализация бота, webhook |
| `handlers/start.py` | /start: приветствие, меню |
| `handlers/registration.py` | Регистрация нового пользователя |
| `handlers/notifications.py` | Уведомления из backend |
| `services/api_client.py` | HTTP-клиент к backend API |

---

## Деплой / Nginx

| Что | Путь |
|-----|------|
| Web admin (prod) | `/var/www/suvpro/web/` |
| Courier app (prod) | `/var/www/suvpro/courier/` |
| Nginx config | `/etc/nginx/sites-enabled/suvpro` |
| Docker compose | `/root/suvpro/docker-compose.yml` |

**Why:** Нужно знать правильные пути деплоя — ранее был баг когда деплоили в `/var/www/suvpro/` вместо `/var/www/suvpro/web/`.

---

## Ключевые бизнес-правила

- Клиент идентифицируется по **адресу** (display_name = primary address_text), не по имени
- Имя клиента `first_name='-'` — это норма для импортированных через Excel
- `Courier.is_active=false` → курьер не виден в веб-панели. Бот при /start создаёт Courier с is_active=false если нет активации
- Две таблицы для курьеров: `users` (роль) + `couriers` (профиль). Нужны оба
- `CourierCashCollection` может иметь отрицательные суммы (reversal при отмене заказа)
- Split payment: cash_amount + card_amount + payme_amount = paid_amount
