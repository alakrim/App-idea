import { Tabs } from 'expo-router/js-tabs';
import { BookA, Library, MessagesSquare, Settings } from 'lucide-react-native';
import { View } from 'react-native';

import { MiniPlayer } from '@/features/player/mini-player';
import { TabBar } from '@/ui/tab-bar';
import { iconSize, iconStrokeWidth, transparent } from '@/ui/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <View>
          <MiniPlayer nowPlaying={null} />
          <TabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <Library
              size={iconSize.md}
              strokeWidth={iconStrokeWidth}
              color={color}
              fill={focused ? color : transparent}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask',
          tabBarIcon: ({ color }) => (
            <MessagesSquare size={iconSize.md} strokeWidth={iconStrokeWidth} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="vocab"
        options={{
          title: 'Vocab',
          tabBarIcon: ({ color }) => (
            <BookA size={iconSize.md} strokeWidth={iconStrokeWidth} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Settings size={iconSize.md} strokeWidth={iconStrokeWidth} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
