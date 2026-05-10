# SuvPro — API Map (страница → эндпоинты)

Быстрая шпаргалка: что и откуда дёргает фронтенд.

---

## Web Admin (`/root/suvpro/web/src/pages/`)

### Dashboard.tsx
```
GET /statistics/dashboard          → метрики главной страницы
GET /statistics/weekly?period=...  → график выручки
```

### Orders.tsx
```
GET  /orders/                            → список заказов (фильтры: status, today_only, courier_id, client_id)
POST /orders/                            → создать заказ
GET  /orders/{id}                        → детали заказа
POST /orders/{id}/assign                 → назначить курьера
POST /orders/{id}/edit-preview           → превью изменений заказа
PATCH /orders/{id}/edit                  → сохранить изменения заказа
GET  /orders/{id}/delete-preview         → превью удаления (куда деньги)
DELETE /orders/{id}                      → удалить заказ (soft)
GET  /clients/                           → поиск клиентов для создания заказа
GET  /products/                          → список товаров
GET  /couriers/                          → список курьеров для назначения
```

### Couriers.tsx
```
GET  /couriers/                          → список курьеров
GET  /couriers/{id}                      → профиль курьера
GET  /couriers/{id}/inventory            → остаток товаров у курьера
GET  /couriers/{id}/daily-summary        → сводка по дням (days=30)
GET  /couriers/{id}/orders-by-date       → заказы за дату
GET  /couriers/{id}/debt-summary         → долговая сводка
GET  /couriers/{id}/debts-by-date        → долги за дату
GET  /couriers/{id}/expenses             → расходы курьера
POST /couriers/{id}/expenses             → добавить расход
DELETE /couriers/{id}/expenses/{eid}     → удалить расход
POST /couriers/invite                    → пригласить нового курьера
POST /couriers/{id}/issue-products       → выдать товар курьеру со склада
GET  /products/                          → список продуктов
GET  /warehouse/stock                    → остатки склада
```

### pages/clients/ClientsList.tsx
```
GET  /clients/                           → список клиентов (фильтры: search, group_id, is_active, is_blocked, top30, inactive_days)
GET  /client-groups/                     → список групп
POST /client-groups/                     → создать группу
PATCH /client-groups/{id}/               → переименовать группу
DELETE /client-groups/{id}/              → удалить группу
PATCH /clients/{id}                      → блокировка / смена группы
DELETE /clients/{id}                     → soft-delete клиента
```

### pages/clients/ClientDetail.tsx
```
GET  /clients/{id}                       → профиль клиента
GET  /orders/?client_id={id}             → история заказов клиента
GET  /containers/{id}/history            → история тары
POST /containers/{id}/adjust             → корректировка тары
PATCH /clients/{id}                      → редактировать телефон
PATCH /clients/{id}/addresses/{addr_id}  → редактировать адрес
POST  /clients/{id}/addresses            → добавить адрес
PATCH /clients/{id}                      → блокировка
POST  /clients/{id}/change-role          → сменить роль (courier / client)
PATCH /users/{user_id}                   → secondary_role
POST  /clients/{id}/make-operator        → сделать оператором
```

### Products.tsx
```
GET  /products/                          → список товаров
POST /products/                          → создать товар
PATCH /products/{id}                     → редактировать (в т.ч. inactive_threshold_days)
```

### Warehouse.tsx
```
GET  /warehouse/stock                    → текущие остатки
POST /warehouse/transactions             → приход/расход
```

### Debts.tsx
```
GET  /debts/                             → список должников (search, page)
GET  /debts/history                      → история транзакций долгов
POST /debts/{client_id}/pay              → принять оплату долга
```

### Finance.tsx
```
GET  /statistics/financial-dashboard     → сводка доходов/расходов
```

### Treasury.tsx
```
GET  /treasury/                          → список транзакций казны (фильтры: date_from, date_to, type, category)
POST /treasury/                          → добавить транзакцию
```

### CashRegister.tsx
```
GET  /cash-register/collections          → список инкассаций (фильтры: courier_id, date_from, date_to)
GET  /cash-register/collections/summary  → сводка по периоду
```

### InactiveClients.tsx
```
GET  /products/?is_active=true&per_page=200   → вкладки по продуктам
GET  /reports/inactive-by-product?product_id=...&page=...  → неактивные клиенты
GET  /reports/never-ordered                   → никогда не заказывали
PATCH /products/{id}/                         → сохранить порог inactive_threshold_days
```

### AdminExpenses.tsx
```
GET  /admin-expenses/                    → список расходов
POST /admin-expenses/                    → добавить расход
```

### OperatorKassa.tsx
```
GET  /operator/me/balance                → текущий баланс оператора
POST /operator/me/submit                 → сдать кассу боссу
```

### Staff.tsx
```
GET  /users/                             → список сотрудников
POST /users/                             → создать сотрудника
PATCH /users/{id}                        → редактировать
DELETE /users/{id}                       → удалить
```

### Settings.tsx
```
GET  /settings/                          → настройки тенанта
PATCH /settings/                         → сохранить настройки
```

---

## Client App (`/root/suvpro/client-app/src/`)

### Auth (App.tsx)
```
POST /auth/telegram/auth                 → вход по Telegram initData (HMAC)
POST /auth/refresh                       → обновить токен
```

### CatalogPage.tsx
```
GET  /products/?show_to_clients=true     → каталог товаров клиента
```

### CartPage.tsx
```
POST /orders/                            → создать заказ
GET  /clients/me/addresses               → адреса клиента
```

### OrdersPage.tsx
```
GET  /orders/my                          → история заказов клиента
```

### ProfilePage.tsx
```
GET  /clients/me                         → профиль
PATCH /clients/me                        → редактировать
POST  /clients/me/addresses              → добавить адрес
DELETE /clients/me/addresses/{id}        → удалить адрес
```

---

## Courier App (`/root/suvpro/courier-app/src/`)

### Auth
```
POST /auth/telegram/auth                 → вход по Telegram initData
```

### OrdersTab.tsx
```
GET  /orders/courier/active              → активные заказы курьера
PATCH /orders/{id}/status                → сменить статус (yolda)
POST /orders/{id}/complete               → завершить доставку
POST /orders/{id}/problem                → отметить проблему
```

### WalkinTab.tsx
```
POST /orders/walkin                      → уличная продажа
GET  /orders/courier/walkin-history      → история walkin
```

### HistoryTab.tsx
```
GET  /orders/courier/history             → история доставок
```

### DebtPaymentTab.tsx
```
GET  /debts/courier/clients              → клиенты с долгами
POST /debts/courier/{client_id}/pay      → принять оплату долга
```

### ProfileTab.tsx
```
GET  /couriers/me                        → профиль
GET  /couriers/me/inventory              → остатки у курьера
PATCH /couriers/me                       → обновить навигатор
POST /couriers/me/shift/open             → открыть смену
POST /couriers/me/shift/close            → закрыть смену
GET  /couriers/me/expenses               → мои расходы
POST /couriers/me/expenses               → добавить расход
GET  /couriers/me/clients/search         → поиск клиента по телефону
```

---

## Bot (`/root/suvpro/bot/services/api_client.py`)

```
GET  /auth/telegram/user/{telegram_id}   + X-Bot-Secret header → найти пользователя
POST /clients/register                   → зарегистрировать клиента
POST /couriers/register                  → зарегистрировать курьера
GET  /couriers/invite/check?phone=...    → проверить приглашение курьера
```
