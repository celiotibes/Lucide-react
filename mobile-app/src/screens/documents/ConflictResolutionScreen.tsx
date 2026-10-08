/**
 * Conflict Resolution Screen
 * Handle sync conflicts and version conflicts between local and remote data
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  Divider,
  RadioButton,
  ActivityIndicator,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { ConflictResolver } from '@/services/sync/ConflictResolver';
import { Colors } from '@/theme/colors';
import { logger } from '@/utils/logger';

type NavigationProp = NativeStackNavigationProp<any, any>;

interface ConflictData {
  id: string;
  type: 'document' | 'transaction' | 'property';
  localData: any;
  remoteData: any;
  timestamp: number;
  conflictType: 'update' | 'delete' | 'version' | 'custom';
}

interface ResolutionState {
  stage: 'comparing' | 'idle' | 'resolving' | 'success' | 'error';
  selectedOption?: 'local' | 'remote' | 'merge';
  errorMessage?: string;
}

export const ConflictResolutionScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();

  const conflictId = (route.params as any)?.conflictId;

  const [conflict, setConflict] = useState<ConflictData | null>(null);
  const [resolutionState, setResolutionState] = useState<ResolutionState>({
    stage: 'comparing',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConflict();
  }, [conflictId]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Resolve Conflict',
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const loadConflict = async () => {
    if (!database || !conflictId) {
      Alert.alert('Error', 'Conflict not found');
      navigation.goBack();
      return;
    }

    try {
      setIsLoading(true);
      // In a real app, this would load from conflict storage
      // For now, we'll simulate a conflict
      const mockConflict: ConflictData = {
        id: conflictId,
        type: 'document',
        localData: {
          id: 'doc1',
          counterpartyName: 'Local Company Name',
          type: 'invoice',
          confidence: 0.92,
          updatedAt: Date.now() - 60000,
        },
        remoteData: {
          id: 'doc1',
          counterpartyName: 'Remote Company Name Updated',
          type: 'invoice',
          confidence: 0.88,
          updatedAt: Date.now(),
        },
        timestamp: Date.now(),
        conflictType: 'update',
      };

      setConflict(mockConflict);
      setResolutionState({ stage: 'idle' });
    } catch (error) {
      logger.error('Failed to load conflict', error);
      Alert.alert('Error', 'Failed to load conflict');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveConflict = async () => {
    if (!conflict || !resolutionState.selectedOption || !database) {
      Alert.alert('Error', 'Please select a resolution option');
      return;
    }

    try {
      setResolutionState({ stage: 'resolving', selectedOption: resolutionState.selectedOption });

      const resolver = new ConflictResolver(database);

      // Resolve based on selected option
      if (resolutionState.selectedOption === 'local') {
        await resolver.resolveConflict(conflict.id, 'keep_local');
      } else if (resolutionState.selectedOption === 'remote') {
        await resolver.resolveConflict(conflict.id, 'keep_remote');
      } else {
        // Merge strategy
        await resolver.resolveConflict(conflict.id, 'merge');
      }

      setResolutionState({ stage: 'success', selectedOption: resolutionState.selectedOption });

      setTimeout(() => {
        Alert.alert(
          'Success',
          'Conflict resolved successfully',
          [
            {
              text: 'Continue',
              onPress: () => navigation.goBack(),
            },
          ],
          { cancelable: false }
        );
      }, 500);
    } catch (error) {
      logger.error('Failed to resolve conflict', error);
      setResolutionState({
        stage: 'error',
        selectedOption: resolutionState.selectedOption,
        errorMessage:
          error instanceof Error ? error.message : 'Resolution failed',
      });
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getDifferences = () => {
    if (!conflict) return [];

    const differences: Array<{
      field: string;
      local: any;
      remote: any;
    }> = [];

    const allKeys = new Set([
      ...Object.keys(conflict.localData),
      ...Object.keys(conflict.remoteData),
    ]);

    allKeys.forEach((key) => {
      if (
        conflict.localData[key] !== conflict.remoteData[key]
      ) {
        differences.push({
          field: key,
          local: conflict.localData[key],
          remote: conflict.remoteData[key],
        });
      }
    });

    return differences;
  };

  const renderLoadingState = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );

  const renderIdleState = () => (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerIcon}>
          <MaterialIcons name="merge-type" size={60} color={Colors.warning} />
        </View>

        <Text style={styles.title}>Resolve Conflict</Text>
        <Text style={styles.subtitle}>
          There are differences between your local and remote data
        </Text>

        {conflict && (
          <>
            {/* Conflict Information */}
            <Card style={styles.infoCard}>
              <Card.Content>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Document:</Text>
                  <Chip mode="flat">{conflict.type}</Chip>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Conflict Type:</Text>
                  <Chip mode="flat">{conflict.conflictType}</Chip>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Detected:</Text>
                  <Text style={styles.infoValue}>{formatDate(conflict.timestamp)}</Text>
                </View>
              </Card.Content>
            </Card>

            {/* Differences */}
            <Text style={styles.sectionTitle}>Differences</Text>

            {getDifferences().map((diff, index) => (
              <Card key={`${diff.field}-${index}`} style={styles.differenceCard}>
                <Card.Content>
                  <Text style={styles.fieldName}>{diff.field}</Text>

                  <View style={styles.comparisonRow}>
                    <View style={[styles.version, styles.localVersion]}>
                      <Text style={styles.versionLabel}>Local</Text>
                      <Text style={styles.versionValue} numberOfLines={2}>
                        {String(diff.local)}
                      </Text>
                    </View>

                    <View style={styles.separator}>
                      <MaterialIcons
                        name="arrow-forward"
                        size={20}
                        color={Colors.textTertiary}
                      />
                    </View>

                    <View style={[styles.version, styles.remoteVersion]}>
                      <Text style={styles.versionLabel}>Remote</Text>
                      <Text style={styles.versionValue} numberOfLines={2}>
                        {String(diff.remote)}
                      </Text>
                    </View>
                  </View>
                </Card.Content>
              </Card>
            ))}

            <Divider style={styles.divider} />

            {/* Resolution Options */}
            <Text style={styles.sectionTitle}>Choose Resolution</Text>

            <Card style={styles.optionCard}>
              <Card.Content>
                <Pressable
                  style={styles.optionRow}
                  onPress={() =>
                    setResolutionState({
                      stage: 'idle',
                      selectedOption: 'local',
                    })
                  }
                >
                  <RadioButton
                    value="local"
                    status={resolutionState.selectedOption === 'local' ? 'checked' : 'unchecked'}
                    onPress={() =>
                      setResolutionState({
                        stage: 'idle',
                        selectedOption: 'local',
                      })
                    }
                    color={Colors.primary}
                  />

                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Keep Local Version</Text>
                    <Text style={styles.optionDescription}>
                      Use the version on this device
                    </Text>
                  </View>
                </Pressable>

                <Divider style={styles.innerDivider} />

                <Pressable
                  style={styles.optionRow}
                  onPress={() =>
                    setResolutionState({
                      stage: 'idle',
                      selectedOption: 'remote',
                    })
                  }
                >
                  <RadioButton
                    value="remote"
                    status={resolutionState.selectedOption === 'remote' ? 'checked' : 'unchecked'}
                    onPress={() =>
                      setResolutionState({
                        stage: 'idle',
                        selectedOption: 'remote',
                      })
                    }
                    color={Colors.primary}
                  />

                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Keep Remote Version</Text>
                    <Text style={styles.optionDescription}>
                      Use the version from the server
                    </Text>
                  </View>
                </Pressable>

                <Divider style={styles.innerDivider} />

                <Pressable
                  style={styles.optionRow}
                  onPress={() =>
                    setResolutionState({
                      stage: 'idle',
                      selectedOption: 'merge',
                    })
                  }
                >
                  <RadioButton
                    value="merge"
                    status={resolutionState.selectedOption === 'merge' ? 'checked' : 'unchecked'}
                    onPress={() =>
                      setResolutionState({
                        stage: 'idle',
                        selectedOption: 'merge',
                      })
                    }
                    color={Colors.primary}
                  />

                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>Merge Both Versions</Text>
                    <Text style={styles.optionDescription}>
                      Combine both versions intelligently
                    </Text>
                  </View>
                </Pressable>
              </Card.Content>
            </Card>

            {/* Action Buttons */}
            <View style={styles.buttonsContainer}>
              <Button
                mode="contained"
                onPress={handleResolveConflict}
                style={styles.primaryButton}
                disabled={!resolutionState.selectedOption}
                contentStyle={styles.buttonContent}
              >
                Resolve Conflict
              </Button>

              <Button
                mode="outlined"
                onPress={() => navigation.goBack()}
                style={styles.secondaryButton}
                contentStyle={styles.buttonContent}
              >
                Cancel
              </Button>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );

  const renderResolvingState = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.processingTitle}>Resolving Conflict</Text>
      <Text style={styles.processingSubtitle}>
        Please wait while we resolve this conflict...
      </Text>
    </View>
  );

  const renderSuccessState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.successIconContainer}>
        <MaterialIcons name="check-circle" size={80} color={Colors.success} />
      </View>

      <Text style={styles.successTitle}>Conflict Resolved!</Text>
      <Text style={styles.successMessage}>
        The conflict has been resolved using your selected option.
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.centerContainer}>
      <View style={styles.errorIconContainer}>
        <MaterialIcons name="error-outline" size={80} color={Colors.error} />
      </View>

      <Text style={styles.errorTitle}>Resolution Failed</Text>
      <Text style={styles.errorMessage}>{resolutionState.errorMessage}</Text>

      <View style={styles.buttonsContainer}>
        <Button
          mode="contained"
          onPress={handleResolveConflict}
          style={styles.primaryButton}
        >
          Try Again
        </Button>

        <Button
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={styles.secondaryButton}
        >
          Back
        </Button>
      </View>
    </View>
  );

  if (isLoading) {
    return renderLoadingState();
  }

  return (
    <>
      {resolutionState.stage === 'idle' && renderIdleState()}
      {resolutionState.stage === 'resolving' && renderResolvingState()}
      {resolutionState.stage === 'success' && renderSuccessState()}
      {resolutionState.stage === 'error' && renderErrorState()}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    minHeight: 600,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.warning + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  infoCard: {
    marginBottom: 20,
    backgroundColor: Colors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.text,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
    marginTop: 16,
  },
  differenceCard: {
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  fieldName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  version: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  localVersion: {
    backgroundColor: Colors.info + '10',
    borderWidth: 1,
    borderColor: Colors.info + '30',
  },
  remoteVersion: {
    backgroundColor: Colors.success + '10',
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  versionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  versionValue: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
  },
  separator: {
    paddingHorizontal: 4,
  },
  divider: {
    marginVertical: 20,
  },
  optionCard: {
    marginBottom: 20,
    backgroundColor: Colors.surface,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  optionContent: {
    flex: 1,
    marginLeft: 12,
    paddingVertical: 4,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
  innerDivider: {
    marginVertical: 8,
  },
  buttonsContainer: {
    gap: 12,
    marginBottom: 32,
  },
  primaryButton: {
    width: '100%',
  },
  secondaryButton: {
    width: '100%',
  },
  buttonContent: {
    paddingVertical: 8,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
  },
  processingSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.success,
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.error + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.error,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
});
