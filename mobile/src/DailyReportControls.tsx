import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { localDate } from '../../shared/finance';
import { reportDayLabel, shiftReportDay, validReportDay } from '../../shared/reportDate';
import { Button, colors, Field, ui } from './ui';

// A null selection follows today's Manila date, including after midnight/resume.
export function useReportDay() {
  const [today, setToday] = useState(localDate);
  const [selection, setSelection] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { setToday(localDate()); }, []));
  useEffect(() => {
    const refresh = () => setToday(localDate());
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const nextMidnight = new Date(today + 'T00:00:00+08:00').getTime() + 86400000;
    const timer = setTimeout(refresh, Math.max(1000, nextMidnight - Date.now() + 500));
    return () => { subscription.remove(); clearTimeout(timer); };
  }, [today]);
  function select(day: string) { if (validReportDay(day) && day <= today) setSelection(day === today ? null : day); }
  return { today, day: selection ?? today, select };
}

export function DailyReportControls({ day, today, select }: { day: string; today: string; select: (value: string) => void }) {
  const [picker, setPicker] = useState(false);
  const yesterday = shiftReportDay(today, -1);
  return <View style={{ gap: 12 }}><View style={ui.row}>{[{ label: 'Today', value: today }, { label: 'Yesterday', value: yesterday }].map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityState={{ selected: day === item.value }} onPress={() => select(item.value)} style={[ui.button, { flex: 1, backgroundColor: day === item.value ? colors.primary : '#e3e9f7' }]}><Text style={[ui.buttonText, { color: day === item.value ? '#fff' : colors.primary }]}>{item.label}</Text></Pressable>)}</View><View style={ui.row}><Button title="‹" accessibilityLabel="Previous day" secondary disabled={day <= '2000-01-01'} onPress={() => select(shiftReportDay(day, -1))} /><View style={{ flex: 1, minWidth: 150 }}>{Platform.OS === 'web' ? <Field label="Report date (YYYY-MM-DD)" value={day} maxLength={10} onChangeText={select} /> : <Button title={reportDayLabel(day)} accessibilityLabel={`Choose report date, ${reportDayLabel(day)}`} secondary onPress={() => setPicker(true)} />}</View><Button title="›" accessibilityLabel="Next day" secondary disabled={day >= today} onPress={() => select(shiftReportDay(day, 1))} /></View><Text style={ui.label}>Dates follow Philippine time · Tap a transaction to edit it</Text>{picker && <DateTimePicker value={new Date(day + 'T12:00:00')} mode="date" minimumDate={new Date(2000, 0, 1)} maximumDate={new Date(today + 'T23:59:59')} onChange={(_event, selected) => { setPicker(false); if (selected) select(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`); }} />}</View>;
}
