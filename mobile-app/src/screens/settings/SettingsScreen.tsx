/**
 * Settings Screen
 * User settings and preferences
 * TODO: Implement settings UI
 */

import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useAuth } from '@/hooks';

export const SettingsScreen: React.FC = () => {
  const { user, logout } = useAuth();

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout]);

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Settings</Text>
      {user && <Text variant="bodyMedium">Logged in as: {user.email}</Text>}
      <Button mode="contained" onPress={handleLogout} style={styles.logoutButton}>
        Logout
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButton: {
    marginTop: 16,
  },
});
