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
  bottomLabel?: string;
}

/**
 * Pure-SVG donut chart. Each segment is a Circle with stroke-dasharray
 * cropped to its share of the circumference, and stroke-dashoffset
 * rotating it to start where the previous segment left off.
 *
 * Small visible gaps between segments (when there's more than one) make
 * the chart read as distinct slices rather than a continuous ring.
 */
export function DonutChart({
  segments,
  size = 260,
  strokeWidth = 24,
  centerLabel,
  centerSubLabel,
  bottomLabel,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const GAP = 4; // visual gap between segments, in pixels
  const useGap = total > 0 && segments.length > 1;

  let cumulativeFraction = 0;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size}>
        {/* Background ring — soft grey */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#F3F4F6"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Foreground segments */}
        {total > 0 &&
          segments.map((seg, i) => {
            const fraction = seg.value / total;
            const fullLen = fraction * circumference;
            // Apply gap only if segment can absorb it without disappearing
            const length =
              useGap && fullLen > GAP * 2 ? fullLen - GAP : fullLen;
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

      {/* Center labels — absolutely positioned on top */}
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
          <Text className="text-[10px] text-text-muted uppercase mb-1 tracking-[2px] font-semibold">
            {centerSubLabel}
          </Text>
        )}
        {centerLabel && (
          <Text className="text-3xl font-bold text-text-primary">
            {centerLabel}
          </Text>
        )}
        {bottomLabel && (
          <Text className="text-xs text-text-secondary mt-1">
            {bottomLabel}
          </Text>
        )}
      </View>
    </View>
  );
}
