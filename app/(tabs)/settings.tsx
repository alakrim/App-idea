import { CircleDollarSign, KeyRound, Languages, Mic, Palette, Wind } from 'lucide-react-native';

import { Card } from '@/ui/card';
import { ListItem } from '@/ui/list-item';
import { Screen } from '@/ui/screen';

const ROWS = [
  { title: 'API key', icon: KeyRound },
  { title: 'Narration', icon: Mic },
  { title: 'Translation', icon: Languages },
  { title: 'Ambience', icon: Wind },
  { title: 'Appearance', icon: Palette },
  { title: 'Usage & costs', icon: CircleDollarSign },
] as const;

export default function SettingsScreen() {
  return (
    <Screen title="Settings">
      <Card style={{ padding: 0 }}>
        {ROWS.map((row) => (
          <ListItem key={row.title} title={row.title} leading={row.icon} />
        ))}
      </Card>
    </Screen>
  );
}
