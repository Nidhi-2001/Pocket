import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors, gradients, shadows } from '../../constants/theme';
import { GlassView } from '../../components/ui/GlassView';
import { useThemeColors } from '../../hooks/useThemeColors';

export default function TabsLayout() {
  const c = useThemeColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: c.textMuted,
        // Floating frosted-glass bar — the screen's ScreenBackground shows
        // through it. Screens add bottom padding so content clears it.
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: 72,
          paddingBottom: 12,
          paddingTop: 10,
          elevation: 0,
        },
        tabBarBackground: () => (
          <GlassView blur={24} style={{ flex: 1, borderWidth: 0, borderTopWidth: 1 }} />
        ),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="spends"
        options={{
          title: 'Spends',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: '',
          // Raised circular center action button that opens the Assistant.
          tabBarButton: (props) => (
            <Pressable
              onPress={props.onPress}
              accessibilityRole="button"
              accessibilityLabel="Assistant"
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start' }}
            >
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  {
                    marginTop: -24,
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 4,
                    borderColor: c.surface,
                  },
                  shadows.brand,
                ]}
              >
                <Ionicons name="sparkles" size={26} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'flag' : 'flag-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
