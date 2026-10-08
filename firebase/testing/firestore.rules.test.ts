/**
 * Firestore Security Rules Testing
 * Testes para validar a segurança das regras
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  assertFails,
  assertSucceeds,
  withSecurityRulesDisabled
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

// Setup
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'lucide-react-test',
    firestore: {
      rules: require('../firestore.rules'),
      port: 8080
    }
  });
});

// Cleanup
afterAll(async () => {
  await testEnv.cleanup();
});

// Clear database between tests
beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('User Authentication and Authorization', () => {
  test('Unauthenticated user cannot read user documents', async () => {
    const unauthed = testEnv.unauthenticatedContext();
    const userRef = doc(unauthed.firestore(), 'users', 'user123');

    await assertFails(getDoc(userRef));
  });

  test('User can read their own document', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const userRef = doc(authed.firestore(), 'users', 'user123');

    // Create user document first
    await setDoc(userRef, {
      email: 'user@example.com',
      displayName: 'Test User',
      role: 'user',
      emailVerified: false,
      createdAt: new Date()
    });

    await assertSucceeds(getDoc(userRef));
  });

  test('User cannot read other users documents', async () => {
    const user1 = testEnv.authenticatedContext('user1');
    const user2 = testEnv.authenticatedContext('user2');

    // Create user2 document
    const user2Ref = doc(user1.firestore(), 'users', 'user2');
    await setDoc(user2Ref, {
      email: 'user2@example.com',
      displayName: 'User 2',
      role: 'user',
      emailVerified: false,
      createdAt: new Date()
    });

    // User1 tries to read user2 document
    const user1Context = testEnv.authenticatedContext('user1');
    const readRef = doc(user1Context.firestore(), 'users', 'user2');

    await assertFails(getDoc(readRef));
  });

  test('User cannot write password field', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const userRef = doc(authed.firestore(), 'users', 'user123');

    await assertFails(setDoc(userRef, {
      email: 'user@example.com',
      password: 'hashedpassword', // This should fail
      displayName: 'Test User'
    }));
  });

  test('User cannot update their role', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const userRef = doc(authed.firestore(), 'users', 'user123');

    // Create initial user
    await withSecurityRulesDisabled(async (context) => {
      await setDoc(userRef, {
        email: 'user@example.com',
        displayName: 'Test User',
        role: 'user',
        emailVerified: false,
        createdAt: new Date()
      });
    });

    // Try to update role
    await assertFails(updateDoc(userRef, { role: 'admin' }));
  });
});

describe('Email Validation', () => {
  test('Invalid email format is rejected on creation', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const userRef = doc(authed.firestore(), 'users', 'user123');

    await assertFails(setDoc(userRef, {
      email: 'invalid-email', // Invalid format
      displayName: 'Test User',
      role: 'user',
      emailVerified: false,
      createdAt: new Date()
    }));
  });

  test('Valid email format is accepted', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const userRef = doc(authed.firestore(), 'users', 'user123');

    await assertSucceeds(setDoc(userRef, {
      email: 'user@example.com',
      displayName: 'Test User',
      role: 'user',
      emailVerified: false,
      createdAt: new Date()
    }));
  });
});

describe('Project Access Control', () => {
  test('Project owner can read their project', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const projectRef = doc(owner.firestore(), 'projects', 'project1');

    // Create project
    await setDoc(projectRef, {
      name: 'Test Project',
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    });

    // Owner can read
    await assertSucceeds(getDoc(projectRef));
  });

  test('Non-member cannot read project', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const nonMember = testEnv.authenticatedContext('user456');

    const projectRef = doc(owner.firestore(), 'projects', 'project1');
    await setDoc(projectRef, {
      name: 'Test Project',
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    });

    // Non-member cannot read
    const nonMemberRef = doc(nonMember.firestore(), 'projects', 'project1');
    await assertFails(getDoc(nonMemberRef));
  });

  test('Only owner can modify project', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const other = testEnv.authenticatedContext('user456');

    const projectRef = doc(owner.firestore(), 'projects', 'project1');
    await setDoc(projectRef, {
      name: 'Test Project',
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    });

    // Other user cannot modify
    const otherRef = doc(other.firestore(), 'projects', 'project1');
    await assertFails(updateDoc(otherRef, { name: 'New Name' }));
  });

  test('Project name must have valid length', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const projectRef = doc(owner.firestore(), 'projects', 'project1');

    // Empty name should fail
    await assertFails(setDoc(projectRef, {
      name: '',
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    }));

    // Too long name should fail
    await assertFails(setDoc(projectRef, {
      name: 'a'.repeat(256),
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    }));
  });

  test('Project status must be valid', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const projectRef = doc(owner.firestore(), 'projects', 'project1');

    await assertFails(setDoc(projectRef, {
      name: 'Test Project',
      ownerId: 'owner123',
      status: 'invalid_status', // Invalid status
      createdAt: new Date()
    }));
  });
});

describe('Task Access Control', () => {
  test('Owner can create task in their project', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const projectRef = doc(owner.firestore(), 'projects', 'project1');
    const taskRef = doc(owner.firestore(), 'projects', 'project1', 'tasks', 'task1');

    // Create project first
    await setDoc(projectRef, {
      name: 'Test Project',
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    });

    // Create task
    await assertSucceeds(setDoc(taskRef, {
      title: 'Test Task',
      status: 'todo',
      createdAt: new Date()
    }));
  });

  test('Task title validation', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const projectRef = doc(owner.firestore(), 'projects', 'project1');
    const taskRef = doc(owner.firestore(), 'projects', 'project1', 'tasks', 'task1');

    // Create project first
    await setDoc(projectRef, {
      name: 'Test Project',
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    });

    // Empty title should fail
    await assertFails(setDoc(taskRef, {
      title: '',
      status: 'todo',
      createdAt: new Date()
    }));
  });

  test('Task status must be valid', async () => {
    const owner = testEnv.authenticatedContext('owner123');
    const projectRef = doc(owner.firestore(), 'projects', 'project1');
    const taskRef = doc(owner.firestore(), 'projects', 'project1', 'tasks', 'task1');

    // Create project first
    await setDoc(projectRef, {
      name: 'Test Project',
      ownerId: 'owner123',
      status: 'active',
      createdAt: new Date()
    });

    // Invalid status should fail
    await assertFails(setDoc(taskRef, {
      title: 'Test Task',
      status: 'invalid_status',
      createdAt: new Date()
    }));
  });
});

describe('Activity Logging', () => {
  test('Users cannot write to activity logs directly', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const logRef = doc(authed.firestore(), 'activityLogs', 'log1');

    await assertFails(setDoc(logRef, {
      userId: 'user123',
      action: 'test',
      timestamp: new Date()
    }));
  });

  test('Activity logs cannot be deleted', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const logRef = doc(authed.firestore(), 'activityLogs', 'log1');

    // Create log with disabled rules
    await withSecurityRulesDisabled(async (context) => {
      await setDoc(logRef, {
        userId: 'user123',
        action: 'test',
        timestamp: new Date()
      });
    });

    // Try to delete
    await assertFails(deleteDoc(logRef));
  });
});

describe('Encrypted Data Storage', () => {
  test('User can store encrypted data', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const encryptedRef = doc(authed.firestore(), 'users', 'user123', 'encrypted', 'data1');

    await assertSucceeds(setDoc(encryptedRef, {
      encryptedData: 'encrypted_content',
      iv: 'initialization_vector',
      salt: 'salt_value',
      userId: 'user123',
      createdAt: new Date(),
      type: 'sensitive'
    }));
  });

  test('Encrypted data requires all required fields', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const encryptedRef = doc(authed.firestore(), 'users', 'user123', 'encrypted', 'data1');

    // Missing encryptedData
    await assertFails(setDoc(encryptedRef, {
      iv: 'initialization_vector',
      salt: 'salt_value',
      userId: 'user123',
      createdAt: new Date()
    }));
  });
});

describe('Notifications', () => {
  test('User can read their own notifications', async () => {
    const authed = testEnv.authenticatedContext('user123');
    const notifRef = doc(authed.firestore(), 'notifications', 'notif1');

    await assertSucceeds(setDoc(notifRef, {
      userId: 'user123',
      type: 'message',
      read: false,
      createdAt: new Date()
    }));
  });

  test('User cannot read other users notifications', async () => {
    const user1 = testEnv.authenticatedContext('user1');
    const user2 = testEnv.authenticatedContext('user2');

    const notifRef = doc(user1.firestore(), 'notifications', 'notif1');
    await setDoc(notifRef, {
      userId: 'user1',
      type: 'message',
      read: false,
      createdAt: new Date()
    });

    // User2 cannot read user1's notifications
    const user2NotifRef = doc(user2.firestore(), 'notifications', 'notif1');
    await assertFails(getDoc(user2NotifRef));
  });
});
