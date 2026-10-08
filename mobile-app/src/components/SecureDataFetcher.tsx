/**
 * SecureDataFetcher - Example React component demonstrating secure API usage
 */

import React, { useState, useEffect } from 'react';
import {
  createSecureAPIClient,
  SecureAPIClient,
  ApiResponse,
  ApiError,
} from '../services/api/secureAPIClient';
import { TokenManager } from '../services/security/TokenManager';
import { CertificatePinningService } from '../services/security/CertificatePinningService';
import { EncryptionService } from '../services/security/EncryptionService';

interface User {
  id: string;
  name: string;
  email: string;
}

interface SecureDataFetcherProps {
  apiBaseUrl?: string;
  onDataLoaded?: (data: User[]) => void;
}

export const SecureDataFetcher: React.FC<SecureDataFetcherProps> = ({
  apiBaseUrl = 'https://api.example.com',
  onDataLoaded,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [certificatePinningStatus, setCertificatePinningStatus] = useState<any>(null);

  const apiClient = React.useRef<SecureAPIClient | null>(null);

  /**
   * Initialize API client and security services
   */
  useEffect(() => {
    initializeSecurityServices();
    initializeAPIClient();
  }, []);

  /**
   * Initialize security services
   */
  const initializeSecurityServices = async () => {
    try {
      // Set up tokens for demo
      const demoToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      // Store token with expiration
      TokenManager.setTokens(demoToken, 'refresh-token-demo', 3600);

      // Display token info
      const info = TokenManager.getTokenInfo();
      setTokenInfo(info);

      // Initialize certificate pinning
      CertificatePinningService.initialize({
        pins: [
          {
            domain: 'api.example.com',
            publicKeyHash:
              'ccc5cc6f4b5d8da06f8e0d1e0a1b1c1d1e1f2a2b2c2d2e2f3a3b3c3d3e3f4a',
            isBackup: false,
          },
        ],
        enableLogging: true,
      });

      const status = CertificatePinningService.getStatus();
      setCertificatePinningStatus(status);
    } catch (err) {
      console.error('Failed to initialize security services:', err);
    }
  };

  /**
   * Initialize API client
   */
  const initializeAPIClient = () => {
    apiClient.current = createSecureAPIClient(apiBaseUrl, {
      enableEncryption: false, // Set to true to encrypt sensitive payloads
      enableCertificatePinning: true,
      encryptionFields: ['password', 'ssn', 'creditCard'],
      decryptionFields: ['password', 'ssn', 'creditCard'],
    });

    // Add custom request interceptor
    apiClient.current?.addRequestInterceptor(async (config) => {
      console.log('[Custom Interceptor] Processing request', config.method);
      return config;
    });

    // Add custom response interceptor
    apiClient.current?.addResponseInterceptor(async (response) => {
      console.log('[Custom Interceptor] Processing response', response.status);
      return response;
    });

    // Add custom error interceptor
    apiClient.current?.addErrorInterceptor(async (error) => {
      console.log('[Custom Interceptor] Handling error', error.status);
      return error;
    });
  };

  /**
   * Fetch users securely
   */
  const fetchUsers = async () => {
    if (!apiClient.current) {
      setError('API client not initialized');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<User[]> = await apiClient.current.get<User[]>(
        '/users',
        {
          timeout: 10000,
          retry: {
            maxRetries: 3,
            initialDelayMs: 1000,
          },
        }
      );

      setUsers(response.data);
      onDataLoaded?.(response.data);

      console.log(`Fetched ${response.data.length} users in ${response.duration}ms`);
    } catch (err) {
      const apiError = err as ApiError;
      const errorMessage =
        apiError.message ||
        `Error: ${apiError.status} ${apiError.statusText}`;
      setError(errorMessage);
      console.error('Failed to fetch users:', apiError);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Create user securely
   */
  const createUser = async (userData: Partial<User>) => {
    if (!apiClient.current) {
      setError('API client not initialized');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<User> = await apiClient.current.post<User>(
        '/users',
        userData,
        {
          timeout: 10000,
        }
      );

      setUsers([...users, response.data]);
      console.log('User created successfully:', response.data);
    } catch (err) {
      const apiError = err as ApiError;
      const errorMessage =
        apiError.message ||
        `Error: ${apiError.status} ${apiError.statusText}`;
      setError(errorMessage);
      console.error('Failed to create user:', apiError);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Logout and clear tokens
   */
  const logout = () => {
    TokenManager.clearTokens();
    setTokenInfo(null);
    setUsers([]);
    console.log('User logged out, tokens cleared');
  };

  /**
   * Test encryption
   */
  const testEncryption = async () => {
    try {
      const sensitiveData = { creditCard: '4111-1111-1111-1111', pin: '1234' };

      console.log('Original data:', sensitiveData);

      const encrypted = await EncryptionService.encryptObject(sensitiveData);
      console.log('Encrypted:', encrypted);

      const decrypted = await EncryptionService.decryptObject<typeof sensitiveData>(encrypted);
      console.log('Decrypted:', decrypted);

      alert('Encryption test successful! Check console for details.');
    } catch (err) {
      alert(`Encryption test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Secure API Client Demo</h1>
        <p>Demonstrating secure API communication with JWT, encryption, and certificate pinning</p>
      </div>

      <div style={styles.section}>
        <h2>Authentication Status</h2>
        {tokenInfo ? (
          <div style={styles.statusBox}>
            <p>
              <strong>Token Valid:</strong> {tokenInfo.isValid ? 'Yes' : 'No'}
            </p>
            <p>
              <strong>Expires In:</strong> {tokenInfo.expiresIn}s
            </p>
            <p>
              <strong>Has Refresh Token:</strong> {tokenInfo.hasRefreshToken ? 'Yes' : 'No'}
            </p>
            <button onClick={logout} style={styles.button}>
              Logout
            </button>
          </div>
        ) : (
          <p style={styles.warning}>No authentication token found</p>
        )}
      </div>

      <div style={styles.section}>
        <h2>Certificate Pinning Status</h2>
        {certificatePinningStatus ? (
          <div style={styles.statusBox}>
            <p>
              <strong>Domains Pinned:</strong> {certificatePinningStatus.domains}
            </p>
            <p>
              <strong>Total Pins:</strong> {certificatePinningStatus.totalPins}
            </p>
            <p>
              <strong>Primary Pins:</strong> {certificatePinningStatus.primaryPins}
            </p>
            <p>
              <strong>Backup Pins:</strong> {certificatePinningStatus.backupPins}
            </p>
          </div>
        ) : (
          <p style={styles.warning}>Certificate pinning not initialized</p>
        )}
      </div>

      <div style={styles.section}>
        <h2>API Operations</h2>
        <div style={styles.buttonGroup}>
          <button onClick={fetchUsers} disabled={loading} style={styles.button}>
            {loading ? 'Loading...' : 'Fetch Users'}
          </button>
          <button
            onClick={() => createUser({ name: 'New User', email: 'user@example.com' })}
            disabled={loading}
            style={styles.button}
          >
            {loading ? 'Loading...' : 'Create User'}
          </button>
          <button onClick={testEncryption} style={styles.button}>
            Test Encryption
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {users.length > 0 && (
          <div style={styles.usersList}>
            <h3>Users ({users.length})</h3>
            {users.map((user) => (
              <div key={user.id} style={styles.userCard}>
                <p>
                  <strong>Name:</strong> {user.name}
                </p>
                <p>
                  <strong>Email:</strong> {user.email}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1000px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    marginBottom: '32px',
  },
  section: {
    marginBottom: '24px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: '#f9f9f9',
  },
  statusBox: {
    padding: '12px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    border: '1px solid #ddd',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#0066cc',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  errorBox: {
    padding: '12px',
    backgroundColor: '#ffe0e0',
    border: '1px solid #cc0000',
    borderRadius: '4px',
    color: '#cc0000',
    marginBottom: '16px',
  },
  usersList: {
    marginTop: '16px',
  },
  userCard: {
    padding: '12px',
    backgroundColor: '#fff',
    borderLeft: '4px solid #0066cc',
    marginBottom: '8px',
    borderRadius: '4px',
  },
  warning: {
    color: '#ff6600',
    fontStyle: 'italic',
  },
} as const;

export default SecureDataFetcher;
