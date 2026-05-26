import { Text, View } from 'react-native';
import { categories, type CategoryKey } from '../../constants/theme';

interface CategoryBadgeProps {
  category: CategoryKey;
  size?: 'sm' | 'md';
}

export function CategoryBadge({ category, size = 'sm' }: CategoryBadgeProps) {
  const meta = categories[category];
  const padding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5';
  const fontSize = size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <View
      className={`flex-row items-center gap-1 rounded-md ${padding}`}
      style={{ backgroundColor: meta.color + '22' }}
    >
      <Text className={fontSize}>{meta.emoji}</Text>
      <Text
        className={`font-medium ${fontSize}`}
        style={{ color: meta.color }}
      >
        {category}
      </Text>
    </View>
  );
}
