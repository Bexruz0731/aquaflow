# ✅ Чеклист развертывания SUV Pro на сервере

## 📋 Перед началом

- [ ] У вас есть доступ к серверу (IP: 31.56.113.76)
- [ ] У вас есть SSH доступ (root или sudo пользователь)
- [ ] Сервер на Ubuntu 24.04
- [ ] У вас есть токен Telegram бота от @BotFather
- [ ] Все файлы проекта на вашем компьютере готовы

---

## 🚀 Этапы развертывания

### Этап 1: Подготовка сервера ✅

- [ ] Подключился к серверу через SSH
- [ ] Обновил систему: `apt update && apt upgrade -y`
- [ ] Установил Docker
- [ ] Установил Docker Compose
- [ ] Установил дополнительные утилиты (git, curl, wget, vim, htop)
- [ ] Настроил файрвол (UFW)
  - [ ] Разрешил порт 22 (SSH)
  - [ ] Разрешил порт 80 (HTTP)
  - [ ] Разрешил порт 443 (HTTPS)
- [ ] Создал директорию `/opt/suvpro`

**Команды для копирования:**
```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin git curl wget vim htop nano
ufw --force enable && ufw allow 22 && ufw allow 80 && ufw allow 443
mkdir -p /opt/suvpro && cd /opt/suvpro
```

---

### Этап 2: Перенос файлов ✅

- [ ] Перенес все файлы проекта на сервер через SCP
- [ ] Проверил наличие всех папок на сервере:
  - [ ] `/opt/suvpro/backend`
  - [ ] `/opt/suvpro/bot`
  - [ ] `/opt/suvpro/web`
  - [ ] `/opt/suvpro/client-app`
  - [ ] `/opt/suvpro/courier-app`
  - [ ] `/opt/suvpro/nginx`
  - [ ] `/opt/suvpro/docker-compose.prod.yml`

**Команда для копирования (на Windows):**
```powershell
scp -r "C:\Users\user\Desktop\suv pro\*" root@31.56.113.76:/opt/suvpro/
```

---

### Этап 3: Настройка переменных окружения ✅

#### Backend .env файл

- [ ] Создал `backend/.env` из `backend/.env.production`
- [ ] Сгенерировал `SECRET_KEY` командой: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
- [ ] Вставил `SECRET_KEY` в файл
- [ ] Задал надежный пароль для PostgreSQL (`POSTGRES_PASSWORD`)
- [ ] Обновил `DATABASE_URL` с новым паролем
- [ ] Обновил `DATABASE_SYNC_URL` с новым паролем
- [ ] Задал надежный пароль для Redis
- [ ] Обновил `REDIS_URL` с паролем Redis
- [ ] Вставил токен Telegram бота (`TELEGRAM_BOT_TOKEN`)
- [ ] Обновил `ALLOWED_ORIGINS` (добавил IP или домен сервера)

#### Bot .env файл

- [ ] Создал `bot/.env` из `bot/.env.production`
- [ ] Вставил токен Telegram бота (`BOT_TOKEN`)
- [ ] Обновил `REDIS_URL` (тот же пароль, что и в backend)

**Команды:**
```bash
cd /opt/suvpro
cp backend/.env.production backend/.env
nano backend/.env
cp bot/.env.production bot/.env
nano bot/.env
```

---

### Этап 4: Запуск проекта ✅

- [ ] Запустил сборку и запуск контейнеров: `docker compose -f docker-compose.prod.yml up -d --build`
- [ ] Дождался завершения сборки (может занять 5-10 минут)
- [ ] Проверил логи: `docker compose -f docker-compose.prod.yml logs -f`
- [ ] Убедился, что нет критических ошибок
- [ ] Проверил статус контейнеров: `docker compose -f docker-compose.prod.yml ps`
- [ ] Все контейнеры в состоянии "Up" или "running"

**Команды:**
```bash
cd /opt/suvpro
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

---

### Этап 5: Проверка работоспособности ✅

#### Проверка через браузер

- [ ] Открыл `http://31.56.113.76/docs` - API документация работает
- [ ] Открыл `http://31.56.113.76/admin` - Admin панель загружается
- [ ] Открыл `http://31.56.113.76/client` - Client App загружается
- [ ] Открыл `http://31.56.113.76/courier` - Courier App загружается

#### Проверка сервисов

- [ ] Backend отвечает: `curl http://localhost/api/v1/health` или `curl http://localhost/docs`
- [ ] PostgreSQL работает: `docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres`
- [ ] Redis работает: `docker compose -f docker-compose.prod.yml exec redis redis-cli ping`
- [ ] Nginx работает: `docker compose -f docker-compose.prod.yml logs nginx`

#### Проверка Telegram бота

- [ ] Открыл Telegram и написал `/start` боту
- [ ] Бот ответил
- [ ] Проверил логи бота: `docker compose -f docker-compose.prod.yml logs bot`

**Команды для проверки:**
```bash
curl http://31.56.113.76/docs
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres
docker compose -f docker-compose.prod.yml logs bot --tail 20
```

---

### Этап 6: Настройка автозапуска ✅

- [ ] Убедился, что в `docker-compose.prod.yml` у сервисов стоит `restart: always`
- [ ] Проверил автозапуск: перезагрузил сервер `sudo reboot`
- [ ] После перезагрузки проверил, что контейнеры запустились автоматически: `docker ps`

---

### Этап 7: Безопасность (опционально, но рекомендуется) ⚠️

- [ ] Изменил SSH порт (не 22)
- [ ] Отключил вход по паролю для SSH (использую только SSH ключи)
- [ ] Установил fail2ban для защиты от брутфорса
- [ ] Настроил регулярные бэкапы базы данных
- [ ] Настроил SSL сертификат (Let's Encrypt) если есть домен

**Команды для SSL (если есть домен):**
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

---

### Этап 8: Мониторинг и обслуживание ✅

- [ ] Создал скрипт для автоматического бэкапа БД
- [ ] Настроил cron для регулярных бэкапов
- [ ] Знаю, как смотреть логи каждого сервиса
- [ ] Знаю, как перезапускать отдельные сервисы
- [ ] Знаю, как обновлять проект

**Бэкап БД (добавить в crontab):**
```bash
# Создать бэкап
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres suvpro > /opt/backups/suvpro_$(date +%Y%m%d_%H%M%S).sql

# Настроить автоматический бэкап (каждый день в 3:00 ночи)
crontab -e
# Добавить строку:
0 3 * * * cd /opt/suvpro && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres suvpro > /opt/backups/suvpro_$(date +\%Y\%m\%d).sql
```

---

## 🎉 Развертывание завершено!

Если все пункты отмечены ✅ - ваш проект успешно развернут!

---

## 📊 Дополнительные проверки

### Производительность

- [ ] Проверил использование ресурсов: `docker stats`
- [ ] CPU использование в норме (< 80%)
- [ ] RAM использование в норме (< 80%)
- [ ] Диск имеет свободное место (> 20% свободно)

### Логирование

- [ ] Логи сохраняются: `docker compose -f docker-compose.prod.yml logs > logs.txt`
- [ ] Нет повторяющихся ошибок в логах
- [ ] Warnings и Info сообщения понятны

---

## 🔗 Полезные ссылки

- [SERVER_SETUP_COMMANDS.md](./SERVER_SETUP_COMMANDS.md) - Все команды для копирования
- [QUICK_START.md](./QUICK_START.md) - Быстрый старт
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Подробное руководство
- [docker-compose.prod.yml](./docker-compose.prod.yml) - Production конфигурация

---

## 📞 Помощь

Если что-то пошло не так:

1. **Проверьте логи:** `docker compose -f docker-compose.prod.yml logs`
2. **Проверьте статус:** `docker compose -f docker-compose.prod.yml ps`
3. **Перезапустите сервис:** `docker compose -f docker-compose.prod.yml restart <service_name>`
4. **Полная перезагрузка:** `docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d --build`

---

**Дата развертывания:** _______________

**Версия проекта:** _______________

**Заметки:**
_____________________________________
_____________________________________
_____________________________________
