/**
 * MyRepairUnder100 design tokens.
 * Primary: deep service-blue/navy (trust). Accent: the logo's orange (energy, offers, highlights).
 * CTA blue on white = 7.0:1 contrast; navy on white = 14:1 (WCAG AA/AAA).
 */
export const colors = {
  navy: '#0B2559',
  navy2: '#13306E',
  blue: '#1747D6',
  blueDark: '#0F37AD',
  blueTint: '#EAF0FF',
  orange: '#F25A0C',
  orangeDark: '#C2440A',
  orangeTint: '#FFF1E8',
  ink: '#0F172A',
  text: '#1E293B',
  slate: '#475569',
  muted: '#64748B',
  line: '#E4E9F2',
  bg: '#F5F7FB',
  card: '#FFFFFF',
  success: '#0E8A4F',
  successTint: '#E7F6EE',
  danger: '#C62828',
  dangerTint: '#FDECEC',
  warning: '#A15C00',
  warningTint: '#FFF5E0',
  white: '#FFFFFF',
  overlay: 'rgba(11,37,89,0.45)',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const space = (n: number) => n * 4;

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  h1: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  h2: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  h3: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.3 },
  price: { fontFamily: font.extrabold, fontSize: 18, lineHeight: 22 },
} as const;

export const shadow = {
  card: { shadowColor: '#0B2559', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  raised: { shadowColor: '#0B2559', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
} as const;

export const STATUS_META: Record<string, { label: string; fg: string; bg: string }> = {
  PENDING: { label: 'Awaiting payment', fg: colors.warning, bg: colors.warningTint },
  CONFIRMED: { label: 'Confirmed', fg: colors.blue, bg: colors.blueTint },
  TECHNICIAN_ASSIGNED: { label: 'Technician assigned', fg: colors.blue, bg: colors.blueTint },
  TECHNICIAN_ON_THE_WAY: { label: 'On the way', fg: colors.orangeDark, bg: colors.orangeTint },
  TECHNICIAN_ARRIVED: { label: 'Technician arrived', fg: colors.orangeDark, bg: colors.orangeTint },
  SERVICE_STARTED: { label: 'Service started', fg: colors.orangeDark, bg: colors.orangeTint },
  SERVICE_COMPLETED: { label: 'Service completed', fg: colors.success, bg: colors.successTint },
  PAYMENT_PENDING: { label: 'Payment pending', fg: colors.warning, bg: colors.warningTint },
  COMPLETED: { label: 'Completed', fg: colors.success, bg: colors.successTint },
  CANCELLED: { label: 'Cancelled', fg: colors.danger, bg: colors.dangerTint },
};
