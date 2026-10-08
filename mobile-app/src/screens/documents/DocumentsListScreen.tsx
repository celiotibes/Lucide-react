/**
 * Documents List Screen
 * Display list of documents
 * TODO: Implement document list and filtering
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

export const DocumentsListScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Documents</Text>
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
