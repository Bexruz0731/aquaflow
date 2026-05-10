# 🚀 SUV Pro - Развертывание на Production сервере

## 📌 Информация о проекте

**Проект:** SUV Pro - Система управления доставкой воды
**Сервер:** 31.56.113.76 (Ubuntu 24.04)
**Провайдер:** HostVDS

---

## 🎯 Быстрый старт - 3 простых шага

### 1️⃣ На сервере - установить Docker

```bash
ssh root@31.56.113.76

# Одна команда для установки всего необходимого
curl -fsSL https://get.docker.com | sh && \
apt install -y docker-compose-plugin git curl wget vim htop nano && \
ufw --force enable && ufw allow 22 && ufw allow 80 && ufw allow 443 && \
mkdir -p /opt/suvpro && cd /opt/suvpro
```

### 2️⃣ На Windows - перенести файлы

```powershell
# В PowerShell выполнить:
scp -r "C:\Users\user\Desktop\suv pro\*" root@31.56.113.76:/opt/suvpro/
```

### 3️⃣ На сервере - настроить и запустить

```bash
cd /opt/suvpro

# Настроить .env файлы
cp backend/.env.production backend/.env
cp bot/.env.production bot/.env

# Сгенерировать SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# Скопировать вывод

# Редактировать .env файлы
nano backend/.env  # Вставить SECRET_KEY, пароли, токен бота
nano bot/.env      # Вставить токен бота, пароль Redis

# Запустить проект
docker compose -f docker-compose.prod.yml up -d --build

# Проверить статус
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

### 4️⃣ Открыть в браузере

- **API Docs:** http://31.56.113.76/docs
- **Admin Panel:** http://31.56.113.76/admin
- **Client App:** http://31.56.113.76/client
- **Courier App:** http://31.56.113.76/courier

---

## 📚 Документация

| Документ | Описание |
|----------|----------|
| [CHECKLIST.md](./CHECKLIST.md) | ✅ Чеклист для проверки всех шагов |
| [SERVER_SETUP_COMMANDS.md](./SERVER_SETUP_COMMANDS.md) | 📋 Все команды для копирования и вставки |
| [QUICK_START.md](./QUICK_START.md) | ⚡ Быстрый старт для опытных |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | 📖 Подробное руководство |
| [quick-deploy.sh](./quick-deploy.sh) | 🔧 Интерактивный скрипт деплоя |

---

## 🏗️ Архитектура проекта

```
┌─────────────────────────────────────────────────┐
│                   NGINX (Port 80/443)            │
│          Reverse Proxy + Static Files            │
└───────────┬──────────┬──────────┬────────────────┘
            │          │          │
    ┌───────▼──────┐   │   ┌──────▼───────┐
    │   Backend    │   │   │  Web Apps    │
    │  (FastAPI)   │   │   │ (React/Vite) │
    │   Port 8000  │   │   └──────────────┘
    └───────┬──────┘   │
            │          │
    ┌───────▼──────┐   │   ┌──────────────┐
    │  PostgreSQL  │   │   │  Telegram    │
    │   Database   │   │   │     Bot      │
    └──────────────┘   │   └──────────────┘
                       │
              ┌────────▼─────────┐
              │      Redis       │
              │  Cache + Queue   │
              └──────────────────┘
```

---

## 🔧 Структура файлов на сервере

```
/opt/suvpro/
├── backend/
│   ├── app/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env                     # Создать из .env.production
├── bot/
│   ├── handlers/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env                     # Создать из .env.production
├── web/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── client-app/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── courier-app/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── nginx/
│   ├── nginx.conf
│   └── ssl/ (опционально)
├── docker-compose.prod.yml      # Production конфигурация
├── quick-deploy.sh              # Скрипт для управления
└── README_DEPLOYMENT.md         # Этот файл
```

---

## ⚙️ Что нужно изменить в .env файлах

### backend/.env

| Параметр | Что указать |
|----------|-------------|
| `SECRET_KEY` | Сгенерировать: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `DATABASE_URL` | Заменить `YOUR_SECURE_DB_PASSWORD` на надежный пароль |
| `DATABASE_SYNC_URL` | Заменить `YOUR_SECURE_DB_PASSWORD` на тот же пароль |
| `REDIS_URL` | Заменить `YOUR_REDIS_PASSWORD` на надежный пароль |
| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather |
| `ALLOWED_ORIGINS` | `http://31.56.113.76` или ваш домен |

### bot/.env

| Параметр | Что указать |
|----------|-------------|
| `BOT_TOKEN` | Токен от @BotFather (тот же, что в backend) |
| `REDIS_URL` | Тот же пароль Redis, что в backend |

---

## 🔍 Проверка работы

### Быстрая проверка

```bash
# Статус всех контейнеров
docker compose -f docker-compose.prod.yml ps

# Должно быть примерно так:
# NAME                STATUS
# suvpro_backend      Up (healthy)
# suvpro_postgres     Up (healthy)
# suvpro_redis        Up (healthy)
# suvpro_bot          Up
# suvpro_nginx        Up
# suvpro_celery       Up
```

### Проверка логов

```bash
# Все логи
docker compose -f docker-compose.prod.yml logs -f

# Только ошибки
docker compose -f docker-compose.prod.yml logs | grep -i error

# Конкретный сервис
docker compose -f docker-compose.prod.yml logs -f backend
```

### Проверка доступности

```bash
# API работает
curl http://localhost/docs

# PostgreSQL работает
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres

# Redis работает
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

---

## 🛠️ Управление проектом

### Основные команды

```bash
cd /opt/suvpro

# Запуск
docker compose -f docker-compose.prod.yml up -d

# Остановка
docker compose -f docker-compose.prod.yml down

# Перезапуск
docker compose -f docker-compose.prod.yml restart

# Пересборка после изменений
docker compose -f docker-compose.prod.yml up -d --build

# Просмотр логов
docker compose -f docker-compose.prod.yml logs -f

# Статус контейнеров
docker compose -f docker-compose.prod.yml ps
```

### Работа с отдельными сервисами

```bash
# Перезапуск backend
docker compose -f docker-compose.prod.yml restart backend

# Логи бота
docker compose -f docker-compose.prod.yml logs -f bot

# Перезапуск nginx
docker compose -f docker-compose.prod.yml restart nginx
```

### Работа с базой данных

```bash
# Подключение к PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d suvpro

# Бэкап
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres suvpro > backup_$(date +%Y%m%d).sql

# Восстановление
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres suvpro < backup.sql

# Просмотр таблиц
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d suvpro -c "\dt"
```

---

## 🔄 Обновление проекта

### Если используете Git

```bash
cd /opt/suvpro
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Если переносите файлы вручную

```bash
# На Windows
scp -r "C:\Users\user\Desktop\suv pro\backend" root@31.56.113.76:/opt/suvpro/

# На сервере
cd /opt/suvpro
docker compose -f docker-compose.prod.yml up -d --build backend
```

---

## 🔐 Безопасность

### Обязательно

- ✅ Измените все пароли в .env файлах
- ✅ Сгенерируйте новый SECRET_KEY
- ✅ Используйте сильные пароли (мин. 16 символов)
- ✅ Настройте файрвол (UFW)

### Рекомендуется

- ⚠️ Настройте SSH ключи (отключите вход по паролю)
- ⚠️ Установите fail2ban
- ⚠️ Настройте SSL сертификат (Let's Encrypt)
- ⚠️ Регулярные бэкапы БД
- ⚠️ Мониторинг логов

### SSL сертификат (если есть домен)

```bash
# Установка Certbot
apt install -y certbot python3-certbot-nginx

# Получение сертификата
certbot --nginx -d your-domain.com -d www.your-domain.com

# Автообновление (cron)
certbot renew --dry-run
```

---

## 📊 Мониторинг

### Использование ресурсов

```bash
# Docker контейнеры
docker stats

# Система
htop

# Диск
df -h

# Логи nginx
docker compose -f docker-compose.prod.yml exec nginx tail -f /var/log/nginx/access.log
```

### Автоматический мониторинг (опционально)

Можно установить:
- **Portainer** - веб-интерфейс для Docker
- **Prometheus + Grafana** - метрики и графики
- **Netdata** - мониторинг в реальном времени

---

## 🆘 Решение проблем

| Проблема | Решение |
|----------|---------|
| Контейнер не запускается | `docker compose -f docker-compose.prod.yml logs <service>` |
| 502 Bad Gateway | Проверить логи backend и nginx |
| База данных недоступна | `docker compose -f docker-compose.prod.yml restart postgres` |
| Бот не отвечает | Проверить токен в bot/.env, перезапустить бота |
| Нет свободного места | `docker system prune -af` (осторожно!) |
| Высокая нагрузка | `docker stats`, увеличить ресурсы сервера |

### Полная перезагрузка

```bash
# Остановить все
docker compose -f docker-compose.prod.yml down

# Удалить volumes (УДАЛИТ ДАННЫЕ!)
docker compose -f docker-compose.prod.yml down -v

# Запустить заново
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 📞 Поддержка

- 📖 Документация: Смотрите файлы в папке проекта
- 🐛 Баги: Проверяйте логи контейнеров
- 💬 Вопросы: Проверьте DEPLOYMENT_GUIDE.md

---

## ✅ Чеклист запуска

1. ✅ Docker и Docker Compose установлены
2. ✅ Файрвол настроен (порты 22, 80, 443)
3. ✅ Файлы проекта перенесены на сервер
4. ✅ .env файлы созданы и заполнены
5. ✅ Пароли изменены на безопасные
6. ✅ SECRET_KEY сгенерирован
7. ✅ Telegram токен указан
8. ✅ Проект запущен: `docker compose up -d --build`
9. ✅ Все контейнеры в статусе "Up"
10. ✅ API доступен: http://31.56.113.76/docs
11. ✅ Веб-приложения открываются
12. ✅ Telegram бот отвечает

---

## 🎉 Готово!

Ваш проект SUV Pro развернут и работает на production сервере!

**Полезные ссылки:**
- API: http://31.56.113.76/docs
- Admin: http://31.56.113.76/admin
- Client: http://31.56.113.76/client
- Courier: http://31.56.113.76/courier

---

*Последнее обновление: 2025-01-XX*
