/**
 * React Navigation Types
 * Type-safe navigation parameters and route definitions
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';

// Auth Stack
export type AuthStackParamList = {
  SetupWizard: undefined;
  Login: undefined;
  Register: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

// Dashboard Stack
export type DashboardStackParamList = {
  DashboardHome: undefined;
  DocumentDetail: { documentId: string };
  TransactionDetail: { transactionId: string };
  PropertyDetail: { propertyId: string };
};

export type DashboardStackScreenProps<T extends keyof DashboardStackParamList> =
  NativeStackScreenProps<DashboardStackParamList, T>;

// Documents Stack
export type DocumentsStackParamList = {
  DocumentsList: undefined;
  DocumentDetail: { documentId: string };
  DocumentCreate: undefined;
  DocumentEdit: { documentId: string };
  OCRProcess: { documentId?: string };
};

export type DocumentsStackScreenProps<T extends keyof DocumentsStackParamList> =
  NativeStackScreenProps<DocumentsStackParamList, T>;

// Transactions Stack
export type TransactionsStackParamList = {
  TransactionsList: undefined;
  TransactionDetail: { transactionId: string };
  TransactionCreate: undefined;
  TransactionEdit: { transactionId: string };
};

export type TransactionsStackScreenProps<T extends keyof TransactionsStackParamList> =
  NativeStackScreenProps<TransactionsStackParamList, T>;

// Root Stack (combines Auth and main app)
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
  Splash: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

// Main Tab Stack
export type MainStackParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList>;
  Documents: NavigatorScreenParams<DocumentsStackParamList>;
  Transactions: NavigatorScreenParams<TransactionsStackParamList>;
  Settings: undefined;
};

export type MainStackScreenProps<T extends keyof MainStackParamList> = BottomTabScreenProps<
  MainStackParamList,
  T
>;

// Route names for navigation
export const AuthRoutes = {
  SetupWizard: 'SetupWizard',
  Login: 'Login',
  Register: 'Register',
} as const;

export const MainRoutes = {
  Dashboard: 'Dashboard',
  Documents: 'Documents',
  Transactions: 'Transactions',
  Settings: 'Settings',
} as const;

export const DashboardRoutes = {
  Home: 'DashboardHome',
  DocumentDetail: 'DocumentDetail',
  TransactionDetail: 'TransactionDetail',
  PropertyDetail: 'PropertyDetail',
} as const;

export const DocumentsRoutes = {
  List: 'DocumentsList',
  Detail: 'DocumentDetail',
  Create: 'DocumentCreate',
  Edit: 'DocumentEdit',
  OCRProcess: 'OCRProcess',
} as const;

export const TransactionsRoutes = {
  List: 'TransactionsList',
  Detail: 'TransactionDetail',
  Create: 'TransactionCreate',
  Edit: 'TransactionEdit',
} as const;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
