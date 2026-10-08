/**
 * Biometric Setup Screen
 * Enable/disable biometric authentication with user-friendly interface
 * Phase 22.15 Mobile-First Features
 *
 * Features:
 * - Display available biometric methods
 * - Enable/disable biometric authentication
 * - Test biometric scan with success/failure handling
 * - Show instructions for users
 * - Graceful fallback if biometric unavailable
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Button,
  Text,
  Card,
  Switch,
  ActivityIndicator,
  Divider,
  Avatar,
  Snackbar,
} from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-community';
import { useAuth } from '@/hooks';
import { BiometricAuthService } from '@/utils/biometric/biometricAuthService';
import { BiometricType, BiometricAvailability } from '@/utils/biometric/biometricTypes';

interface Props {
  navigation?: any;
  onComplete?: () => void;
}

export const BiometricSetupScreen: React.FC<Props> = ({ navigation, onComplete }) => {
  const { user } = useAuth();

  // Service and state
  const [biometricService] = useState(() => new BiometricAuthService());
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testingMessage, setTestingMessage] = useState('');
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error' | 'info'>('info');

  // Initialize service and check availability
  useEffect(() => {
    const initialize = async () => {
      try {
        await biometricService.initialize();

        // Check availability
        const avail = await biometricService.checkAvailability();
        setAvailability(avail);

        // Check if already enabled
        const enabled = biometricService.isBiometricEnabled();
        setIsEnabled(enabled);

        console.log('[BiometricSetup] Initialized', { available: avail.available, enabled });
      } catch (error) {
        console.error('[BiometricSetup] Initialization failed:', error);
        setSnackbarMessage('Failed to initialize biometric service');
        setSnackbarType('error');
        setShowSnackbar(true);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [biometricService]);

  /**
   * Handle enabling biometric authentication
   */
  const handleEnableBiometric = useCallback(async () => {
    if (!user) {
      setSnackbarMessage('User not authenticated');
      setSnackbarType('error');
      setShowSnackbar(true);
      return;
    }

    setIsLoading(true);
    try {
      const success = await biometricService.enableBiometric({
        userId: user.id,
        reason: 'Enable biometric authentication for secure access',
      });

      if (success) {
        setIsEnabled(true);
        setSnackbarMessage('Biometric authentication enabled successfully');
        setSnackbarType('success');
        setShowSnackbar(true);
      } else {
        setSnackbarMessage('Failed to enable biometric authentication');
        setSnackbarType('error');
        setShowSnackbar(true);
      }
    } catch (error) {
      console.error('[BiometricSetup] Enable failed:', error);
      setSnackbarMessage(`Error: ${String(error)}`);
      setSnackbarType('error');
      setShowSnackbar(true);
    } finally {
      setIsLoading(false);
    }
  }, [user, biometricService]);

  /**
   * Handle disabling biometric authentication
   */
  const handleDisableBiometric = useCallback(async () => {
    if (!user) {
      setSnackbarMessage('User not authenticated');
      setSnackbarType('error');
      setShowSnackbar(true);
      return;
    }

    setIsLoading(true);
    try {
      const success = await biometricService.disableBiometric(user.id);

      if (success) {
        setIsEnabled(false);
        setSnackbarMessage('Biometric authentication disabled');
        setSnackbarType('success');
        setShowSnackbar(true);
      } else {
        setSnackbarMessage('Failed to disable biometric authentication');
        setSnackbarType('error');
        setShowSnackbar(true);
      }
    } catch (error) {
      console.error('[BiometricSetup] Disable failed:', error);
      setSnackbarMessage(`Error: ${String(error)}`);
      setSnackbarType('error');
      setShowSnackbar(true);
    } finally {
      setIsLoading(false);
    }
  }, [user, biometricService]);

  /**
   * Test biometric authentication
   */
  const handleTestBiometric = useCallback(async () => {
    if (!isEnabled) {
      setSnackbarMessage('Biometric authentication is not enabled');
      setSnackbarType('info');
      setShowSnackbar(true);
      return;
    }

    setIsTesting(true);
    setTestingMessage('Authenticating...');

    try {
      const result = await biometricService.authenticate('Test biometric authentication');

      if (result.success) {
        setTestingMessage('Successfully verified!');
        setSnackbarMessage('Biometric authentication test successful');
        setSnackbarType('success');
      } else {
        setTestingMessage(`Failed: ${result.error?.message || 'Unknown error'}`);
        setSnackbarMessage(`Test failed: ${result.error?.message}`);
        setSnackbarType('error');
      }

      setShowSnackbar(true);
    } catch (error) {
      console.error('[BiometricSetup] Test failed:', error);
      setTestingMessage('Error during test');
      setSnackbarMessage(`Error: ${String(error)}`);
      setSnackbarType('error');
      setShowSnackbar(true);
    } finally {
      setIsTesting(false);
    }
  }, [isEnabled, biometricService]);

  /**
   * Handle switch toggle
   */
  const handleToggleBiometric = useCallback(async () => {
    if (isEnabled) {
      await handleDisableBiometric();
    } else {
      await handleEnableBiometric();
    }
  }, [isEnabled, handleEnableBiometric, handleDisableBiometric]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator animating size="large" />
        <Text style={styles.loadingText}>Loading biometric settings...</Text>
      </View>
    );
  }

  const getAvailabilityIcon = (): string => {
    if (!availability?.available) return 'close-circle';
    if (!availability.deviceEnrolled) return 'alert-circle';
    return 'check-circle';
  };

  const getAvailabilityColor = (): string => {
    if (!availability?.available) return '#d32f2f';
    if (!availability.deviceEnrolled) return '#fbc02d';
    return '#388e3c';
  };

  const getBiometricIcon = (type: BiometricType): string => {
    switch (type) {
      case BiometricType.FACE_ID:
        return 'face-recognition';
      case BiometricType.TOUCH_ID:
      case BiometricType.FINGERPRINT:
        return 'fingerprint';
      case BiometricType.IRIS:
        return 'eye';
      default:
        return 'shield-account';
    }
  };

  const getBiometricLabel = (type: BiometricType): string => {
    switch (type) {
      case BiometricType.FACE_ID:
        return 'Face ID';
      case BiometricType.TOUCH_ID:
        return 'Touch ID';
      case BiometricType.FINGERPRINT:
        return 'Fingerprint';
      case BiometricType.IRIS:
        return 'Iris Recognition';
      default:
        return 'Biometric';
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <Card style={styles.headerCard}>
          <Card.Content>
            <View style={styles.headerContent}>
              <MaterialCommunityIcons
                name="shield-account"
                size={48}
                color="#1976d2"
              />
              <Text variant="headlineMedium" style={styles.headerTitle}>
                Biometric Security
              </Text>
              <Text variant="bodyMedium" style={styles.headerSubtitle}>
                Enhance your account security with biometric authentication
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Availability Status */}
        <Card style={styles.statusCard}>
          <Card.Content>
            <View style={styles.statusContent}>
              <MaterialCommunityIcons
                name={getAvailabilityIcon()}
                size={32}
                color={getAvailabilityColor()}
              />
              <View style={styles.statusText}>
                <Text variant="bodyLarge" style={styles.statusTitle}>
                  {availability?.available ? 'Biometric Available' : 'Biometric Not Available'}
                </Text>
                <Text variant="bodySmall" style={styles.statusDescription}>
                  {availability?.available
                    ? availability.deviceEnrolled
                      ? 'Your device has biometric authentication set up'
                      : 'Please enroll biometric authentication in device settings'
                    : availability?.errorMessage || 'Your device does not support biometric authentication'}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Biometric Types */}
        {availability?.biometricTypes.length ? (
          <Card style={styles.typesCard}>
            <Card.Title title="Available Methods" />
            <Card.Content>
              {availability.biometricTypes.map((type, index) => (
                <View key={type}>
                  <View style={styles.methodRow}>
                    <MaterialCommunityIcons
                      name={getBiometricIcon(type)}
                      size={24}
                      color="#1976d2"
                    />
                    <Text variant="bodyMedium" style={styles.methodLabel}>
                      {getBiometricLabel(type)}
                    </Text>
                    <View style={styles.securityBadge}>
                      <Text variant="labelSmall" style={styles.securityLabel}>
                        {availability.securityLevel === 'strong_biometric'
                          ? 'Strong'
                          : 'Standard'}
                      </Text>
                    </View>
                  </View>
                  {index < availability.biometricTypes.length - 1 && <Divider />}
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : null}

        {/* Enable/Disable Toggle */}
        {availability?.available && availability.deviceEnrolled && (
          <>
            <Card style={styles.enableCard}>
              <Card.Content>
                <View style={styles.enableContent}>
                  <View style={styles.enableInfo}>
                    <Text variant="bodyLarge" style={styles.enableTitle}>
                      Enable Biometric Authentication
                    </Text>
                    <Text variant="bodySmall" style={styles.enableDescription}>
                      {isEnabled
                        ? 'Biometric authentication is currently enabled for secure access'
                        : 'Enable biometric authentication to quickly access your account'}
                    </Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={handleToggleBiometric}
                    disabled={isLoading}
                  />
                </View>
              </Card.Content>
            </Card>

            {/* Test Biometric Button */}
            {isEnabled && (
              <Card style={styles.testCard}>
                <Card.Content>
                  <Text variant="bodyMedium" style={styles.testTitle}>
                    Test Biometric Authentication
                  </Text>
                  <Text variant="bodySmall" style={styles.testDescription}>
                    Verify that your biometric authentication is working correctly
                  </Text>

                  <Button
                    mode="contained"
                    onPress={handleTestBiometric}
                    loading={isTesting}
                    disabled={isTesting}
                    style={styles.testButton}
                    icon={isTesting ? undefined : 'fingerprint'}
                  >
                    {isTesting ? 'Testing...' : 'Test Biometric'}
                  </Button>

                  {testingMessage && (
                    <View style={styles.testResult}>
                      <Text
                        variant="bodySmall"
                        style={[
                          styles.testMessage,
                          {
                            color: testingMessage.includes('Success')
                              ? '#388e3c'
                              : testingMessage.includes('Failed')
                                ? '#d32f2f'
                                : '#1976d2',
                          },
                        ]}
                      >
                        {testingMessage}
                      </Text>
                    </View>
                  )}
                </Card.Content>
              </Card>
            )}
          </>
        )}

        {/* Instructions */}
        <Card style={styles.instructionsCard}>
          <Card.Title title="How It Works" />
          <Card.Content>
            <View style={styles.instructionsList}>
              <View style={styles.instructionItem}>
                <Avatar.Text size={32} label="1" style={styles.instructionNumber} />
                <View style={styles.instructionContent}>
                  <Text variant="bodyMedium" style={styles.instructionTitle}>
                    Setup Once
                  </Text>
                  <Text variant="bodySmall" style={styles.instructionText}>
                    Enable biometric authentication from this screen
                  </Text>
                </View>
              </View>

              <View style={styles.instructionItem}>
                <Avatar.Text size={32} label="2" style={styles.instructionNumber} />
                <View style={styles.instructionContent}>
                  <Text variant="bodyMedium" style={styles.instructionTitle}>
                    Use Your Device
                  </Text>
                  <Text variant="bodySmall" style={styles.instructionText}>
                    Your device's biometric system handles all authentication
                  </Text>
                </View>
              </View>

              <View style={styles.instructionItem}>
                <Avatar.Text size={32} label="3" style={styles.instructionNumber} />
                <View style={styles.instructionContent}>
                  <Text variant="bodyMedium" style={styles.instructionTitle}>
                    Secure Access
                  </Text>
                  <Text variant="bodySmall" style={styles.instructionText}>
                    Use biometric instead of password for quick, secure login
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Security Notice */}
        <Card style={styles.securityNotice}>
          <Card.Content>
            <View style={styles.noticeContent}>
              <MaterialCommunityIcons
                name="shield-check"
                size={24}
                color="#388e3c"
              />
              <View style={styles.noticeText}>
                <Text variant="bodySmall" style={styles.noticeTitle}>
                  Your biometric data is secure
                </Text>
                <Text variant="labelSmall" style={styles.noticeDescription}>
                  Biometric data is stored on your device and never sent to our servers
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Button
            mode="outlined"
            onPress={() => navigation?.goBack() || onComplete?.()}
            style={styles.actionButton}
          >
            Back
          </Button>
          {onComplete && (
            <Button
              mode="contained"
              onPress={onComplete}
              style={styles.actionButton}
            >
              Done
            </Button>
          )}
        </View>
      </ScrollView>

      {/* Snackbar Notification */}
      <Snackbar
        visible={showSnackbar}
        onDismiss={() => setShowSnackbar(false)}
        duration={4000}
        style={[
          styles.snackbar,
          snackbarType === 'error' && styles.snackbarError,
          snackbarType === 'success' && styles.snackbarSuccess,
        ]}
      >
        {snackbarMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },

  // Header
  headerCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    marginTop: 12,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  headerSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: '#666',
  },

  // Status
  statusCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    flex: 1,
    marginLeft: 12,
  },
  statusTitle: {
    fontWeight: '600',
  },
  statusDescription: {
    marginTop: 4,
    color: '#666',
  },

  // Types
  typesCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  methodLabel: {
    flex: 1,
    marginLeft: 12,
    fontWeight: '500',
  },
  securityBadge: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  securityLabel: {
    color: '#1976d2',
    fontWeight: '600',
  },

  // Enable/Disable
  enableCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  enableContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  enableInfo: {
    flex: 1,
    marginRight: 12,
  },
  enableTitle: {
    fontWeight: '600',
  },
  enableDescription: {
    marginTop: 4,
    color: '#666',
  },

  // Test
  testCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  testTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  testDescription: {
    color: '#666',
    marginBottom: 12,
  },
  testButton: {
    marginTop: 12,
  },
  testResult: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  testMessage: {
    fontWeight: '500',
    textAlign: 'center',
  },

  // Instructions
  instructionsCard: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  instructionsList: {
    gap: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  instructionNumber: {
    backgroundColor: '#1976d2',
  },
  instructionContent: {
    flex: 1,
    marginLeft: 12,
  },
  instructionTitle: {
    fontWeight: '600',
  },
  instructionText: {
    marginTop: 4,
    color: '#666',
  },

  // Security Notice
  securityNotice: {
    marginBottom: 16,
    backgroundColor: '#e8f5e9',
  },
  noticeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noticeText: {
    flex: 1,
    marginLeft: 12,
  },
  noticeTitle: {
    fontWeight: '600',
    color: '#388e3c',
  },
  noticeDescription: {
    marginTop: 4,
    color: '#555',
  },

  // Actions
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
  },

  // Snackbar
  snackbar: {
    backgroundColor: '#323232',
  },
  snackbarError: {
    backgroundColor: '#d32f2f',
  },
  snackbarSuccess: {
    backgroundColor: '#388e3c',
  },
});
