/**
 * Setup Wizard Screen
 * First screen for users to configure the API endpoint
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Button, TextInput, Text, ActivityIndicator, Card } from 'react-native-paper';
import { useAuth } from '@/hooks';
import { validateUrl } from '@/utils/validation';
import { apiClient } from '@/api';
import type { AuthStackScreenProps } from '@/types';

type Props = AuthStackScreenProps<'SetupWizard'>;

export const SetupWizardScreen: React.FC<Props> = ({ navigation }) => {
  const { setApiEndpoint } = useAuth();
  const [endpoint, setEndpoint] = useState('http://localhost:8000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTestConnection = useCallback(async () => {
    setError(null);

    if (!endpoint.trim()) {
      setError('Please enter an API endpoint');
      return;
    }

    if (!validateUrl(endpoint)) {
      setError('Invalid URL format. Use http://... or https://...');
      return;
    }

    setLoading(true);
    try {
      // Test connection to the API
      const tempClient = new (apiClient.constructor as any)({ baseURL: endpoint });
      const connected = await tempClient.testConnection();

      if (!connected) {
        throw new Error('Unable to connect to API endpoint');
      }

      // Save the endpoint and proceed to login
      setApiEndpoint(endpoint);
      navigation.replace('Login');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to connect to API endpoint. Please check the URL and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint, setApiEndpoint, navigation]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text variant="headlineLarge" style={styles.title}>
          CRMT Mobile
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Configure Your API Endpoint
        </Text>
      </View>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="bodyMedium" style={styles.description}>
            Enter the address of your CRMT desktop application API endpoint. This is typically
            something like: http://192.168.1.100:8000 or https://crmt.example.com
          </Text>

          <TextInput
            label="API Endpoint URL"
            value={endpoint}
            onChangeText={setEndpoint}
            placeholder="http://localhost:8000"
            mode="outlined"
            style={styles.input}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleTestConnection}
            loading={loading}
            disabled={loading || !endpoint.trim()}
            style={styles.button}
          >
            {loading ? 'Testing Connection...' : 'Test Connection & Continue'}
          </Button>

          <View style={styles.infoContainer}>
            <Text variant="labelSmall" style={styles.infoText}>
              Make sure your desktop CRMT application is running and accessible from this device.
            </Text>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.footer}>
        <Text variant="bodySmall" style={styles.versionText}>
          CRMT Mobile App v0.1.0
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 32,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    opacity: 0.7,
  },
  card: {
    marginBottom: 24,
  },
  description: {
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    marginBottom: 16,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  button: {
    marginBottom: 16,
  },
  infoContainer: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 4,
  },
  infoText: {
    color: '#1565c0',
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  versionText: {
    opacity: 0.5,
  },
});
