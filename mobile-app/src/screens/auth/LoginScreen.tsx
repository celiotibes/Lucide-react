/**
 * Login Screen
 * User authentication with email and password
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, TextInput, Text, Card } from 'react-native-paper';
import { useAuth } from '@/hooks';
import { validateEmail, validatePassword } from '@/utils/validation';
import type { AuthStackScreenProps } from '@/types';

type Props = AuthStackScreenProps<'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = useCallback(async () => {
    setError(null);

    // Validate inputs
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Invalid email address');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await login({ email, password });
      // Navigation will be handled by the app's auth state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, password, login]);

  const handleForgotPassword = useCallback(() => {
    // TODO: Implement password reset flow
    setError('Password reset is not yet implemented');
  }, []);

  const handleRegister = useCallback(() => {
    navigation.navigate('Register');
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="headlineLarge" style={styles.title}>
            CRMT Mobile
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Sign In to Your Account
          </Text>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              mode="outlined"
              style={styles.input}
              editable={!loading}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              mode="outlined"
              style={styles.input}
              editable={!loading}
              secureTextEntry={!showPassword}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              disabled={loading || !email.trim() || !password}
              style={styles.button}
            >
              Sign In
            </Button>

            <Button
              mode="text"
              onPress={handleForgotPassword}
              style={styles.secondaryButton}
              disabled={loading}
            >
              Forgot Password?
            </Button>
          </Card.Content>
        </Card>

        <View style={styles.registerContainer}>
          <Text variant="bodyMedium">Don't have an account? </Text>
          <Button
            mode="text"
            compact
            onPress={handleRegister}
            disabled={loading}
          >
            Sign Up
          </Button>
        </View>

        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.disclaimerText}>
            This is a secure connection to your CRMT application. Your credentials are encrypted in
            transit.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  input: {
    marginBottom: 12,
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
    marginTop: 8,
    marginBottom: 8,
  },
  secondaryButton: {
    marginTop: 4,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  footer: {
    paddingBottom: 24,
  },
  disclaimerText: {
    textAlign: 'center',
    opacity: 0.6,
    lineHeight: 18,
  },
});
