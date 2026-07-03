import { Linking } from 'react-native';
import { api } from './api';

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

export type Category = {
  id: string;
  name: string;
  service_type: string;
  description?: string;
  source?: string;
};

export function openWhatsApp(phone: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return;
  const intl = digits.startsWith('0') ? `966${digits.slice(1)}` : digits;
  Linking.openURL(`https://wa.me/${intl}`);
}

// Categories API helpers
export const listCategories = (service_type?: string): Promise<Category[]> =>
  api(`/categories${service_type ? `?service_type=${encodeURIComponent(service_type)}` : ''}`);

export const createCategory = (data: { name: string; service_type: string; description?: string }) =>
  api('/categories', { method: 'POST', body: JSON.stringify({ ...data, source: 'manual' }) });

export const deleteCategory = (id: string) => api(`/categories/${id}`, { method: 'DELETE' });

// Sanad helpers
export const priceOpinion = (data: { service_type: string; sub_category: string; agreed_price: number; client_name?: string }) =>
  api('/sanad/price-opinion', { method: 'POST', body: JSON.stringify(data) });

export const suggestCategories = (data: { service_type: string; hint?: string }) =>
  api('/sanad/suggest-categories', { method: 'POST', body: JSON.stringify(data) });

export const suggestContent = (data: { topic?: string; count?: number }) =>
  api('/sanad/suggest-content', { method: 'POST', body: JSON.stringify(data) });

export const suggestServices = (data: { service_type: string }) =>
  api('/sanad/suggest-services', { method: 'POST', body: JSON.stringify(data) });
