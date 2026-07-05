import { storage } from './utils/storage';

const KEY = 'azvio_onboarding_seen';

export const hasSeenOnboarding = async (): Promise<boolean> => {
  const v = await storage.getItem<boolean>(KEY, false);
  return !!v;
};

export const markOnboardingSeen = async (): Promise<void> => {
  await storage.setItem(KEY, true);
};
