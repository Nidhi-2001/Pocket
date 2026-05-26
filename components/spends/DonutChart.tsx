import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}

/**
 * Pure-SVG donut chart. Each segment is a Circle with a stroke-dasharray
 * cropping it to its share of the circumference, and stroke-dashoffset
 * rotating it to start where the previous segment left off. -90deg rotation
 * makes 12 o'clock the starting point.
 */
export function DonutChart({
  segments,
  size = 220,
  strokeWidth = 30,
  centerLabel,
  centerSubLabel,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let cumulativeFraction = 0;

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size}>
        {/* Background ring */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Segments */}
        {total > 0 &&
          segments.map((seg, i) => {
            const fraction = seg.value / total;
            const length = fraction * circumference;
            const offset = -cumulativeFraction * circumference;
            cumulativeFraction += fraction;
            return (
              <Circle
                key={`${seg.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                fill="none"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
      </Svg>

      {/* Center label sits on top via absolute positioning */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        pointerEvents="none"
      >
        {centerSubLabel && (
          <Text className="text-xs text-text-muted uppercase mb-1 tracking-wider">
            {centerSubLabel}
          </Text>
        )}
        {centerLabel && (
          <Text className="text-2xl font-bold text-text-primary">
            {centerLabel}
          </Text>
        )}
      </View>
    </View>
  );
}
