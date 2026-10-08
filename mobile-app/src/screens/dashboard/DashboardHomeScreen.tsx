/**
 * Dashboard Home Screen
 * Main dashboard view with statistics and recent items
 * TODO: Implement dashboard layout
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export const DashboardHomeScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Dashboard</Text>
      <Text variant="bodyMedium">Coming soon...</Text>
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
});
