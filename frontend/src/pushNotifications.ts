import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from './api';

let alreadyRegistered = false;

/**
 * Requests notification permission and registers the Expo push token with
 * the backend. Real push notifications — they arrive even if the app is
 * closed, because Expo's push service (not our backend) holds the
 * connection to Apple/Google. Safe to call more than once; it no-ops after
 * the first successful registration for this app session.
 */
export async function registerForPushNotifications() {
  if (alreadyRegistered || Platform.OS === 'web') return;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    await api('/notifications/register-token', {
      method: 'POST',
      body: JSON.stringify({ push_token: tokenResponse.data }),
    });
    alreadyRegistered = true;
  } catch {
    // Non-fatal: the app works fine without push, just without reminders.
  }
}
