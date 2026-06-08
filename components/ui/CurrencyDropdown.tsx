import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import {
  CURRENCY_LIST,
  getCurrency,
  type CurrencyCode,
} from '../../lib/currency';

interface CurrencyDropdownProps {
  value: string;
  onChange: (code: CurrencyCode) => void;
  /** Modal heading text. Default: "Select currency". */
  label?: string;
}

/**
 * Tap-to-open dropdown for picking a currency. Opens a centered modal
 * with the full list and a checkmark on the current selection.
 * Backdrop tap closes the modal without changing the value.
 */
export function CurrencyDropdown({
  value,
  onChange,
  label = 'Select currency',
}: CurrencyDropdownProps) {
  const [open, setOpen] = useState(false);
  const current = getCurrency(value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between bg-background border border-border rounded-xl px-4 py-3 active:opacity-80"
      >
        <View className="flex-row items-center gap-3 flex-1">
          <Text className="text-lg w-8 text-text-primary">
            {current.symbol}
          </Text>
          <View className="flex-1">
            <Text className="text-base font-medium text-text-primary">
              {current.code}
            </Text>
            <Text className="text-xs text-text-muted">{current.name}</Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={18} color="#6B7280" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          className="justify-center px-6"
        >
          <View
            className="bg-surface rounded-3xl overflow-hidden"
            style={{ maxHeight: '70%' }}
          >
            <View className="px-5 py-4 border-b border-border">
              <Text className="text-base font-semibold text-text-primary">
                {label}
              </Text>
            </View>
            <FlatList
              data={CURRENCY_LIST}
              keyExtractor={(c) => c.code}
              ItemSeparatorComponent={() => (
                <View className="h-px bg-border" />
              )}
              renderItem={({ item }) => {
                const selected = item.code === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.code);
                      setOpen(false);
                    }}
                    className={`flex-row items-center justify-between px-5 py-3 active:opacity-80 ${
                      selected ? 'bg-primary-light' : ''
                    }`}
                  >
                    <View className="flex-row items-center gap-3 flex-1">
                      <Text className="text-xl w-8">{item.symbol}</Text>
                      <View className="flex-1">
                        <Text
                          className={`text-base font-medium ${
                            selected ? 'text-primary' : 'text-text-primary'
                          }`}
                        >
                          {item.code}
                        </Text>
                        <Text className="text-xs text-text-muted">
                          {item.name}
                        </Text>
                      </View>
                    </View>
                    {selected && (
                      <Ionicons name="checkmark" size={20} color="#4F46E5" />
                    )}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
