import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Modal, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, font, radius, shadow, space, STATUS_META, type } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;
export type ApplianceIcon = 'ac' | 'washer' | 'fridge' | 'microwave' | 'wrench';
const APPLIANCE: Record<ApplianceIcon, keyof typeof MaterialCommunityIcons.glyphMap> = {
  ac: 'air-conditioner', washer: 'washing-machine', fridge: 'fridge-outline', microwave: 'microwave', wrench: 'wrench-outline',
};

// ───────────── Text ─────────────
type Variant = keyof typeof type;
export function T({ v = 'body', color = colors.text, style, children, numberOfLines, center, accessibilityRole, onPress }: { v?: Variant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; center?: boolean; accessibilityRole?: 'header' | 'text' | 'link' | 'button'; onPress?: () => void }) {
  return <RNText onPress={onPress} suppressHighlighting accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)} numberOfLines={numberOfLines} maxFontSizeMultiplier={1.4} style={[type[v], { color }, center && { textAlign: 'center' }, style]}>{children}</RNText>;
}

// ───────────── Layout ─────────────
export function Screen({ children, scroll = true, edges = ['top'], padded = true, bg = colors.bg, onRefresh, refreshing, footer, keyboard }: {
  children: ReactNode; scroll?: boolean; edges?: Edge[]; padded?: boolean; bg?: string; onRefresh?: () => void; refreshing?: boolean; footer?: ReactNode; keyboard?: boolean;
}) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={[padded && { padding: space(4) }, { paddingBottom: space(footer ? 6 : 10) }]} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.blue} /> : undefined}>
      {children}
    </ScrollView>
  ) : <View style={[{ flex: 1 }, padded && { padding: space(4) }]}>{children}</View>;
  const inner = keyboard ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{body}{footer}</KeyboardAvoidingView> : <>{body}{footer}</>;
  return <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg }}>{inner}</SafeAreaView>;
}

export function Header({ title, onBack, right, subtitle }: { title: string; onBack?: () => void; right?: ReactNode; subtitle?: string }) {
  return (
    <View style={s.header}>
      {onBack ? <IconButton icon="chevron-back" label="Go back" onPress={onBack} /> : <View style={{ width: 8 }} />}
      <View style={{ flex: 1, marginLeft: 4 }}>
        <T v="h2" color={colors.ink} numberOfLines={1} accessibilityRole="header">{title}</T>
        {subtitle ? <T v="small" color={colors.muted} numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function Row({ children, gap = 8, style, align = 'center', justify }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap, justifyContent: justify }, style]}>{children}</View>;
}
export const Gap = ({ h = 12 }: { h?: number }) => <View style={{ height: h }} />;
export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => <View style={[{ height: 1, backgroundColor: colors.line, marginVertical: space(3) }, style]} />;

export function Card({ children, style, onPress, accessibilityLabel, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string; padded?: boolean }) {
  const st = [s.card, padded && { padding: space(4) }, style];
  if (!onPress) return <View style={st}>{children}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [st, pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] }]}>{children}</Pressable>;
}

export function Section({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space(6) }, style]}>
      <Row justify="space-between" style={{ marginBottom: space(3) }}>
        <T v="h2" color={colors.ink} accessibilityRole="header">{title}</T>
        {action ? <Pressable hitSlop={10} onPress={onAction} accessibilityRole="button"><T v="small" color={colors.blue}>{action}</T></Pressable> : null}
      </Row>
      {children}
    </View>
  );
}

// ───────────── Buttons ─────────────
type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'success';
export function Button({ title, onPress, kind = 'primary', loading, disabled, icon, style, size = 'lg', full = true, accessibilityHint }: {
  title: string; onPress?: () => void; kind?: BtnKind; loading?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; size?: 'md' | 'lg' | 'sm'; full?: boolean; accessibilityHint?: string;
}) {
  const palette: Record<BtnKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.blue, fg: colors.white }, accent: { bg: colors.orange, fg: colors.white }, success: { bg: colors.success, fg: colors.white },
    secondary: { bg: colors.blueTint, fg: colors.blue }, ghost: { bg: 'transparent', fg: colors.blue, border: colors.line }, danger: { bg: colors.dangerTint, fg: colors.danger },
  };
  const p = palette[kind];
  const h = size === 'lg' ? 54 : size === 'md' ? 46 : 36;
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress}
      style={({ pressed }) => [{ height: h, borderRadius: radius.md, backgroundColor: p.bg, borderWidth: p.border ? 1 : 0, borderColor: p.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: size === 'sm' ? 12 : 18, alignSelf: full ? 'stretch' : 'flex-start' }, off && { opacity: 0.5 }, pressed && { opacity: 0.85 }, style]}>
      {loading ? <ActivityIndicator color={p.fg} /> : <>
        {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={p.fg} /> : null}
        <RNText style={{ fontFamily: font.bold, fontSize: size === 'sm' ? 13 : 16, color: p.fg }} maxFontSizeMultiplier={1.3}>{title}</RNText>
      </>}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, badge, color = colors.ink, bg = 'transparent' }: { icon: IconName; onPress?: () => void; label: string; badge?: number; color?: string; bg?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={color} />
      {badge ? <View style={s.badgeDot}><RNText style={{ color: colors.white, fontFamily: font.bold, fontSize: 10 }}>{badge > 9 ? '9+' : badge}</RNText></View> : null}
    </Pressable>
  );
}

export function Icon({ name, size = 20, color = colors.slate }: { name: IconName; size?: number; color?: string }) { return <Ionicons name={name} size={size} color={color} />; }
export function ApplianceGlyph({ kind, size = 30, color = colors.blue, bg = colors.blueTint, box = 56 }: { kind: string; size?: number; color?: string; bg?: string; box?: number }) {
  return <View style={{ width: box, height: box, borderRadius: box / 3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><MaterialCommunityIcons name={APPLIANCE[(kind as ApplianceIcon)] ?? APPLIANCE.wrench} size={size} color={color} /></View>;
}

// ───────────── Badges / chips ─────────────
export function Badge({ label, fg = colors.blue, bg = colors.blueTint, icon }: { label: string; fg?: string; bg?: string; icon?: IconName }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
    {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}<T v="tiny" color={fg}>{label.toUpperCase()}</T>
  </View>;
}
export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, fg: colors.slate, bg: colors.line };
  return <Badge label={m.label} fg={m.fg} bg={m.bg} />;
}
export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: active ? colors.blue : colors.line, backgroundColor: active ? colors.blueTint : colors.card }}>
    {icon ? <Ionicons name={icon} size={15} color={active ? colors.blue : colors.slate} /> : null}
    <T v="small" color={active ? colors.blue : colors.text}>{label}</T>
  </Pressable>;
}

// ───────────── Inputs ─────────────
export function Field({ label, error, hint, style, left, ...p }: TextInputProps & { label?: string; error?: string | null; hint?: string; left?: ReactNode }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ marginBottom: space(3) }, style as ViewStyle]}>
      {label ? <T v="small" color={colors.slate} style={{ marginBottom: 6 }}>{label}</T> : null}
      <View style={[s.input, focus && { borderColor: colors.blue }, !!error && { borderColor: colors.danger }]}>
        {left}
        <TextInput placeholderTextColor={colors.muted} accessibilityLabel={label} {...p} onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
          style={[{ flex: 1, fontFamily: font.medium, fontSize: 16, color: colors.ink, paddingVertical: 0, minHeight: 24, textAlignVertical: p.multiline ? 'top' : 'center' }, webNoOutline]} />
      </View>
      {error ? <T v="small" color={colors.danger} style={{ marginTop: 4 }}>{error}</T> : hint ? <T v="small" color={colors.muted} style={{ marginTop: 4 }}>{hint}</T> : null}
    </View>
  );
}

export function OtpInput({ value, onChange, length = 6, autoFocus = true, error }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean; error?: boolean }) {
  const ref = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="One time password" style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {Array.from({ length }).map((_, i) => {
        const filled = value[i]; const active = value.length === i;
        return <View key={i} style={{ width: 48, height: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: error ? colors.danger : active ? colors.blue : filled ? colors.navy : colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
          <RNText style={{ fontFamily: font.bold, fontSize: 22, color: colors.ink }}>{filled ?? ''}</RNText>
        </View>;
      })}
      <TextInput ref={ref} value={value} onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp"
        autoFocus={autoFocus} maxLength={length} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} accessibilityLabel="Enter OTP" />
    </Pressable>
  );
}

export function QtyStepper({ value, onChange, min = 0, max = 10, small }: { value: number; onChange: (n: number) => void; min?: number; max?: number; small?: boolean }) {
  const h = small ? 32 : 38;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.blue, borderRadius: radius.sm, height: h, backgroundColor: colors.blueTint }}>
      <Pressable accessibilityLabel="Decrease quantity" hitSlop={6} onPress={() => onChange(Math.max(min, value - 1))} style={{ width: h, alignItems: 'center' }}><Ionicons name={value <= 1 ? 'trash-outline' : 'remove'} size={16} color={colors.blue} /></Pressable>
      <T v="bodyStrong" color={colors.blue} style={{ minWidth: 18, textAlign: 'center' }}>{value}</T>
      <Pressable accessibilityLabel="Increase quantity" hitSlop={6} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} style={{ width: h, alignItems: 'center', opacity: value >= max ? 0.3 : 1 }}><Ionicons name="add" size={16} color={colors.blue} /></Pressable>
    </View>
  );
}

export function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}><T v="bodyStrong">{label}</T>{sub ? <T v="small" color={colors.muted}>{sub}</T> : null}</View>
      <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: value ? colors.blue : colors.line, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, ...shadow.card }} />
      </View>
    </Pressable>
  );
}

export function Radio({ selected, label, sub, onPress, right }: { selected: boolean; label: string; sub?: string; onPress: () => void; right?: ReactNode }) {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={[s.radio, selected && { borderColor: colors.blue, backgroundColor: '#F7F9FF' }]}>
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? colors.blue : colors.muted, alignItems: 'center', justifyContent: 'center' }}>{selected ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.blue }} /> : null}</View>
    <View style={{ flex: 1 }}><T v="bodyStrong">{label}</T>{sub ? <T v="small" color={colors.muted}>{sub}</T> : null}</View>
    {right}
  </Pressable>;
}

// ───────────── States ─────────────
export function Skeleton({ h = 16, w = '100%', r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => { const l = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(a, { toValue: 0.5, duration: 650, useNativeDriver: true })])); l.start(); return () => l.stop(); }, [a]);
  return <Animated.View accessibilityLabel="Loading" style={[{ height: h, width: w, borderRadius: r, backgroundColor: '#E6EBF4', opacity: a }, style]} />;
}
export function SkeletonList({ rows = 4, h = 84 }: { rows?: number; h?: number }) {
  return <View style={{ gap: 12 }}>{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={h} r={radius.lg} />)}</View>;
}
export function EmptyState({ icon = 'file-tray-outline', title, body, action, onAction }: { icon?: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  return <View style={{ alignItems: 'center', paddingVertical: space(12), paddingHorizontal: space(6) }}>
    <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.blueTint, alignItems: 'center', justifyContent: 'center', marginBottom: space(4) }}><Ionicons name={icon} size={34} color={colors.blue} /></View>
    <T v="h3" center color={colors.ink}>{title}</T>
    {body ? <T v="body" center color={colors.muted} style={{ marginTop: 6 }}>{body}</T> : null}
    {action ? <Button title={action} onPress={onAction} full={false} size="md" style={{ marginTop: space(5) }} /> : null}
  </View>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={{ alignItems: 'center', paddingVertical: space(10), paddingHorizontal: space(6) }}>
    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.dangerTint, alignItems: 'center', justifyContent: 'center', marginBottom: space(4) }}><Ionicons name="cloud-offline-outline" size={32} color={colors.danger} /></View>
    <T v="h3" center color={colors.ink}>Couldn’t load this</T>
    <T v="body" center color={colors.muted} style={{ marginTop: 6 }}>{message}</T>
    {onRetry ? <Button title="Retry" icon="refresh" onPress={onRetry} kind="secondary" full={false} size="md" style={{ marginTop: space(5) }} /> : null}
  </View>;
}
export function Banner({ tone = 'info', title, body, icon }: { tone?: 'info' | 'warn' | 'success' | 'danger'; title: string; body?: string; icon?: IconName }) {
  const t = { info: [colors.blue, colors.blueTint], warn: [colors.warning, colors.warningTint], success: [colors.success, colors.successTint], danger: [colors.danger, colors.dangerTint] }[tone];
  return <View style={{ flexDirection: 'row', gap: 10, padding: space(3), borderRadius: radius.md, backgroundColor: t[1] }} accessibilityRole="alert">
    <Ionicons name={icon ?? (tone === 'success' ? 'checkmark-circle' : tone === 'info' ? 'information-circle' : 'alert-circle')} size={20} color={t[0]} />
    <View style={{ flex: 1 }}><T v="bodyStrong" color={t[0]}>{title}</T>{body ? <T v="small" color={colors.text}>{body}</T> : null}</View>
  </View>;
}
export function Loading() { return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}><ActivityIndicator size="large" color={colors.blue} /></View>; }

// ───────────── Overlays ─────────────
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space(3) }} />
          {title ? <T v="h2" color={colors.ink} style={{ marginBottom: space(3) }}>{title}</T> : null}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>{children}</ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Confirm({ visible, title, body, confirm = 'Confirm', danger, onConfirm, onCancel, loading, children }: { visible: boolean; title: string; body?: string; confirm?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; loading?: boolean; children?: ReactNode }) {
  return <Sheet visible={visible} onClose={onCancel} title={title}>
    {body ? <T color={colors.slate}>{body}</T> : null}
    {children}
    <Gap h={20} />
    <Button title={confirm} kind={danger ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} />
    <Gap h={8} />
    <Button title="Go back" kind="ghost" onPress={onCancel} />
  </Sheet>;
}

// ───────────── Domain pieces ─────────────
export function PriceText({ price, mrp, starting, big }: { price: number; mrp?: number | null; starting?: boolean; big?: boolean }) {
  const f = (p: number) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
    {starting ? <T v="small" color={colors.muted}>Starting at</T> : null}
    <T v={big ? 'display' : 'price'} color={colors.ink}>{f(price)}</T>
    {mrp ? <T v="small" color={colors.muted} style={{ textDecorationLine: 'line-through' }}>{f(mrp)}</T> : null}
  </View>;
}

export function BillRow({ label, value, strong, color, sub }: { label: string; value: string; strong?: boolean; color?: string; sub?: string }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5 }}>
    <View style={{ flex: 1, paddingRight: 12 }}><T v={strong ? 'h3' : 'body'} color={color ?? (strong ? colors.ink : colors.slate)}>{label}</T>{sub ? <T v="small" color={colors.muted}>{sub}</T> : null}</View>
    <T v={strong ? 'h3' : 'bodyStrong'} color={color ?? colors.ink}>{value}</T>
  </View>;
}

export function Timeline({ steps }: { steps: { label: string; at?: string | null; done: boolean; current?: boolean }[] }) {
  return <View>
    {steps.map((st, i) => (
      <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ alignItems: 'center', width: 20 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: st.done ? colors.success : st.current ? colors.orange : colors.card, borderWidth: st.done || st.current ? 0 : 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            {st.done ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
          </View>
          {i < steps.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: st.done ? colors.success : colors.line }} /> : null}
        </View>
        <View style={{ flex: 1, paddingBottom: 16 }}>
          <T v={st.current ? 'bodyStrong' : 'body'} color={st.done || st.current ? colors.ink : colors.muted}>{st.label}</T>
          {st.at ? <T v="small" color={colors.muted}>{st.at}</T> : null}
        </View>
      </View>
    ))}
  </View>;
}

export function ListRow({ icon, title, sub, onPress, right, danger }: { icon?: IconName; title: string; sub?: string; onPress?: () => void; right?: ReactNode; danger?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }, pressed && { opacity: 0.6 }]}>
    {icon ? <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: danger ? colors.dangerTint : colors.blueTint, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={19} color={danger ? colors.danger : colors.blue} /></View> : null}
    <View style={{ flex: 1 }}><T v="bodyStrong" color={danger ? colors.danger : colors.ink}>{title}</T>{sub ? <T v="small" color={colors.muted}>{sub}</T> : null}</View>
    {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
  </Pressable>;
}

export function StickyFooter({ children }: { children: ReactNode }) {
  return <SafeAreaView edges={['bottom']} style={s.footer}>{children}</SafeAreaView>;
}

export function Toast({ message, onHide }: { message: string | null; onHide: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    Animated.timing(a, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(a, { toValue: 0, duration: 180, useNativeDriver: true }).start(onHide), 2600);
    return () => clearTimeout(t);
  }, [message, a, onHide]);
  if (!message) return null;
  return <Animated.View accessibilityLiveRegion="polite" pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }], backgroundColor: colors.navy, borderRadius: radius.md, padding: 14, ...shadow.raised }}>
    <T v="bodyStrong" color={colors.white}>{message}</T>
  </Animated.View>;
}

/** RN-web shows a browser focus ring inside our own focus border; hide it (the container shows focus). */
export const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, minHeight: 56, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: '#EEF1F7', ...shadow.card },
  input: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 13 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, marginBottom: 10 },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space(5), paddingBottom: space(6) },
  footer: { backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(3), ...shadow.raised },
  badgeDot: { position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
});
