/**
 * LoginForm - Example secure login component
 * Demonstrates proper use of the secure API client
 */

import React, { useState } from 'react';
import { useAPI } from '../context/APIContext';
import { EncryptionService } from '../services/security/EncryptionService';

interface LoginFormProps {
  onLoginSuccess?: () => void;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const { login, isInitialized } = useAPI();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Handle login submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate input
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      if (!email.includes('@')) {
        throw new Error('Invalid email format');
      }

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      // Attempt login
      await login({ email, password });

      // Clear form
      setEmail('');
      setPassword('');

      // Call success callback
      onLoginSuccess?.();

      console.log('[LoginForm] Login successful');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      console.error('[LoginForm] Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Test encryption (for demonstration)
   */
  const handleTestEncryption = async () => {
    try {
      const testData = {
        email: email,
        timestamp: new Date().toISOString(),
      };

      const encrypted = await EncryptionService.encryptObject(testData);
      const decrypted = await EncryptionService.decryptObject(encrypted);

      if (decrypted.email !== testData.email) {
        throw new Error('Encryption test failed');
      }

      alert('Encryption test passed! Data was properly encrypted and decrypted.');
    } catch (err) {
      alert(`Encryption test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (!isInitialized) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <p>Initializing security services...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.header}>
          <h1>Secure Login</h1>
          <p>Demonstrating secure API communication</p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div style={styles.formGroup}>
          <label htmlFor="email" style={styles.label}>
            Email Address
          </label>
          <input
            id="email"
            type="email"
            placeholder="your@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={styles.input}
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="password" style={styles.label}>
            Password
          </label>
          <div style={styles.passwordWrapper}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={styles.passwordInput}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={styles.toggleButton}
              disabled={loading}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <small style={styles.helpText}>
            Password must be at least 8 characters
          </small>
        </div>

        <div style={styles.buttonGroup}>
          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitButton,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <button
            type="button"
            onClick={handleTestEncryption}
            disabled={loading || !email}
            style={{
              ...styles.testButton,
              opacity: loading || !email ? 0.6 : 1,
            }}
          >
            Test Encryption
          </button>
        </div>

        <div style={styles.infoBox}>
          <h3>Security Features Enabled</h3>
          <ul>
            <li>JWT Token Management</li>
            <li>HTTPS/TLS Communication</li>
            <li>Certificate Pinning (when configured)</li>
            <li>Payload Encryption (when enabled)</li>
            <li>Automatic Retry with Backoff</li>
            <li>Secure Logging (tokens not logged)</li>
            <li>CSRF Protection</li>
            <li>Security Headers (CSP, HSTS, etc.)</li>
          </ul>
        </div>

        <div style={styles.warningBox}>
          <strong>Demo Mode:</strong> This is a demonstration component. In production:
          <ul>
            <li>Ensure HTTPS is always used</li>
            <li>Implement proper rate limiting</li>
            <li>Use certificate pinning for domains</li>
            <li>Enable encryption for sensitive fields</li>
            <li>Implement multi-factor authentication</li>
            <li>Set up proper password hashing (server-side)</li>
          </ul>
        </div>
      </form>
    </div>
  );
};

/**
 * Styles for the login form
 */
const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  form: {
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '400px',
  },
  header: {
    marginBottom: '30px',
    textAlign: 'center' as const,
  },
  errorBox: {
    backgroundColor: '#ffe0e0',
    border: '1px solid #cc0000',
    color: '#cc0000',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold' as const,
    fontSize: '14px',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  passwordWrapper: {
    display: 'flex',
    gap: '8px',
  },
  passwordInput: {
    flex: 1,
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  toggleButton: {
    padding: '10px 15px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer' as const,
    fontSize: '12px',
  },
  helpText: {
    display: 'block',
    marginTop: '4px',
    color: '#666',
    fontSize: '12px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  submitButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#0066cc',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    cursor: 'pointer' as const,
  },
  testButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#666',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer' as const,
  },
  infoBox: {
    backgroundColor: '#e8f4f8',
    border: '1px solid #0066cc',
    padding: '15px',
    borderRadius: '4px',
    marginBottom: '15px',
    fontSize: '13px',
  },
  warningBox: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ff9800',
    padding: '15px',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#856404',
  },
  loadingBox: {
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
  },
} as const;

export default LoginForm;
