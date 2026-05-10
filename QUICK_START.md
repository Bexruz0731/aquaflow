# ⚡ SUV Pro - Быстрый старт на сервере

## 🎯 Краткая инструкция для опытных пользователей

### 1. Подключитесь к серверу
```bash
ssh root@31.56.113.76
```

### 2. Запустите автоматическую установку
```bash
# Скачайте deploy.sh на сервер и запустите
wget https://get.docker.com -O get-docker.sh && sh get-docker.sh
apt install -y docker-compose-plugin git ufw
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
mkdir -p /opt/suvpro && cd /opt/suvpro
```

### 3. Перенесите файлы проекта
```bash
# С вашего компьютера (Windows PowerShell/Git Bash)
scp -r "C:\Users\user\Desktop\suv pro\*" root@31.56.113.76:/opt/suvpro/
```

### 4. Настройте переменные окружения
```bash
# На сервере
cd /opt/suvpro

# Создайте .env для backend
cp backend/.env.production backend/.env
nano backend/.env  # Измените пароли и токены

# Создайте .env для bot
cp bot/.env.production bot/.env
nano bot/.env  # Измените токен бота
```

**Обязательные изменения в backend/.env:**
```env
SECRET_KEY=<сгенерируйте командой ниже>
DATABASE_URL=postgresql+asyncpg://postgres:СИЛЬНЫЙ_ПАРОЛЬ@postgres:5432/suvpro
DATABASE_SYNC_URL=postgresql://postgres:СИЛЬНЫЙ_ПАРОЛЬ@postgres:5432/suvpro
REDIS_URL=redis://:СИЛЬНЫЙ_ПАРОЛЬ@redis:6379/0
TELEGRAM_BOT_TOKEN=<ваш токен от @BotFather>
ALLOWED_ORIGINS=http://31.56.113.76
```

**Генерация SECRET_KEY:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5. Запустите проект
```bash
cd /opt/suvpro
docker compose -f docker-compose.prod.yml up -d --build
```

### 6. Проверьте работу
```bash
# Посмотреть статус
docker compose -f docker-compose.prod.yml ps

# Посмотреть логи
docker compose -f docker-compose.prod.yml logs -f
```

### 7. Откройте в браузере
- **API**: http://31.56.113.76/api/v1/docs
- **Web Admin**: http://31.56.113.76/admin
- **Client App**: http://31.56.113.76/client
- **Courier App**: http://31.56.113.76/courier

---

## 🔄 Полезные команды

```bash
# Перезапуск всех сервисов
docker compose -f docker-compose.prod.yml restart

# Остановка
docker compose -f docker-compose.prod.yml down

# Просмотр логов конкретного сервиса
docker compose -f docker-compose.prod.yml logs -f backend

# Подключение к БД
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d suvpro

# Бэкап БД
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres suvpro > backup.sql

# Обновление после изменений
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 🚨 Что делать, если что-то не работает

1. **Проверить логи:**
   ```bash
   docker compose -f docker-compose.prod.yml logs
   ```

2. **Проверить статус контейнеров:**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```

3. **Перезапустить проблемный сервис:**
   ```bash
   docker compose -f docker-compose.prod.yml restart <service_name>
   ```

4. **Полная перезагрузка:**
   ```bash
   docker compose -f docker-compose.prod.yml down
   docker compose -f docker-compose.prod.yml up -d --build
   ```

---

## 📝 Полная документация

Смотрите [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) для подробных инструкций.
