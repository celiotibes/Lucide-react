/**
 * Navigation Utilities
 * Helper functions and linking configuration for React Navigation
 */

import { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from '@/types/navigation';

/**
 * Deep linking configuration
 * Maps URL schemes to app screens
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['app://', 'lucide-react://'],

  config: {
    screens: {
      Auth: {
        screens: {
          SetupWizard: 'setup',
          Login: 'login',
          Register: 'register',
        },
      },
      Main: {
        screens: {
          Dashboard: {
            screens: {
              DashboardHome: 'dashboard',
              DocumentDetail: 'documents/:documentId',
              TransactionDetail: 'transactions/:transactionId',
              PropertyDetail: 'properties/:propertyId',
            },
          },
          Documents: {
            screens: {
              DocumentsList: 'documents',
              DocumentDetail: 'documents/:documentId',
              DocumentCreate: 'documents/new',
              DocumentEdit: 'documents/:documentId/edit',
              OCRProcess: 'documents/:documentId/ocr',
              CaptureDocument: 'documents/capture',
              ReprocessDocument: 'documents/:documentId/reprocess',
              ConflictResolution: 'documents/conflicts/:conflictId',
              SyncDetails: 'sync/details',
            },
          },
          Transactions: {
            screens: {
              TransactionsList: 'transactions',
              TransactionDetail: 'transactions/:transactionId',
              TransactionCreate: 'transactions/new',
              TransactionEdit: 'transactions/:transactionId/edit',
            },
          },
          Settings: 'settings',
        },
      },
      Splash: 'splash',
    },
  },
};

/**
 * Navigation route helpers
 * Provide type-safe navigation functions
 */
export const navigationRoutes = {
  // Documents
  documentsList: () => ({
    screen: 'Documents' as const,
    params: {
      screen: 'DocumentsList' as const,
    },
  }),

  documentDetail: (documentId: string) => ({
    screen: 'Documents' as const,
    params: {
      screen: 'DocumentDetail' as const,
      params: { documentId },
    },
  }),

  captureDocument: () => ({
    screen: 'Documents' as const,
    params: {
      screen: 'CaptureDocument' as const,
    },
  }),

  reprocessDocument: (documentId: string) => ({
    screen: 'Documents' as const,
    params: {
      screen: 'ReprocessDocument' as const,
      params: { documentId },
    },
  }),

  conflictResolution: (conflictId: string) => ({
    screen: 'Documents' as const,
    params: {
      screen: 'ConflictResolution' as const,
      params: { conflictId },
    },
  }),

  syncDetails: () => ({
    screen: 'Documents' as const,
    params: {
      screen: 'SyncDetails' as const,
    },
  }),

  // Dashboard
  dashboard: () => ({
    screen: 'Dashboard' as const,
    params: {
      screen: 'DashboardHome' as const,
    },
  }),

  // Transactions
  transactionsList: () => ({
    screen: 'Transactions' as const,
    params: {
      screen: 'TransactionsList' as const,
    },
  }),

  transactionDetail: (transactionId: string) => ({
    screen: 'Transactions' as const,
    params: {
      screen: 'TransactionDetail' as const,
      params: { transactionId },
    },
  }),

  // Settings
  settings: () => ({
    screen: 'Settings' as const,
  }),

  // Auth
  setupWizard: () => ({
    screen: 'Auth' as const,
    params: {
      screen: 'SetupWizard' as const,
    },
  }),

  login: () => ({
    screen: 'Auth' as const,
    params: {
      screen: 'Login' as const,
    },
  }),
};

/**
 * Deep link parser
 * Parse deep links to navigation actions
 */
export const parseDeepLink = (url: string) => {
  const cleanUrl = url.replace(/^app:\/\//, '').replace(/^lucide-react:\/\//, '');
  const [route, ...params] = cleanUrl.split('?');
  const queryParams: Record<string, string> = {};

  params.forEach((param) => {
    const [key, value] = param.split('=');
    if (key && value) {
      queryParams[key] = decodeURIComponent(value);
    }
  });

  return { route, queryParams };
};

/**
 * Navigation guards
 * Check if user can navigate to a route
 */
export const navigationGuards = {
  requireAuth: (isAuthenticated: boolean) => {
    return isAuthenticated;
  },

  requireApiEndpoint: (apiEndpoint: string | null) => {
    return !!apiEndpoint;
  },

  canAccessDocuments: (isAuthenticated: boolean, apiEndpoint: string | null) => {
    return isAuthenticated && !!apiEndpoint;
  },

  canAccessSettings: (isAuthenticated: boolean) => {
    return isAuthenticated;
  },
};

/**
 * Navigation state utilities
 * Get information about current navigation state
 */
export const navigationStateUtils = {
  getCurrentRouteName: (state: any): string | undefined => {
    const route = state.routes[state.index];

    if (route.state) {
      return navigationStateUtils.getCurrentRouteName(route.state);
    }

    return route.name;
  },

  getRouteParams: (state: any, routeName: string): any => {
    const route = state.routes[state.index];

    if (route.name === routeName) {
      return route.params;
    }

    if (route.state) {
      return navigationStateUtils.getRouteParams(route.state, routeName);
    }

    return undefined;
  },

  findRouteByName: (state: any, routeName: string): any => {
    const route = state.routes[state.index];

    if (route.name === routeName) {
      return route;
    }

    if (route.state) {
      return navigationStateUtils.findRouteByName(route.state, routeName);
    }

    return undefined;
  },
};

/**
 * Screen transition options
 * Predefined transition configurations
 */
export const transitionOptions = {
  modal: {
    animationEnabled: true,
    animationTypeForReplace: 'pop' as const,
    cardStyleInterpolator: 'forModalPresentationIOS' as any,
  },

  slide: {
    animationEnabled: true,
    animationTypeForReplace: 'pop' as const,
  },

  fade: {
    animationEnabled: true,
    animationTypeForReplace: 'fade' as any,
  },

  none: {
    animationEnabled: false,
    animationTypeForReplace: 'pop' as const,
  },
};

/**
 * Header options builder
 * Build consistent header configurations
 */
export const headerOptions = {
  simple: () => ({
    headerBackTitleVisible: false,
    headerShadowVisible: false,
  }),

  withLargeTitle: (title: string) => ({
    headerTitle: title,
    headerLargeTitle: true,
    headerBlurEffect: 'light' as const,
  }),

  withActions: (title: string, actions: any[]) => ({
    headerTitle: title,
    headerRight: () => {
      // Actions will be rendered in the screen component
      return null;
    },
  }),
};
