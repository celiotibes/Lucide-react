/**
 * Firebase Client Initialization
 * Configuração segura do Firebase no cliente com todas as melhores práticas
 */

import { initializeApp, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  Auth
} from 'firebase/auth';
import {
  getFirestore,
  enableIndexedDbPersistence,
  disableNetwork,
  connectFirestoreEmulator,
  Firestore
} from 'firebase/firestore';
import {
  getStorage,
  connectStorageEmulator,
  FirebaseStorage
} from 'firebase/storage';
import {
  getDatabase,
  connectDatabaseEmulator,
  Database
} from 'firebase/database';
import {
  getAnalytics,
  isSupported,
  Analytics
} from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';

// Types
interface FirebaseServices {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  realtimeDb: Database;
  functions: Functions;
  analytics?: Analytics;
}

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || '',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '',
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || ''
};

// Validate configuration
function validateConfig(): void {
  const requiredKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ];

  const missingKeys = requiredKeys.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);

  if (missingKeys.length > 0) {
    throw new Error(
      `Firebase configuration is incomplete. Missing: ${missingKeys.join(', ')}. ` +
      `Please check your .env file.`
    );
  }
}

// Initialize Firebase services
export function initializeFirebase(): FirebaseServices {
  try {
    // Validate configuration first
    validateConfig();

    // Initialize Firebase app
    let app;
    try {
      app = getApp();
    } catch (error) {
      app = initializeApp(firebaseConfig);
    }

    // Initialize Auth
    const auth = getAuth(app);

    // Set persistence strategy
    setPersistence(auth, browserLocalPersistence).catch(error => {
      console.warn('Failed to set auth persistence:', error);
    });

    // Initialize Firestore
    const db = getFirestore(app);

    // Enable offline persistence
    enableIndexedDbPersistence(db).catch(error => {
      if (error.code === 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
      } else if (error.code === 'unimplemented') {
        console.warn('The current browser does not support persistence.');
      }
    });

    // Initialize Storage
    const storage = getStorage(app);

    // Initialize Realtime Database
    const realtimeDb = getDatabase(app);

    // Initialize Functions
    const functions = getFunctions(app);

    // Initialize Analytics (if supported)
    let analytics: Analytics | undefined;
    isSupported().then(yes => {
      if (yes) {
        analytics = getAnalytics(app);
      }
    }).catch(error => {
      console.warn('Analytics not supported:', error);
    });

    // Setup emulators for development
    if (process.env.REACT_APP_USE_FIREBASE_EMULATOR === 'true') {
      setupEmulators(auth, db, storage, realtimeDb, functions);
    }

    return {
      auth,
      db,
      storage,
      realtimeDb,
      functions,
      analytics
    };
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    throw new Error(`Firebase initialization error: ${(error as Error).message}`);
  }
}

// Setup Firebase emulators for development
function setupEmulators(
  auth: Auth,
  db: Firestore,
  storage: FirebaseStorage,
  realtimeDb: Database,
  functions: Functions
): void {
  try {
    // Only connect if not already connected
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Auth emulator
      try {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      } catch (error) {
        // Emulator might already be connected
      }

      // Firestore emulator
      try {
        connectFirestoreEmulator(db, 'localhost', 8080);
      } catch (error) {
        // Emulator might already be connected
      }

      // Storage emulator
      try {
        connectStorageEmulator(storage, 'localhost', 9199);
      } catch (error) {
        // Emulator might already be connected
      }

      // Realtime Database emulator
      try {
        connectDatabaseEmulator(realtimeDb, 'localhost', 9000);
      } catch (error) {
        // Emulator might already be connected
      }

      // Functions emulator
      try {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      } catch (error) {
        // Emulator might already be connected
      }

      console.log('Firebase emulators connected');
    }
  } catch (error) {
    console.warn('Failed to connect emulators:', error);
  }
}

// Enable offline mode
export async function enableOfflineMode(db: Firestore): Promise<void> {
  try {
    await disableNetwork(db);
    console.log('Offline mode enabled');
  } catch (error) {
    console.error('Failed to enable offline mode:', error);
  }
}

// Safe error handler for Firebase operations
export function handleFirebaseError(error: any): string {
  const errorCode = error.code || error.message;

  const errorMessages: Record<string, string> = {
    'auth/user-not-found': 'User not found',
    'auth/wrong-password': 'Incorrect password',
    'auth/email-already-in-use': 'Email already in use',
    'auth/weak-password': 'Password is too weak',
    'auth/too-many-requests': 'Too many failed login attempts. Please try again later.',
    'auth/account-exists-with-different-credential': 'This email is already associated with another account',
    'permission-denied': 'You do not have permission to perform this action',
    'not-found': 'The requested resource was not found',
    'already-exists': 'The resource already exists',
    'invalid-argument': 'Invalid argument provided',
    'resource-exhausted': 'Quota exceeded',
    'unauthenticated': 'You must be authenticated to perform this action'
  };

  return errorMessages[errorCode] || `An error occurred: ${errorCode}`;
}

// Retry logic for failed operations
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on auth errors
      if ((error as any).code?.startsWith('auth/')) {
        throw error;
      }

      // Calculate exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);

      if (attempt < maxRetries) {
        console.warn(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Request interceptor for security headers
export function addSecurityHeaders(): void {
  // This is handled by Firebase SDK automatically
  // But can be extended for custom headers if needed
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestInit = init || {};

    // Add security headers
    requestInit.headers = {
      ...requestInit.headers,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    };

    return originalFetch(input, requestInit);
  };
}

// Session management
export class SessionManager {
  private sessionTimeout: number;
  private warningTimeout: number;
  private timeoutId?: NodeJS.Timeout;
  private warningId?: NodeJS.Timeout;

  constructor(
    private auth: Auth,
    sessionTimeoutMinutes: number = 60,
    warningMinutes: number = 5
  ) {
    this.sessionTimeout = sessionTimeoutMinutes * 60 * 1000;
    this.warningTimeout = (sessionTimeoutMinutes - warningMinutes) * 60 * 1000;
    this.startSessionTimer();
  }

  private startSessionTimer(): void {
    this.resetTimer();

    // Listen for user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      window.addEventListener(event, () => this.resetTimer(), true);
    });
  }

  private resetTimer(): void {
    // Clear existing timers
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningId) clearTimeout(this.warningId);

    // Set warning timer
    this.warningId = setTimeout(() => {
      this.showWarning();
    }, this.warningTimeout);

    // Set logout timer
    this.timeoutId = setTimeout(() => {
      this.logout();
    }, this.sessionTimeout);
  }

  private showWarning(): void {
    // Dispatch event for UI to show warning
    window.dispatchEvent(new CustomEvent('sessionWarning', {
      detail: { message: 'Your session will expire soon due to inactivity' }
    }));
  }

  private logout(): void {
    this.auth.signOut().then(() => {
      window.location.href = '/login';
    });
  }

  public destroy(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.warningId) clearTimeout(this.warningId);
  }
}

export default initializeFirebase;
