import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as SplashScreen from 'expo-splash-screen';
import { getDatabase } from '@/lib/db';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize database
        await getDatabase();

        // Check auth state
        const {
          data: { session },
        } = await supabase.auth.getSession();

        setIsSignedIn(!!session);
        setIsReady(true);
      } catch (e) {
        console.warn(e);
        setIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <Stack>
      {isSignedIn ? (
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
      ) : (
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
          }}
        />
      )}
    </Stack>
  );
}
