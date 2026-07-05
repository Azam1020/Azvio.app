import * as LocalAuthentication from 'expo-local-authentication';
import { storage } from './utils/storage';

const KEY = 'azvio_biometric_enabled';

export const isBiometricEnabled = async (): Promise<boolean> => {
  const v = await storage.getItem<boolean>(KEY, false);
  return !!v;
};

export const setBiometricEnabled = async (enabled: boolean): Promise<void> => {
  await storage.setItem(KEY, enabled);
};

export const isBiometricAvailable = async (): Promise<boolean> => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
};

export const authenticateWithBiometrics = async (): Promise<boolean> => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'فتح AZVIO',
      cancelLabel: 'إلغاء',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
};
