import React, { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useAuthStore } from '../store/auth'
import AuthFlow from '../screens/auth/AuthFlow'
import CourierApp from '../screens/courier/CourierApp'
import OperatorApp from '../screens/operator/OperatorApp'
import ClientApp from '../screens/client/ClientApp'
import DualRoleApp from '../screens/DualRoleApp'
import { registerForPushNotifications } from '../utils/notifications'

export default function RootNavigator() {
  const { isLoading, isAuthenticated, role, secondaryRole, init, saveFcmToken } = useAuthStore()

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotifications().then(token => {
        if (token) saveFcmToken(token)
      })
    }
  }, [isAuthenticated])

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#0f0f23" />
      </View>
    )
  }

  if (!isAuthenticated) return <AuthFlow />

  // Dual role: courier + operator
  const isCourier = role === 'courier' || secondaryRole === 'courier'
  const isOperator = role === 'operator' || role === 'boshliq' || role === 'super_admin'

  if (isCourier && isOperator) return <DualRoleApp />
  if (isCourier) return <CourierApp />
  if (isOperator) return <OperatorApp />
  return <ClientApp />
}
