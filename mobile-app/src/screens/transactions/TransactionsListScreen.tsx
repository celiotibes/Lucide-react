/**
 * Transactions List Screen
 * Display list of transactions
 * TODO: Implement transaction list and filtering
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export const TransactionsListScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Transactions</Text>
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
