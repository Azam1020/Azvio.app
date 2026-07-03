import { Linking } from 'react-native';

export const SERVICE_OPTIONS = [
  { key: 'drone', label: 'درون' },
  { key: 'editing', label: 'مونتاج' },
  { key: 'both', label: 'كلاهما' },
];

export const SERVICE_LABELS: Record<string, string> = {
  drone: 'درون',
  editing: 'مونتاج',
  both: 'درون + مونتاج',
};

export function openWhatsApp(phone: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return;
  const intl = digits.startsWith('0') ? `966${digits.slice(1)}` : digits;
  Linking.openURL(`https://wa.me/${intl}`);
}
