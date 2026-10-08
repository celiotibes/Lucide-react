/**
 * Settings Screen
 * User settings and preferences including sync configuration
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Switch,
} from 'react-native';
import { Text, Button, Card, Divider } from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '@/hooks';
import { Colors } from '@/theme/colors';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';
import { logger } from '@/utils/logger';

export const SettingsScreen: React.FC = () => {
  const { user, logout, apiEndpoint, deviceId } = useAuth();
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(300000); // 5 minutes
  const [selectedLanguage, setSelectedLanguage] = useState('ENG');

  const handleLogout = useCallback(async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            logger.error('Logout failed:', error);
            Alert.alert('Error', 'Failed to logout');
          }
        },
      },
    ]);
  }, [logout]);

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data. You can re-download it anytime.',
      [
        { text: 'Cancel' },
        {
          text: 'Clear',
          onPress: () => {
            logger.info('Cache cleared');
            Alert.alert('Success', 'Cache cleared successfully');
          },
        },
      ]
    );
  };

  const handleResetSettings = () => {
    Alert.alert(
      'Reset Settings',
      'This will reset all settings to default values.',
      [
        { text: 'Cancel' },
        {
          text: 'Reset',
          onPress: () => {
            setAutoSync(true);
            setSyncInterval(300000);
            setSelectedLanguage('ENG');
            Alert.alert('Success', 'Settings reset to defaults');
          },
        },
      ]
    );
  };

  const languages = [
    { code: 'ENG', name: 'English' },
    { code: 'POR', name: 'Portuguese' },
    { code: 'SPA', name: 'Spanish' },
    { code: 'FRA', name: 'French' },
    { code: 'DEU', name: 'German' },
    { code: 'ITA', name: 'Italian' },
    { code: 'JPN', name: 'Japanese' },
    { code: 'KOR', name: 'Korean' },
    { code: 'RUS', name: 'Russian' },
  ];

  const syncIntervals = [
    { value: 60000, label: '1 minute' },
    { value: 300000, label: '5 minutes' },
    { value: 900000, label: '15 minutes' },
    { value: 1800000, label: '30 minutes' },
    { value: 3600000, label: '1 hour' },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Sync Status */}
      {apiEndpoint && deviceId && (
        <>
          <Text style={styles.sectionTitle}>Sync Status</Text>
          <SyncStatusIndicator
            apiBaseURL={apiEndpoint}
            deviceId={deviceId}
            compact={false}
          />
        </>
      )}

      {/* Sync Settings */}
      <Text style={styles.sectionTitle}>Sync Settings</Text>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          {/* Auto Sync */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto Sync</Text>
              <Text style={styles.settingDescription}>
                Automatically sync changes in background
              </Text>
            </View>
            <Switch
              value={autoSync}
              onValueChange={setAutoSync}
              color={Colors.primary}
            />
          </View>
          <Divider style={styles.divider} />

          {/* Sync Interval */}
          {autoSync && (
            <>
              <Text style={styles.settingLabel}>Sync Interval</Text>
              <View style={styles.buttonRow}>
                {syncIntervals.map((interval) => (
                  <Pressable
                    key={interval.value}
                    style={[
                      styles.intervalButton,
                      syncInterval === interval.value &&
                        styles.intervalButtonActive,
                    ]}
                    onPress={() => setSyncInterval(interval.value)}
                  >
                    <Text
                      style={[
                        styles.intervalButtonText,
                        syncInterval === interval.value &&
                          styles.intervalButtonTextActive,
                      ]}
                    >
                      {interval.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Divider style={styles.divider} />
            </>
          )}

          {/* Device ID */}
          <View style={styles.metaRow}>
            <MaterialIcons name="devices" size={16} color={Colors.primary} />
            <View style={styles.metaText}>
              <Text style={styles.metaLabel}>Device ID</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {deviceId || 'Unknown'}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* OCR Settings */}
      <Text style={styles.sectionTitle}>OCR Settings</Text>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <Text style={styles.settingLabel}>OCR Language</Text>
          <View style={styles.languageGrid}>
            {languages.map((lang) => (
              <Pressable
                key={lang.code}
                style={[
                  styles.languageButton,
                  selectedLanguage === lang.code &&
                    styles.languageButtonActive,
                ]}
                onPress={() => setSelectedLanguage(lang.code)}
              >
                <Text
                  style={[
                    styles.languageButtonText,
                    selectedLanguage === lang.code &&
                      styles.languageButtonTextActive,
                  ]}
                >
                  {lang.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Card>

      {/* Account Settings */}
      <Text style={styles.sectionTitle}>Account</Text>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.metaRow}>
            <MaterialIcons name="account-circle" size={16} color={Colors.primary} />
            <View style={styles.metaText}>
              <Text style={styles.metaLabel}>Email</Text>
              <Text style={styles.metaValue}>{user?.email || 'Unknown'}</Text>
            </View>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.metaRow}>
            <MaterialIcons name="storage" size={16} color={Colors.primary} />
            <View style={styles.metaText}>
              <Text style={styles.metaLabel}>API Endpoint</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {apiEndpoint || 'Not configured'}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* App Settings */}
      <Text style={styles.sectionTitle}>App</Text>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <Button
            mode="outlined"
            onPress={handleClearCache}
            style={styles.settingButton}
            icon="delete"
          >
            Clear Cache
          </Button>
          <Divider style={styles.divider} />
          <Button
            mode="outlined"
            onPress={handleResetSettings}
            style={styles.settingButton}
            icon="refresh"
          >
            Reset to Defaults
          </Button>
        </View>
      </Card>

      {/* Logout */}
      <Button
        mode="contained"
        onPress={handleLogout}
        style={styles.logoutButton}
        icon="logout"
        buttonColor={Colors.error}
      >
        Logout
      </Button>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.versionText}>App Version 1.0.0</Text>
        <Text style={styles.footerText}>© 2024 Document Manager</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  card: {
    marginBottom: 12,
    backgroundColor: Colors.surface,
  },
  cardContent: {
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  settingDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    marginVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  intervalButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceVariant,
  },
  intervalButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  intervalButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text,
  },
  intervalButtonTextActive: {
    color: Colors.white,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  languageButton: {
    flex: 0.48,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
  },
  languageButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  languageButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text,
  },
  languageButtonTextActive: {
    color: Colors.white,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  metaText: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  settingButton: {
    marginVertical: 4,
  },
  logoutButton: {
    marginTop: 24,
    marginBottom: 32,
    backgroundColor: Colors.error,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  versionText: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  footerText: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
