/**
 * Documents Stack Navigator
 * Manages all document-related screens navigation
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { DocumentsStackParamList } from '@/types/navigation';
import {
  DocumentsListScreen,
  DocumentDetailScreen,
  CaptureDocumentScreen,
  ReprocessDocumentScreen,
  ConflictResolutionScreen,
  SyncDetailsScreen,
} from '@/screens/documents';
import { Colors } from '@/theme/colors';

const Stack = createNativeStackNavigator<DocumentsStackParamList>();

/**
 * Documents Stack Navigator Component
 */
export const DocumentsStackNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: true,
        headerBackTitleVisible: false,
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.primary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
        cardStyle: {
          backgroundColor: Colors.background,
        },
        animationEnabled: true,
        animationTypeForReplace: 'pop',
      })}
    >
      {/* Main Documents List */}
      <Stack.Screen
        name="DocumentsList"
        component={DocumentsListScreen}
        options={{
          title: 'Documents',
          headerBackTitleVisible: false,
          headerRight: () => (
            <View style={{ flexDirection: 'row', marginRight: 8, gap: 8 }}>
              <Pressable
                hitSlop={8}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.5 : 1,
                  },
                ]}
              >
                <MaterialIcons
                  name="search"
                  size={24}
                  color={Colors.primary}
                />
              </Pressable>
            </View>
          ),
        }}
      />

      {/* Document Detail */}
      <Stack.Screen
        name="DocumentDetail"
        component={DocumentDetailScreen}
        options={({ route }) => ({
          title: 'Document Details',
          headerBackTitleVisible: false,
        })}
      />

      {/* Capture Document */}
      <Stack.Screen
        name="CaptureDocument"
        component={CaptureDocumentScreen}
        options={{
          title: 'Capture Document',
          headerBackTitleVisible: false,
          animationEnabled: true,
        }}
      />

      {/* Reprocess Document */}
      <Stack.Screen
        name="ReprocessDocument"
        component={ReprocessDocumentScreen}
        options={{
          title: 'Reprocess Document',
          headerBackTitleVisible: false,
        }}
      />

      {/* Conflict Resolution */}
      <Stack.Screen
        name="ConflictResolution"
        component={ConflictResolutionScreen}
        options={{
          title: 'Resolve Conflict',
          headerBackTitleVisible: false,
        }}
      />

      {/* Sync Details */}
      <Stack.Screen
        name="SyncDetails"
        component={SyncDetailsScreen}
        options={{
          title: 'Sync Details',
          headerBackTitleVisible: false,
        }}
      />
    </Stack.Navigator>
  );
};

export default DocumentsStackNavigator;
