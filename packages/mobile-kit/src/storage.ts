import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Tokens live in the OS keychain/keystore on device; localStorage on web (dev/preview only). */
export const secure = {
  async get(key: string) {
    if (Platform.OS === 'web') { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') { try { globalThis.localStorage?.setItem(key, value); } catch { /* ignore */ } return; }
    await SecureStore.setItemAsync(key, value);
  },
  async del(key: string) {
    if (Platform.OS === 'web') { try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ } return; }
    await SecureStore.deleteItemAsync(key);
  },
};
