import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useAuthStore } from '../store/auth'
import CourierApp from './courier/CourierApp'
import OperatorApp from './operator/OperatorApp'

export default function DualRoleApp() {
  const { activeMode, switchMode, firstName } = useAuthStore()

  return (
    <View style={{ flex: 1 }}>
      {activeMode === 'courier' ? <CourierApp /> : <OperatorApp />}

      {/* Floating mode switcher */}
      <TouchableOpacity style={styles.fab} onPress={switchMode}>
        <Text style={styles.fabIcon}>{activeMode === 'courier' ? '🖥' : '🚚'}</Text>
        <Text style={styles.fabText}>
          {activeMode === 'courier' ? 'Operator' : 'Kuryer'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    backgroundColor: '#0f0f23',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { fontSize: 18 },
  fabText: { color: '#fff', fontWeight: '600', fontSize: 14 },
})
