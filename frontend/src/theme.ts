// AZVIO Light Theme — per /app/design_guidelines.json
export const lightColors = {
  surface: '#FFFFFF',
  onSurface: '#111111',
  surface2: '#F2F2F7',
  onSurface2: '#3A3A3C',
  surface3: '#E5E5EA',
  muted: '#8E8E93',
  inverse: '#1C1C1E',
  onInverse: '#FFFFFF',
  brand: '#3E9194',
  onBrand: '#FFFFFF',
  brandSoft: '#E4F1F2',
  brandDark: '#2E6B6E',
  brandInk: '#333A3D',
  success: '#34C759',
  warning: '#FFCC00',
  error: '#FF3B30',
  border: '#E5E5EA',
  borderStrong: '#C7C7CC',
  whatsapp: '#25D366',
  charcoal: '#414042', // لون الشريط القطري الثاني (طلب: هوية الشريط القطري المعتمدة)
};

export const darkColors: typeof lightColors = {
  surface: '#1C1C1E',
  onSurface: '#F2F2F7',
  surface2: '#2C2C2E',
  onSurface2: '#D1D1D6',
  surface3: '#3A3A3C',
  muted: '#9B9BA1',
  inverse: '#F2F2F7',
  onInverse: '#111111',
  brand: '#4FB3B6',
  onBrand: '#0B1F20',
  brandSoft: '#20393A',
  brandDark: '#7ED0D2',
  brandInk: '#E4F1F2',
  success: '#30D158',
  warning: '#FFD60A',
  error: '#FF453A',
  border: '#3A3A3C',
  borderStrong: '#54545A',
  whatsapp: '#25D366',
  charcoal: '#58585A',
};

// Default/legacy export — screens not yet migrated to useTheme() keep using
// this static light palette until they're converted.
export const C = lightColors;

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
