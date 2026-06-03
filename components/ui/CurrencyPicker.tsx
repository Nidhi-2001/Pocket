import { Pressable, ScrollView, Text, View } from 'react-native';
import { CURRENCY_LIST, type CurrencyCode } from '../../lib/currency';

interface CurrencyPickerProps {
  value: string;
  onChange: (code: CurrencyCode) => void;
}

/**
 * Horizontal scrolling picker of currency pills. Used on Setup and on
 * Profile (when editing).
 */
export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {CURRENCY_LIST.map((c) => {
        const selected = c.code === value;
        return (
          <Pressable
            key={c.code}
            onPress={() => onChange(c.code)}
            className={`px-3 py-2 rounded-xl border ${
              selected
                ? 'bg-primary border-primary'
                : 'bg-surface border-border active:opacity-80'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                selected ? 'text-white' : 'text-text-primary'
              }`}
            >
              {c.symbol} {c.code}
            </Text>
            <Text
              className={`text-[11px] ${
                selected ? 'text-white/80' : 'text-text-muted'
              }`}
            >
              {c.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
