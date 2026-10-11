import { Stack } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/ui/button';
import { CoverImage } from '@/ui/cover-image';
import { Screen } from '@/ui/screen';
import { TextField } from '@/ui/text-field';

export default function NewSeriesScreen() {
  const [name, setName] = useState('');

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'New series', presentation: 'modal' }} />
      <Screen edges={['bottom']}>
        <CoverImage uri={null} title={name || 'New series'} />
        <TextField
          label="Series name"
          helper="You can change this later."
          value={name}
          onChangeText={setName}
          returnKeyType="done"
          maxLength={80}
        />
        <Button label="Create series" onPress={() => undefined} disabled={name.trim() === ''} />
      </Screen>
    </>
  );
}
