import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import {
  EncryptionService,
  SecureStorageService,
  CertificatePinningService,
  TokenManager,
  PrivacyComplianceService,
  DataValidationService,
  PrivacyRegulation,
} from '@utils/security';

export const SecurityIntegrationExample: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [encryptedData, setEncryptedData] = useState('');
  const [consentStatus, setConsentStatus] = useState('');

  const storage = new SecureStorageService();
  const pinning = new CertificatePinningService();
  const tokenManager = new TokenManager();
  const privacy = new PrivacyComplianceService();

  const encryptionKey = 'your-256-bit-key-here-1234567890';

  /**
   * Example 1: Secure User Login with Validation
   * Demonstrates input validation, encryption, and secure token storage
   */
  const handleSecureLogin = async () => {
    // Validate email format
    if (!DataValidationService.validateEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // Validate password strength
    if (!DataValidationService.validatePassword(password)) {
      Alert.alert('Weak Password', 'Password must contain uppercase, lowercase, numbers, and special characters');
      return;
    }

    try {
      // Encrypt sensitive password before storing
      const encryptedPassword = EncryptionService.encrypt(password, encryptionKey);

      // Store encrypted credentials securely (with 24-hour TTL)
      storage.setItem('user_credentials', JSON.stringify({
        email,
        password: encryptedPassword,
      }), {
        encrypt: true,
        ttl: 86400, // 24 hours
      });

      // Simulate API authentication response with JWT token
      const mockJwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTYzMDAwMDAwMH0.signature';

      // Store JWT token securely
      tokenManager.setToken(mockJwtToken);

      setLoginStatus('✅ Login successful! Token stored securely.');
      setEmail('');
      setPassword('');
    } catch (error) {
      setLoginStatus('❌ Login failed. Please try again.');
    }
  };

  /**
   * Example 2: Encrypt Sensitive Data
   * Demonstrates AES-256-GCM encryption for data protection
   */
  const handleEncryptData = () => {
    const sensitiveData = 'Account: 1234567890, Balance: $50,000.00';

    if (!sensitiveData) {
      Alert.alert('Error', 'No data to encrypt');
      return;
    }

    const encrypted = EncryptionService.encrypt(sensitiveData, encryptionKey);
    setEncryptedData(encrypted);

    Alert.alert('Encryption Success', `Original length: ${sensitiveData.length}\nEncrypted length: ${encrypted.length}`);
  };

  /**
   * Example 3: Decrypt Data
   * Demonstrates AES-256-GCM decryption
   */
  const handleDecryptData = () => {
    if (!encryptedData) {
      Alert.alert('Error', 'No encrypted data to decrypt');
      return;
    }

    try {
      const decrypted = EncryptionService.decrypt(encryptedData, encryptionKey);
      Alert.alert('Decrypted Data', decrypted);
    } catch (error) {
      Alert.alert('Decryption Failed', 'Invalid encryption key or tampered data');
    }
  };

  /**
   * Example 4: Certificate Pinning Verification
   * Demonstrates public key pinning for MITM prevention
   */
  const handleVerifyCertificate = () => {
    const domain = 'api.crmt.app';
    const publicKey = 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKj34GkWqyLEQ2j900j+VrQkJZHjUUx';

    // Add certificate pin
    pinning.addPin(domain, publicKey);

    // Verify certificate before API call
    const isValid = pinning.verifyPin(domain, publicKey);

    if (isValid) {
      Alert.alert('Certificate Verified', `✅ ${domain} certificate is valid and pinned`);
    } else {
      Alert.alert('Certificate Invalid', '❌ Certificate does not match pinned key');
    }
  };

  /**
   * Example 5: Token Management with Auto-Refresh
   * Demonstrates JWT token lifecycle management
   */
  const handleTokenRefresh = () => {
    const mockAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig';

    tokenManager.setToken(mockAccessToken);

    if (tokenManager.isTokenValid()) {
      Alert.alert('Token Status', '✅ Valid access token ready for API requests');
    } else {
      const refreshToken = tokenManager.getRefreshToken();
      if (refreshToken) {
        Alert.alert('Token Expired', '🔄 Refresh token available for token renewal');
      }
    }
  };

  /**
   * Example 6: Privacy Compliance & Consent Management
   * Demonstrates GDPR/CCPA/LGPD compliance tracking
   */
  const handleAcceptPrivacy = () => {
    const userId = 'user-123';

    // Accept privacy policy for GDPR
    privacy.acceptPrivacyPolicy(userId, PrivacyRegulation.GDPR, '1.0');

    // Update user consent preferences
    privacy.updateUserConsent(userId, {
      marketing: true,
      analytics: true,
      thirdParty: false,
    });

    // Generate compliance report
    const report = privacy.generateComplianceReport(userId);

    setConsentStatus(`✅ Privacy policy accepted\n📋 Regulation: ${report.regulations[0]}\n🔒 Consent preferences saved`);
  };

  /**
   * Example 7: Data Subject Rights (Compliance)
   * Demonstrates GDPR/CCPA right to access and delete
   */
  const handleDataDeletion = async () => {
    const userId = 'user-123';

    // Request data deletion (GDPR Article 17, CCPA 1798.105)
    privacy.requestDataDeletion(userId);

    // Simulate processing
    privacy.updateDataDeletionStatus(userId, 'processing');

    // Simulate completion (normally takes time)
    setTimeout(() => {
      privacy.updateDataDeletionStatus(userId, 'completed');
      Alert.alert(
        'Data Deletion Complete',
        '✅ Your personal data has been permanently deleted from our systems\n📅 Completion time: 48 hours'
      );
    }, 2000);
  };

  /**
   * Example 8: Input Validation & Threat Prevention
   * Demonstrates SQL injection and XSS prevention
   */
  const handleValidateInput = () => {
    const testInputs = [
      { text: 'normal_input', type: 'Normal' },
      { text: "'; DROP TABLE users; --", type: 'SQL Injection' },
      { text: '<script>alert("xss")</script>', type: 'XSS' },
    ];

    let results = 'Input Validation Results:\n\n';

    testInputs.forEach(input => {
      const isSafeSQL = DataValidationService.preventSqlInjection(input.text);
      const isSafeXSS = DataValidationService.isSafeString(input.text);
      const status = isSafeSQL && isSafeXSS ? '✅ Safe' : '❌ Blocked';
      results += `${input.type}: ${status}\n`;
    });

    Alert.alert('Threat Detection', results);
  };

  /**
   * Example 9: Export User Data (GDPR Data Portability)
   * Demonstrates GDPR right to data portability
   */
  const handleExportUserData = () => {
    const userId = 'user-123';
    const userData = {
      profile: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      transactions: [
        { id: 'TX001', date: '2024-01-15', amount: 1000 },
        { id: 'TX002', date: '2024-01-20', amount: 2500 },
      ],
    };

    const exported = privacy.exportUserData(userId, userData);

    Alert.alert(
      'Data Export',
      `✅ Your data has been exported\n📦 Format: ${exported.format}\n📊 Records: ${JSON.stringify(exported.data).length} bytes`
    );
  };

  /**
   * Example 10: Secure Token Generation
   * Demonstrates cryptographically secure token generation
   */
  const handleGenerateToken = () => {
    const secureToken = EncryptionService.generateSecureToken(32);
    Alert.alert('Secure Token Generated', `Token: ${secureToken.substring(0, 16)}...`);
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#f5f5f5' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#1a1a2e' }}>
        🔒 Security Integration Examples
      </Text>

      {/* Example 1: Secure Login */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>1️⃣ Secure Login</Text>
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 8, borderRadius: 4 }}
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, marginBottom: 8, borderRadius: 4 }}
        />
        <TouchableOpacity
          onPress={handleSecureLogin}
          style={{ backgroundColor: '#0066cc', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Login</Text>
        </TouchableOpacity>
        {loginStatus && <Text style={{ marginTop: 8, color: '#666' }}>{loginStatus}</Text>}
      </View>

      {/* Example 2-3: Encryption/Decryption */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>2️⃣ Encrypt/Decrypt Data</Text>
        <TouchableOpacity
          onPress={handleEncryptData}
          style={{ backgroundColor: '#27ae60', padding: 10, borderRadius: 4, marginBottom: 8 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Encrypt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDecryptData}
          style={{ backgroundColor: '#2980b9', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Decrypt</Text>
        </TouchableOpacity>
      </View>

      {/* Example 4: Certificate Pinning */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>3️⃣ Certificate Pinning</Text>
        <TouchableOpacity
          onPress={handleVerifyCertificate}
          style={{ backgroundColor: '#e74c3c', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Verify Certificate</Text>
        </TouchableOpacity>
      </View>

      {/* Example 5: Token Management */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>4️⃣ Token Management</Text>
        <TouchableOpacity
          onPress={handleTokenRefresh}
          style={{ backgroundColor: '#f39c12', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Check Token</Text>
        </TouchableOpacity>
      </View>

      {/* Example 6: Privacy Compliance */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>5️⃣ Privacy Compliance</Text>
        <TouchableOpacity
          onPress={handleAcceptPrivacy}
          style={{ backgroundColor: '#9b59b6', padding: 10, borderRadius: 4, marginBottom: 8 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Accept Privacy Policy</Text>
        </TouchableOpacity>
        {consentStatus && <Text style={{ marginTop: 8, color: '#666' }}>{consentStatus}</Text>}
      </View>

      {/* Example 7: Data Deletion */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>6️⃣ Data Deletion (GDPR)</Text>
        <TouchableOpacity
          onPress={handleDataDeletion}
          style={{ backgroundColor: '#c0392b', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Request Data Deletion</Text>
        </TouchableOpacity>
      </View>

      {/* Example 8: Input Validation */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>7️⃣ Threat Detection</Text>
        <TouchableOpacity
          onPress={handleValidateInput}
          style={{ backgroundColor: '#16a085', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Test Input Validation</Text>
        </TouchableOpacity>
      </View>

      {/* Example 9: Data Export */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>8️⃣ Export User Data</Text>
        <TouchableOpacity
          onPress={handleExportUserData}
          style={{ backgroundColor: '#2980b9', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Export Data (GDPR)</Text>
        </TouchableOpacity>
      </View>

      {/* Example 10: Secure Token Generation */}
      <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 8, marginBottom: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>9️⃣ Secure Token</Text>
        <TouchableOpacity
          onPress={handleGenerateToken}
          style={{ backgroundColor: '#8e44ad', padding: 10, borderRadius: 4 }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Generate Token</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};
