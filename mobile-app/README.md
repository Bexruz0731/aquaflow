# AkoWater Mobile App

## Запуск для тестирования

### 1. Установи Expo Go на телефон
- Android: https://play.google.com/store/apps/details?id=host.exp.exponent
- iOS: https://apps.apple.com/app/expo-go/id982107779

### 2. Настрой API URL
Открой `app.config.ts` и замени:
```
API_URL: 'https://yourdomain.com/api/v1'
```
на реальный адрес твоего сервера.

### 3. Запусти dev сервер
```bash
cd mobile-app
npx expo start
```
Сканируй QR код через Expo Go — приложение откроется на телефоне.

### 4. Сборка APK (без магазина)
```bash
npx expo install eas-cli
npx eas build --platform android --profile preview
```
Скачай .apk файл и установи на телефон.

## Структура
- `src/screens/auth/` — авторизация (телефон → вход/регистрация)
- `src/screens/courier/` — курьерский интерфейс (WebView)
- `src/screens/operator/` — операторский интерфейс (WebView)
- `src/screens/client/` — клиентский интерфейс (нативный, в разработке)
- `src/store/auth.ts` — состояние авторизации
- `src/utils/notifications.ts` — push уведомления
