/**
 * Root App Component
 * Sets up navigation, providers, and global app structure
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PaperProvider } from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { AuthProvider } from '@/store/auth-context';
import { useAuth } from '@/hooks';

// Screens
import { SetupWizardScreen, LoginScreen } from '@/screens/auth';
import { DashboardHomeScreen } from '@/screens/dashboard/DashboardHomeScreen';
import { DocumentsListScreen } from '@/screens/documents/DocumentsListScreen';
import { TransactionsListScreen } from '@/screens/transactions/TransactionsListScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';

// Types
import type {
  RootStackParamList,
  AuthStackParamList,
  MainStackParamList,
} from '@/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createBottomTabNavigator<MainStackParamList>();

/**
 * Auth Stack Navigator
 */
const AuthNavigator = () => {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        animationEnabled: true,
      }}
    >
      <AuthStack.Screen name="SetupWizard" component={SetupWizardScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      {/* TODO: Add Register screen */}
    </AuthStack.Navigator>
  );
};

/**
 * Main App Stack Navigator with Bottom Tabs
 */
const MainNavigator = () => {
  return (
    <MainStack.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, string> = {
            Dashboard: 'dashboard',
            Documents: 'insert-drive-file',
            Transactions: 'payment',
            Settings: 'settings',
          };

          return (
            <MaterialIcons
              name={icons[route.name] || 'home'}
              size={size}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
      })}
    >
      <MainStack.Screen
        name="Dashboard"
        component={DashboardHomeScreen}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
        }}
      />
      <MainStack.Screen
        name="Documents"
        component={DocumentsListScreen}
        options={{
          title: 'Documents',
          tabBarLabel: 'Documents',
        }}
      />
      <MainStack.Screen
        name="Transactions"
        component={TransactionsListScreen}
        options={{
          title: 'Transactions',
          tabBarLabel: 'Transactions',
        }}
      />
      <MainStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
        }}
      />
    </MainStack.Navigator>
  );
};

/**
 * Root Navigator Component
 */
const RootNavigator = () => {
  const { status, apiEndpoint } = useAuth();

  // Show setup wizard if no API endpoint is configured
  if (!apiEndpoint && status === 'unauthenticated') {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animationEnabled: false,
        }}
      >
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>
    );
  }

  // Show auth stack if not authenticated
  if (status === 'unauthenticated' || status === 'loading') {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animationEnabled: false,
        }}
      >
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Navigator>
    );
  }

  // Show main app if authenticated
  if (status === 'authenticated') {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animationEnabled: false,
        }}
      >
        <Stack.Screen name="Main" component={MainNavigator} />
      </Stack.Navigator>
    );
  }

  // Show error state
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Auth" component={AuthNavigator} />
    </Stack.Navigator>
  );
};

/**
 * Main App Component
 */
const App: React.FC = () => {
  return (
    <PaperProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </PaperProvider>
  );
};

export default App;
