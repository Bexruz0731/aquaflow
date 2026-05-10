# 🚀 SUV Pro - Руководство по развертыванию на Production сервере

## Информация о сервере
- **IP**: 31.56.113.76
- **ОС**: Ubuntu 24.04
- **Провайдер**: HostVDS

---

## 📋 Пошаговая инструкция

### 1️⃣ Подключение к серверу

```bash
ssh root@31.56.113.76
```

### 2️⃣ Автоматическая настройка сервера

Скопируйте скрипт `deploy.sh` на сервер и запустите:

```bash
# На вашем компьютере
scp deploy.sh root@31.56.113.76:/root/

# На сервере
chmod +x /root/deploy.sh
sudo /root/deploy.sh
```

Этот скрипт автоматически:
- Обновит систему
- Установит Docker и Docker Compose
- Настроит файрвол (UFW)
- Создаст директорию проекта `/opt/suvpro`

### 3️⃣ Перенос файлов проекта на сервер

**Вариант A: Используя SCP (с вашего компьютера)**

```bash
# Windows (из PowerShell или Git Bash)
scp -r "C:\Users\user\Desktop\suv pro\*" root@31.56.113.76:/opt/suvpro/

# Или отдельными папками
scp -r "C:\Users\user\Desktop\suv pro\backend" root@31.56.113.76:/opt/suvpro/
scp -r "C:\Users\user\Desktop\suv pro\bot" root@31.56.113.76:/opt/suvpro/
scp -r "C:\Users\user\Desktop\suv pro\web" root@31.56.113.76:/opt/suvpro/
scp -r "C:\Users\user\Desktop\suv pro\client-app" root@31.56.113.76:/opt/suvpro/
scp -r "C:\Users\user\Desktop\suv pro\courier-app" root@31.56.113.76:/opt/suvpro/
scp -r "C:\Users\user\Desktop\suv pro\nginx" root@31.56.113.76:/opt/suvpro/
scp "C:\Users\user\Desktop\suv pro\docker-compose.prod.yml" root@31.56.113.76:/opt/suvpro/
scp "C:\Users\user\Desktop\suv pro\.env.production" root@31.56.113.76:/opt/suvpro/.env
```

**Вариант B: Используя Git (на сервере)**

```bash
# На сервере
cd /opt/suvpro
git clone https://ваш-репозиторий.git .
```

**Вариант C: Используя FileZilla или WinSCP**
- Подключитесь к серверу через SFTP
- Загрузите все файлы в `/opt/suvpro/`

### 4️⃣ Настройка environment переменных

На сервере отредактируйте файл `.env`:

```bash
cd /opt/suvpro
cp .env.production .env
nano .env
```

**Обязательно измените:**

```env
# Database
POSTGRES_PASSWORD=ваш_супер_надежный_пароль

# Backend
SECRET_KEY=ваш_очень_длинный_секретный_ключ_минимум_32_символа
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather

# Frontend (замените на ваш IP или домен)
VITE_API_URL=http://31.56.113.76/api/v1
VITE_TELEGRAM_BOT_USERNAME=ваш_бот_username
CORS_ORIGINS=http://31.56.113.76,https://ваш-домен.com
```

**Генерация SECRET_KEY:**

```bash
# На сервере
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5️⃣ Создание Dockerfile для frontend приложений

Убедитесь, что в папках `web`, `client-app`, `courier-app` есть Dockerfile:

**web/Dockerfile:**
```dockerfile
FROM node:18-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**client-app/Dockerfile и courier-app/Dockerfile:**
```dockerfile
FROM node:18-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_TELEGRAM_BOT_USERNAME
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 6️⃣ Запуск проекта

```bash
cd /opt/suvpro

# Сборка и запуск всех сервисов
docker compose -f docker-compose.prod.yml up -d --build

# Просмотр логов
docker compose -f docker-compose.prod.yml logs -f

# Просмотр статуса контейнеров
docker compose -f docker-compose.prod.yml ps
```

### 7️⃣ Инициализация базы данных

```bash
# Подключение к PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d suvpro

# Или выполнение миграций (если есть)
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### 8️⃣ Проверка работоспособности

Откройте в браузере:

- **Admin Panel**: http://31.56.113.76/
- **API Docs**: http://31.56.113.76/docs
- **Client App**: http://31.56.113.76/client-app
- **Courier App**: http://31.56.113.76/courier-app
- **Health Check**: http://31.56.113.76/health

### 9️⃣ Настройка автозапуска

Docker Compose с флагом `restart: unless-stopped` автоматически перезапустит контейнеры после перезагрузки сервера.

Проверка:

```bash
# Перезагрузка сервера
sudo reboot

# После перезагрузки проверьте контейнеры
docker ps
```

---

## 🔧 Полезные команды

### Управление контейнерами

```bash
# Остановка всех сервисов
docker compose -f docker-compose.prod.yml down

# Перезапуск отдельного сервиса
docker compose -f docker-compose.prod.yml restart backend

# Просмотр логов конкретного сервиса
docker compose -f docker-compose.prod.yml logs -f backend

# Пересборка после изменений
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

### Работа с базой данных

```bash
# Подключение к PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d suvpro

# Бэкап базы данных
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres suvpro > backup_$(date +%Y%m%d).sql

# Восстановление базы данных
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres suvpro < backup.sql
```

### Мониторинг

```bash
# Использование ресурсов
docker stats

# Логи nginx
docker compose -f docker-compose.prod.yml logs nginx

# Размер контейнеров
docker system df
```

---

## 🔐 Безопасность

### Рекомендации:

1. **Измените пароли** в `.env` файле
2. **Настройте SSH**: отключите вход по паролю, используйте SSH ключи
3. **Настройте fail2ban** для защиты от брутфорса
4. **Регулярно обновляйте** систему и Docker образы
5. **Настройте SSL/TLS** с помощью Let's Encrypt (Certbot)
6. **Бэкапы БД** - настройте регулярное резервное копирование

### Настройка SSL (опционально):

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение сертификата (если есть домен)
sudo certbot --nginx -d ваш-домен.com
```

---

## 📊 Мониторинг и логи

### Централизованные логи:

```bash
# Все логи
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Фильтр по уровню (errors)
docker compose -f docker-compose.prod.yml logs -f | grep ERROR
```

### Настройка системного мониторинга (опционально):

```bash
# Установка htop для мониторинга
sudo apt install -y htop

# Просмотр использования ресурсов
htop
```

---

## 🆘 Устранение неполадок

### Проблема: Контейнеры не запускаются

```bash
# Проверка логов
docker compose -f docker-compose.prod.yml logs

# Проверка конфигурации
docker compose -f docker-compose.prod.yml config
```

### Проблема: Ошибки подключения к БД

```bash
# Проверка здоровья PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres

# Перезапуск БД
docker compose -f docker-compose.prod.yml restart postgres
```

### Проблема: 502 Bad Gateway

```bash
# Проверка backend
docker compose -f docker-compose.prod.yml logs backend

# Проверка nginx
docker compose -f docker-compose.prod.yml logs nginx
```

---

## 📝 Обновление проекта

```bash
cd /opt/suvpro

# Скачать изменения (если используется Git)
git pull

# Пересобрать и перезапустить
docker compose -f docker-compose.prod.yml up -d --build

# Или для конкретного сервиса
docker compose -f docker-compose.prod.yml up -d --build backend
```

---

## ✅ Чеклист развертывания

- [ ] Подключился к серверу
- [ ] Запустил deploy.sh
- [ ] Перенес файлы проекта
- [ ] Настроил .env файл
- [ ] Создал Dockerfile для всех сервисов
- [ ] Запустил docker compose
- [ ] Проверил работу всех сервисов
- [ ] Настроил файрвол
- [ ] Создал бэкап БД
- [ ] Протестировал API
- [ ] Протестировал веб-приложения
- [ ] Настроил автозапуск

---

## 🎉 Готово!

Ваш проект SUV Pro успешно развернут на production сервере!

При возникновении вопросов проверьте логи или обратитесь к документации Docker и PostgreSQL.
