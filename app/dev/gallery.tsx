import { Redirect, router } from 'expo-router';
import {
  BookOpen,
  CircleCheck,
  CircleDollarSign,
  KeyRound,
  Library,
  Link,
  Plus,
  Settings,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { DEMO_NOW_PLAYING, MiniPlayerView } from '@/features/player/mini-player';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { CoverImage } from '@/ui/cover-image';
import { EmptyState } from '@/ui/empty-state';
import { ErrorState } from '@/ui/error-state';
import { IconButton } from '@/ui/icon-button';
import { ListItem } from '@/ui/list-item';
import { ProgressRing } from '@/ui/progress-ring';
import { Screen } from '@/ui/screen';
import { SegmentedControl, type SegmentedOption } from '@/ui/segmented-control';
import { Sheet } from '@/ui/sheet';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { useTheme, type ThemeMode } from '@/ui/theme';
import { useToast } from '@/ui/toast';
import { space, typography, type TextVariant } from '@/ui/tokens';

const GALLERY_FRAME_HEIGHT = 360;
const GALLERY_COVER_WIDTH = 96;
const MODE_OPTIONS: readonly SegmentedOption<ThemeMode>[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];
const TEXT_VARIANTS = Object.keys(typography) as TextVariant[];

/** Dev-only visual QA page. Every primitive in every state. Redirects in release builds. */
export default function GalleryRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <Gallery />;
}

function Gallery() {
  const { mode, scheme, setMode } = useTheme();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [secretValue, setSecretValue] = useState('');

  return (
    <>
      <Screen title="Gallery">
        <Section title={`Theme (${scheme})`}>
          <SegmentedControl
            label="Theme mode"
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
          />
        </Section>

        <Section title="Typography">
          {TEXT_VARIANTS.map((variant) => (
            <Text key={variant} variant={variant}>
              {`${variant}: Night library`}
            </Text>
          ))}
        </Section>

        <Section title="Buttons">
          <Button label="Primary md" onPress={() => undefined} />
          <Button label="Primary lg" size="lg" onPress={() => undefined} icon={CircleCheck} />
          <Button label="Secondary" variant="secondary" onPress={() => undefined} />
          <Button label="Ghost" variant="ghost" onPress={() => undefined} />
          <Button label="Danger" variant="danger" onPress={() => undefined} />
          <Button label="Loading" loading onPress={() => undefined} />
          <Button label="Disabled" disabled onPress={() => undefined} />
          <Button
            label="Full width"
            fullWidth
            variant="secondary"
            onPress={() => setSheetOpen(true)}
          />
        </Section>

        <Section title="Icon buttons and cards">
          <View style={styles.inline}>
            <IconButton label="Library" icon={Library} onPress={() => undefined} />
            <IconButton
              label="Settings"
              icon={Settings}
              variant="surface"
              onPress={() => undefined}
            />
            <IconButton
              label="Disabled"
              icon={Settings}
              variant="surface"
              disabled
              onPress={() => undefined}
            />
          </View>
          <Card>
            <Text variant="bodyStrong">Surface card</Text>
          </Card>
          <Card raised accessibilityLabel="Raised pressable card" onPress={() => undefined}>
            <Text variant="bodyStrong">Raised, pressable card</Text>
          </Card>
        </Section>

        <Section title="Covers">
          <View style={styles.inline}>
            <CoverImage uri={null} title="The Night Harbour" style={styles.cover} />
            <CoverImage uri={null} title="夜の図書館" style={styles.cover} />
            <CoverImage uri={null} title="🎧 Listen" style={styles.cover} />
          </View>
        </Section>

        <Section title="Fields">
          <TextField
            label="Series name"
            helper="You can change this later."
            value=""
            onChangeText={() => undefined}
          />
          <TextField
            label="Email"
            error="Enter a valid address."
            value="not-an-email"
            onChangeText={() => undefined}
          />
          <TextField
            label="API key"
            secure
            value={secretValue}
            onChangeText={setSecretValue}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Locked"
            editable={false}
            value="Read only"
            onChangeText={() => undefined}
          />
        </Section>

        <Section title="List items">
          <Card style={styles.flush}>
            <ListItem title="API key" leading={KeyRound} />
            <ListItem
              title="Usage & costs"
              subtitle="This month, by model"
              leading={CircleDollarSign}
              onPress={() => undefined}
            />
          </Card>
        </Section>

        <Section title="Badges and progress">
          <View style={styles.inline}>
            <Badge label="Neutral" />
            <Badge label="Accent" tone="accent" />
            <Badge label="Success" tone="success" />
            <Badge label="Warning" tone="warning" />
            <Badge label="Danger" tone="danger" />
          </View>
          <View style={styles.inline}>
            <ProgressRing progress={0} label="Not started" />
            <ProgressRing progress={0.4} label="Narration" showValue size={56} strokeWidth={5} />
            <ProgressRing progress={1} label="Done" tone="success" />
            <ProgressRing progress={0.7} label="Failed" tone="danger" />
          </View>
        </Section>

        <Section title="Loading">
          <Skeleton height={16} width="60%" label="Loading series" />
          <Skeleton height={96} radius="lg" />
        </Section>

        <Section title="Empty state">
          <View style={styles.frame}>
            <EmptyState
              icon={Library}
              title="Your shelf is empty"
              description="Series hold your chapters."
              action={{ label: 'New series', onPress: () => undefined }}
            />
          </View>
        </Section>

        <Section title="Error state">
          <View style={styles.frame}>
            <ErrorState
              message="The link did not load. Check your connection and try again."
              onRetry={() => undefined}
            />
          </View>
        </Section>

        <Section title="Screens (fake data)">
          <Card style={styles.flush}>
            <ListItem
              title="Library"
              subtitle="Continue hero, series grid, sort"
              leading={Library}
              onPress={() => router.push('/dev/screens?screen=library')}
            />
            <ListItem
              title="Series"
              subtitle="Processing, failed and scanned chapters"
              leading={BookOpen}
              onPress={() => router.push('/dev/screens?screen=series')}
            />
            <ListItem
              title="Chapter"
              subtitle="Bilingual reading and ambience cues"
              leading={BookOpen}
              onPress={() => router.push('/dev/screens?screen=chapter')}
            />
            <ListItem
              title="Add chapter"
              subtitle="Link preview and cost estimate"
              leading={Link}
              onPress={() => router.push('/dev/screens?screen=add')}
            />
            <ListItem
              title="New series"
              subtitle="Cover picker and languages"
              leading={Plus}
              onPress={() => router.push('/dev/screens?screen=new')}
            />
          </Card>
        </Section>

        <Section title="Toast">
          <View style={styles.inline}>
            <Button
              label="Neutral toast"
              variant="secondary"
              onPress={() => toast.show({ message: 'Saved to your shelf' })}
            />
            <Button
              label="Danger toast"
              variant="danger"
              onPress={() => toast.show({ message: 'Could not save. Try again.', tone: 'danger' })}
            />
          </View>
        </Section>

        <Section title="Mini player">
          <MiniPlayerView nowPlaying={DEMO_NOW_PLAYING} />
        </Section>
      </Screen>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Sheet">
        <Text variant="body" tone="muted">
          Bottom sheet content. Swipe down or tap the backdrop to close.
        </Text>
      </Sheet>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="micro" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  inline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
  },
  cover: {
    width: GALLERY_COVER_WIDTH,
  },
  frame: {
    height: GALLERY_FRAME_HEIGHT,
  },
  flush: {
    padding: 0,
  },
});
