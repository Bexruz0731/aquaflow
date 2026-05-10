import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { useAuthStore } from '../../store/auth'

type Step = 'phone' | 'register'

export default function AuthFlow() {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, register } = useAuthStore()

  const fullPhone = `998${phone.replace(/\D/g, '').replace(/^998/, '')}`

  const handleLogin = async () => {
    if (phone.replace(/\D/g, '').length < 9) {
      Alert.alert('', 'Telefon raqamni to\'liq kiriting')
      return
    }
    setLoading(true)
    try {
      await login(fullPhone)
    } catch (e: any) {
      if (e?.response?.status === 404) {
        // Not found — go to register
        setStep('register')
      } else {
        Alert.alert('Xatolik', e?.response?.data?.detail ?? 'Xatolik yuz berdi')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!firstName.trim()) { Alert.alert('', 'Ismingizni kiriting'); return }
    if (!address.trim()) { Alert.alert('', 'Manzilingizni kiriting'); return }
    setLoading(true)
    try {
      await register(fullPhone, firstName.trim(), lastName.trim() || null, address.trim())
    } catch (e: any) {
      Alert.alert('Xatolik', e?.response?.data?.detail ?? 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>💧</Text>
        <Text style={styles.appName}>AkoWater</Text>

        {step === 'phone' && (
          <>
            <Text style={styles.subtitle}>Telefon raqamingizni kiriting</Text>
            <View style={styles.inputRow}>
              <Text style={styles.prefix}>+998</Text>
              <TextInput
                style={styles.input}
                placeholder="90 123 45 67"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                autoFocus
                maxLength={12}
                onSubmitEditing={handleLogin}
              />
            </View>
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Kirish</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === 'register' && (
          <>
            <Text style={styles.subtitle}>
              Siz yangi foydalanuvchisiz.{'\n'}Ma'lumotlaringizni kiriting.
            </Text>

            <Text style={styles.label}>Ism *</Text>
            <TextInput
              style={styles.field}
              placeholder="Ismingiz"
              value={firstName}
              onChangeText={setFirstName}
              autoFocus
            />

            <Text style={styles.label}>Familiya</Text>
            <TextInput
              style={styles.field}
              placeholder="Familiyangiz (ixtiyoriy)"
              value={lastName}
              onChangeText={setLastName}
            />

            <Text style={styles.label}>Manzil *</Text>
            <TextInput
              style={[styles.field, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder="Ko'cha, uy raqami, mo'ljal..."
              value={address}
              onChangeText={setAddress}
              multiline
            />

            <Text style={styles.phoneDisplay}>📱 +{fullPhone}</Text>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Ro'yxatdan o'tish</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setStep('phone'); setFirstName(''); setLastName(''); setAddress('') }}
            >
              <Text style={styles.backText}>← Orqaga</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 28, paddingTop: 100, minHeight: '100%' },
  logo: { fontSize: 56, textAlign: 'center', marginBottom: 8 },
  appName: { fontSize: 30, fontWeight: '700', textAlign: 'center', color: '#0f0f23', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 16, height: 54, marginBottom: 16,
  },
  prefix: { fontSize: 18, color: '#374151', marginRight: 8, fontWeight: '500' },
  input: { flex: 1, fontSize: 20, color: '#111827', letterSpacing: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  field: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 16, height: 52, fontSize: 16, color: '#111827',
  },
  phoneDisplay: { fontSize: 14, color: '#6b7280', marginTop: 16, marginBottom: 4 },
  btn: {
    backgroundColor: '#0f0f23', borderRadius: 12,
    height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  backBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 10 },
  backText: { color: '#6b7280', fontSize: 14 },
})
