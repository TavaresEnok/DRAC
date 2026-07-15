import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_API_URL, SESSION_KEY } from '../config';
import type { Session } from '../types';

const BIOMETRIC_LOGIN_KEY = `${SESSION_KEY}.biometric`;

export function cleanApiUrl(value: string) {
  const next = value.trim().replace(/\/+$/, '');
  if (!next) return DEFAULT_API_URL;
  return next;
}

export async function loadStoredSession() {
  const secureRaw = await SecureStore.getItemAsync(SESSION_KEY);
  if (secureRaw) return secureRaw;

  const legacyRaw = await AsyncStorage.getItem(SESSION_KEY);
  if (legacyRaw) {
    await SecureStore.setItemAsync(SESSION_KEY, legacyRaw);
    await AsyncStorage.removeItem(SESSION_KEY);
  }
  return legacyRaw;
}

export async function saveStoredSession(session: Session) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function clearStoredSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function isBiometricLoginEnabled() {
  return (await SecureStore.getItemAsync(BIOMETRIC_LOGIN_KEY)) === 'true';
}

export async function setBiometricLoginEnabled(enabled: boolean) {
  if (enabled) await SecureStore.setItemAsync(BIOMETRIC_LOGIN_KEY, 'true');
  else await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_KEY);
}
