import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
export const colors = { background: '#edf1f7', card: '#f9fbff', ink: '#24324b', muted: '#68778f', primary: '#4164ed', line: '#dce3ed', danger: '#b53049', green: '#24806b' };
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 100, gap: 16 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 28, letterSpacing: -0.8 }, subtitle: { color: colors.muted, lineHeight: 22, fontSize: 14 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: '#fff', borderRadius: 22, padding: 20, gap: 10, boxShadow: '0px 6px 18px rgba(70,88,125,0.07)' },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '700' }, number: { fontSize: 28, fontWeight: '800', color: colors.ink }, label: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, grow: { flex: 1 }, input: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14, minHeight: 50, fontSize: 16, color: colors.ink },
  button: { minHeight: 50, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, lineHeight: 21 }, progress: { height: 8, backgroundColor: '#e1e7f2', borderRadius: 10, overflow: 'hidden' }, divider: { height: 1, backgroundColor: colors.line },
});
export function Card({ children }: { children: ReactNode }) { return <View style={ui.card}>{children}</View>; }
export function Button({ title, onPress, disabled, secondary, danger, accessibilityLabel }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.button, secondary && { backgroundColor: '#e3e9f7' }, danger && { backgroundColor: colors.danger }, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}><Text style={[ui.buttonText, secondary && { color: colors.primary }]}>{title}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) { return <View style={{ gap: 7 }}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#93a0b4" style={ui.input} {...props} /></View>; }
export function Busy() { return <View accessibilityLabel="Loading" style={{ padding: 32 }}><ActivityIndicator size="large" color={colors.primary} /></View>; }
export function Failure({ message, retry }: { message: string; retry?: () => void }) { return <Card><Text accessibilityRole="alert" style={ui.error}>{message}</Text>{retry && <Button title="Try again" onPress={retry} />}</Card>; }
export function Empty({ title, text }: { title: string; text: string }) { return <Card><Text style={ui.heading}>{title}</Text><Text style={ui.subtitle}>{text}</Text></Card>; }
