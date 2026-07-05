import { storage } from './utils/storage';

const PIN_KEY = 'azvio_quick_pin';

export const hasPin = async (): Promise<boolean> => {
  const pin = await storage.secureGet<string | null>(PIN_KEY, null);
  return !!pin;
};

export const setPin = async (pin: string): Promise<boolean> => {
  if (!/^\d{5}$/.test(pin)) return false;
  await storage.secureSet(PIN_KEY, pin);
  return true;
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  const stored = await storage.secureGet<string | null>(PIN_KEY, null);
  return !!stored && stored === pin;
};

export const clearPin = async (): Promise<void> => {
  await storage.secureRemove(PIN_KEY);
};
