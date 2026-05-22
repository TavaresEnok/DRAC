import { Platform, StatusBar as NativeStatusBar } from 'react-native';

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ?? '';
export const SESSION_KEY = 'drac.mobile.session.v1';
export const TOP_SAFE = Platform.OS === 'android' ? Math.max(NativeStatusBar.currentHeight ?? 24, 28) : 0;
export const BOTTOM_SAFE = Platform.OS === 'android' ? 48 : 0;
