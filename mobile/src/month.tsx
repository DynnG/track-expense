import { createContext, useContext, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { localDate, monthLabel, shiftMonth } from '../../shared/finance';
import { Button, ui } from './ui';
const Context = createContext<{ month: string; setMonth: (month: string) => void }>(null!);
export const useMonth = () => useContext(Context);
export function MonthProvider({ children }: { children: ReactNode }) { const [month, setMonth] = useState(localDate().slice(0, 7)); return <Context.Provider value={{ month, setMonth }}>{children}</Context.Provider>; }
export function MonthPicker() {
  const { month, setMonth } = useMonth();
  return <View style={ui.row}><Button title="‹" accessibilityLabel="Previous month" secondary disabled={month <= '2000-01'} onPress={() => setMonth(shiftMonth(month, -1))} /><Text accessibilityLabel="Selected month" style={ui.heading}>{monthLabel(month)}</Text><Button title="›" accessibilityLabel="Next month" secondary disabled={month >= '2100-12'} onPress={() => setMonth(shiftMonth(month, 1))} /></View>;
}
