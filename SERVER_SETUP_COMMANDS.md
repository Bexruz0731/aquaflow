# 📋 Команды для настройки сервера - Копируй и вставляй

## Шаг 1: Подключение к серверу

```bash
ssh root@31.56.113.76
```

---

## Шаг 2: Установка необходимого ПО на сервере

Скопируйте и вставьте эти команды **на сервере**:

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Установка Docker Compose
apt install -y docker-compose-plugin

# Установка дополнительных утилит
apt install -y git curl wget vim htop nano

# Настройка файрвола
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Создание директории для проекта
mkdir -p /opt/suvpro
cd /opt/suvpro
```

---

## Шаг 3: Перенос файлов с Windows на сервер

**На вашем компьютере (Windows PowerShell или Git Bash):**

### Вариант A: Полный перенос всех файлов

```powershell
# Открыть PowerShell и выполнить:
scp -r "C:\Users\user\Desktop\suv pro\*" root@31.56.113.76:/opt/suvpro/
```

### Вариант B: Перенос по папкам (если нужно выборочно)

```powershell
# Backend
scp -r "C:\Users\user\Desktop\suv pro\backend" root@31.56.113.76:/opt/suvpro/

# Bot
scp -r "C:\Users\user\Desktop\suv pro\bot" root@31.56.113.76:/opt/suvpro/

# Web приложения
scp -r "C:\Users\user\Desktop\suv pro\web" root@31.56.113.76:/opt/suvpro/
scp -r "C:\Users\user\Desktop\suv pro\client-app" root@31.56.113.76:/opt/suvpro/
scp -r "C:\Users\user\Desktop\suv pro\courier-app" root@31.56.113.76:/opt/suvpro/

# Nginx конфигурация
scp -r "C:\Users\user\Desktop\suv pro\nginx" root@31.56.113.76:/opt/suvpro/

# Docker Compose файл
scp "C:\Users\user\Desktop\suv pro\docker-compose.prod.yml" root@31.56.113.76:/opt/suvpro/
```

---

## Шаг 4: Настройка переменных окружения

**На сервере выполните:**

```bash
cd /opt/suvpro

# Создаем .env для backend
cp backend/.env.production backend/.env

# Редактируем файл
nano backend/.env
```

**Замените в файле:**
- `YOUR_SECURE_DB_PASSWORD` - на надежный пароль для БД
- `YOUR_REDIS_PASSWORD` - на надежный пароль для Redis
- `CHANGE_THIS_TO_SECURE_RANDOM_STRING_MIN_32_CHARS` - на секретный ключ (сгенерируйте командой ниже)
- `YOUR_BOT_TOKEN_FROM_BOTFATHER` - на токен вашего бота от @BotFather
- `ALLOWED_ORIGINS=http://31.56.113.76` - оставьте или добавьте ваш домен

**Генерация SECRET_KEY:**

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Скопируйте вывод команды и вставьте в `SECRET_KEY`

**Создаем .env для bot:**

```bash
cp bot/.env.production bot/.env
nano bot/.env
```

Замените `YOUR_BOT_TOKEN_FROM_BOTFATHER` на токен бота и `YOUR_REDIS_PASSWORD` на тот же пароль Redis.

---

## Шаг 5: Запуск проекта

**На сервере:**

```bash
cd /opt/suvpro

# Запуск всех сервисов
docker compose -f docker-compose.prod.yml up -d --build

# Просмотр логов (для проверки)
docker compose -f docker-compose.prod.yml logs -f
```

Нажмите `Ctrl+C` чтобы выйти из просмотра логов.

---

## Шаг 6: Проверка работы

**Проверьте статус контейнеров:**

```bash
docker compose -f docker-compose.prod.yml ps
```

Все контейнеры должны быть в состоянии "Up" или "running".

**Откройте в браузере:**

- API Docs: `http://31.56.113.76/docs`
- Admin Panel: `http://31.56.113.76/admin`
- Client App: `http://31.56.113.76/client`
- Courier App: `http://31.56.113.76/courier`

---

## ✅ Готово!

Ваш проект развернут и работает.

---

## 🔄 Полезные команды для управления

### Просмотр логов

```bash
# Все сервисы
docker compose -f docker-compose.prod.yml logs -f

# Только backend
docker compose -f docker-compose.prod.yml logs -f backend

# Только bot
docker compose -f docker-compose.prod.yml logs -f bot
```

### Перезапуск сервисов

```bash
# Перезапуск всех
docker compose -f docker-compose.prod.yml restart

# Перезапуск конкретного сервиса
docker compose -f docker-compose.prod.yml restart backend
```

### Остановка и запуск

```bash
# Остановка всех сервисов
docker compose -f docker-compose.prod.yml down

# Запуск
docker compose -f docker-compose.prod.yml up -d
```

### Работа с базой данных

```bash
# Подключение к PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d suvpro

# Бэкап БД
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres suvpro > backup_$(date +%Y%m%d).sql

# Восстановление БД
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres suvpro < backup.sql
```

### Обновление проекта

```bash
cd /opt/suvpro

# Если используете Git
git pull

# Пересборка и перезапуск
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 🆘 Решение проблем

### Проблема: Контейнер не запускается

```bash
# Посмотреть логи
docker compose -f docker-compose.prod.yml logs <service_name>

# Проверить конфигурацию
docker compose -f docker-compose.prod.yml config
```

### Проблема: Ошибка подключения к БД

```bash
# Проверить здоровье PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres

# Перезапустить БД
docker compose -f docker-compose.prod.yml restart postgres
```

### Проблема: 502 Bad Gateway

```bash
# Проверить backend
docker compose -f docker-compose.prod.yml logs backend

# Перезапустить nginx
docker compose -f docker-compose.prod.yml restart nginx
```

### Полная очистка и перезапуск

```bash
# Остановка и удаление контейнеров
docker compose -f docker-compose.prod.yml down

# Удаление volumes (ВНИМАНИЕ: удалит данные БД!)
docker compose -f docker-compose.prod.yml down -v

# Запуск заново
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 📞 Дополнительная помощь

Смотрите полную документацию:
- [QUICK_START.md](./QUICK_START.md) - Быстрый старт
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Подробное руководство
