import { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'AkoWater',
  slug: 'akowater',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#0052A5',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0052A5',
    },
    package: 'uz.akowater.app',
    permissions: ['RECEIVE_BOOT_COMPLETED', 'VIBRATE'],
  },
  ios: {
    bundleIdentifier: 'uz.akowater.app',
    supportsTablet: false,
  },
  plugins: [
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#0052A5' }],
    'expo-secure-store',
  ],
  scheme: 'akowater',
  extra: {
    API_URL: 'https://akowater.duckdns.org/api/v1',
    TENANT_ID: '0f92d89b-e7e7-411c-8c89-b5dd801bbe6a',
    eas: {
      projectId: 'de365980-a0d6-4884-bb13-9109e01ddbc9',
    },
  },
}

export default config
