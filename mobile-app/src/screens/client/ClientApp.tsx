import React, { useRef } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

const CLIENT_URL = (Constants.expoConfig?.extra?.API_URL?.replace('/api/v1', '') ?? 'http://localhost') + '/client'

export default function ClientApp() {
  const webviewRef = useRef<any>(null)

  const injectToken = async () => {
    const token = await SecureStore.getItemAsync('access_token')
    const refresh = await SecureStore.getItemAsync('refresh_token')
    if (token && webviewRef.current) {
      webviewRef.current.injectJavaScript(`
        localStorage.setItem('access_token', '${token}');
        localStorage.setItem('refresh_token', '${refresh ?? ''}');
        window.location.reload();
        true;
      `)
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: CLIENT_URL }}
        style={styles.webview}
        onLoad={injectToken}
        javaScriptEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#0f0f23" />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
})
