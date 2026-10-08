import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();
const auth = admin.auth();

// Interface for validation results
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Email validation
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

// Password strength validation
export const validatePasswordStrength = (password: string): ValidationResult => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// User data validation
export const validateUserData = (data: any): ValidationResult => {
  const errors: string[] = [];

  if (!data.email || !validateEmail(data.email)) {
    errors.push('Invalid email format');
  }

  if (!data.displayName || data.displayName.length === 0 || data.displayName.length > 255) {
    errors.push('Display name must be between 1 and 255 characters');
  }

  if (data.photoURL && !data.photoURL.startsWith('https://')) {
    errors.push('Photo URL must be HTTPS');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Project data validation
export const validateProjectData = (data: any): ValidationResult => {
  const errors: string[] = [];

  if (!data.name || data.name.length === 0 || data.name.length > 255) {
    errors.push('Project name must be between 1 and 255 characters');
  }

  if (data.description && data.description.length > 5000) {
    errors.push('Project description must not exceed 5000 characters');
  }

  if (!['active', 'archived'].includes(data.status)) {
    errors.push('Invalid project status');
  }

  if (!data.ownerId) {
    errors.push('Project must have an owner');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Task data validation
export const validateTaskData = (data: any): ValidationResult => {
  const errors: string[] = [];

  if (!data.title || data.title.length === 0 || data.title.length > 500) {
    errors.push('Task title must be between 1 and 500 characters');
  }

  if (data.description && data.description.length > 5000) {
    errors.push('Task description must not exceed 5000 characters');
  }

  if (!['todo', 'in_progress', 'completed'].includes(data.status)) {
    errors.push('Invalid task status');
  }

  if (data.priority && !['low', 'medium', 'high'].includes(data.priority)) {
    errors.push('Invalid task priority');
  }

  if (data.dueDate && typeof data.dueDate !== 'number') {
    errors.push('Due date must be a timestamp');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Encryption helper for sensitive data
export const encryptData = (plaintext: string, password: string): { encrypted: string; iv: string; salt: string } => {
  const salt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted + authTag.toString('hex'),
    iv: iv.toString('hex'),
    salt: salt.toString('hex')
  };
};

// Decryption helper
export const decryptData = (encrypted: string, password: string, iv: string, salt: string): string => {
  const key = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));

  const encryptedData = encrypted.slice(0, -32);
  const authTag = Buffer.from(encrypted.slice(-32), 'hex');
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

// Cloud Function: Validate user creation
export const validateUserCreate = functions.auth.user().onCreate(async (user) => {
  try {
    const validation = validateUserData({
      email: user.email,
      displayName: user.displayName || 'New User',
      photoURL: user.photoURL || ''
    });

    if (!validation.isValid) {
      console.warn('User validation failed:', validation.errors);
      // You might want to delete the user or flag for manual review
    }

    // Create user document
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'New User',
      photoURL: user.photoURL || '',
      emailVerified: user.emailVerified,
      role: 'user',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      security: {
        twoFactorEnabled: false,
        lastPasswordChange: admin.firestore.FieldValue.serverTimestamp()
      }
    });

    // Log activity
    await logActivity(user.uid, 'account_created', {
      email: user.email,
      provider: user.providerData[0]?.providerId || 'email'
    });
  } catch (error) {
    console.error('Error validating user creation:', error);
  }
});

// Cloud Function: Validate user deletion
export const validateUserDelete = functions.auth.user().onDelete(async (user) => {
  try {
    // Delete user document and all related data
    const userDoc = db.collection('users').doc(user.uid);

    // Delete subcollections
    const subcollections = ['preferences', 'security', 'sessions'];

    for (const subcollection of subcollections) {
      const snapshot = await userDoc.collection(subcollection).get();
      const batch = db.batch();

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
    }

    // Delete user document
    await userDoc.delete();

    // Log activity
    await logActivity(user.uid, 'account_deleted', {
      email: user.email
    });
  } catch (error) {
    console.error('Error validating user deletion:', error);
  }
});

// Cloud Function: Validate and encrypt sensitive data
export const encryptSensitiveData = functions.firestore
  .document('users/{uid}/sensitive/{docId}')
  .onWrite(async (change, context) => {
    try {
      const { uid, docId } = context.params;
      const newData = change.after.data();

      if (!newData) return;

      // Check if data needs encryption
      if (newData.plaintext && !newData.encrypted) {
        const encryptionKey = process.env.ENCRYPTION_KEY;
        if (!encryptionKey) {
          throw new Error('Encryption key not configured');
        }

        const { encrypted, iv, salt } = encryptData(newData.plaintext, encryptionKey);

        await db.collection('users').doc(uid).collection('encrypted').doc(docId).set({
          encryptedData: encrypted,
          iv,
          salt,
          userId: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          type: newData.type || 'generic'
        });

        // Delete plaintext version
        await db.collection('users').doc(uid).collection('sensitive').doc(docId).delete();
      }
    } catch (error) {
      console.error('Error encrypting sensitive data:', error);
    }
  });

// Cloud Function: Validate project member access
export const validateProjectMemberAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { projectId, userId, action } = data;

    // Verify project exists and user is owner
    const projectDoc = await db.collection('projects').doc(projectId).get();

    if (!projectDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Project not found');
    }

    const project = projectDoc.data();
    if (project?.ownerId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'You are not the project owner');
    }

    // Perform action
    if (action === 'add') {
      await db.collection('projects').doc(projectId).collection('members').doc(userId).set({
        role: data.role || 'viewer',
        joinedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await logActivity(context.auth.uid, 'member_added', {
        projectId,
        memberId: userId,
        role: data.role
      });
    } else if (action === 'remove') {
      await db.collection('projects').doc(projectId).collection('members').doc(userId).delete();

      await logActivity(context.auth.uid, 'member_removed', {
        projectId,
        memberId: userId
      });
    }

    return { success: true };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Error validating member access');
  }
});

// Cloud Function: Rate limiting
export const checkRateLimit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const { uid } = context.auth;
    const { type, limit, window } = data; // window in seconds

    const limitDoc = await db.collection('rateLimits').doc(uid).get();

    if (!limitDoc.exists) {
      // First request
      await db.collection('rateLimits').doc(uid).set({
        [type]: {
          count: 1,
          resetAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + window * 1000))
        }
      });
      return { allowed: true, remaining: limit - 1 };
    }

    const limits = limitDoc.data();
    const now = new Date();
    const typeLimit = limits?.[type];

    if (!typeLimit || typeLimit.resetAt.toDate() < now) {
      // Reset limit
      await db.collection('rateLimits').doc(uid).update({
        [type]: {
          count: 1,
          resetAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + window * 1000))
        }
      });
      return { allowed: true, remaining: limit - 1 };
    }

    if (typeLimit.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: typeLimit.resetAt.toDate()
      };
    }

    // Increment counter
    await db.collection('rateLimits').doc(uid).update({
      [`${type}.count`]: typeLimit.count + 1
    });

    return {
      allowed: true,
      remaining: limit - typeLimit.count - 1
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    throw new functions.https.HttpsError('internal', 'Error checking rate limit');
  }
});

// Helper function to log activity
async function logActivity(userId: string, action: string, details: any): Promise<void> {
  try {
    await db.collection('activityLogs').add({
      userId,
      action,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: details.ipAddress || 'unknown'
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

// Cloud Function: Backup user data automatically
export const backupUserData = functions.pubsub.schedule('every day 02:00').onRun(async (context) => {
  try {
    const usersSnapshot = await db.collection('users').get();

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();

      // Create backup document
      await db.collection('backups').add({
        userId: uid,
        data: userData,
        backupDate: admin.firestore.FieldValue.serverTimestamp(),
        type: 'daily_backup'
      });

      // Keep only last 30 days of backups
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const oldBackups = await db.collection('backups')
        .where('userId', '==', uid)
        .where('backupDate', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
        .get();

      const batch = db.batch();
      oldBackups.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    console.log('Backup completed successfully');
  } catch (error) {
    console.error('Backup error:', error);
  }
});

// Export functions
export default {
  validateUserCreate,
  validateUserDelete,
  encryptSensitiveData,
  validateProjectMemberAccess,
  checkRateLimit,
  backupUserData
};
