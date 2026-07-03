// AZVIO Light Theme — per /app/design_guidelines.json
export const C = {
  surface: '#FFFFFF',
  onSurface: '#111111',
  surface2: '#F2F2F7',
  onSurface2: '#3A3A3C',
  surface3: '#E5E5EA',
  muted: '#8E8E93',
  inverse: '#1C1C1E',
  onInverse: '#FFFFFF',
  brand: '#D95D39',
  onBrand: '#FFFFFF',
  brandSoft: '#FDECE8',
  success: '#34C759',
  warning: '#FFCC00',
  error: '#FF3B30',
  border: '#E5E5EA',
  borderStrong: '#C7C7CC',
  whatsapp: '#25D366',
};

export const F = {
  regular: 'Cairo-Regular',
  semibold: 'Cairo-SemiBold',
  bold: 'Cairo-Bold',
};

export const R = { sm: 6, md: 12, lg: 20, pill: 999 };

export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

export const fmt = (n: number) =>
  `${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ر.س`;
