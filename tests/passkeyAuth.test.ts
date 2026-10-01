import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { StorageAdapter, StoragePasskeyCredential, StorageUser } from '../src/server/storage/types';
import { createUniversalToken, createPasskeyChallengeToken, verifyPasskeyChallengeToken } from '../src/server/api/authUtils';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

const mockVerifyRegistrationResponse = vi.fn();
const mockVerifyAuthenticationResponse = vi.fn();

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    verifyRegistrationResponse: (...args: any[]) => mockVerifyRegistrationResponse(...args),
    verifyAuthenticationResponse: (...args: any[]) => mockVerifyAuthenticationResponse(...args),
  };
});

class MockPasskeyStorageAdapter {
  users: Map<string, StorageUser> = new Map();
  passkeys: Map<string, StoragePasskeyCredential> = new Map();

  async getUserById(id: string): Promise<StorageUser | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<StorageUser | null> {
    return Array.from(this.users.values()).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async createUser(user: any): Promise<StorageUser> {
    const u = { ...user, token_version: 1, system_role: user.system_role || 'user' };
    this.users.set(user.id, u);
    return u;
  }

  async updateUser(id: string, updates: any): Promise<void> {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, ...updates });
  }

  async listUsers(): Promise<StorageUser[]> {
    return Array.from(this.users.values());
  }

  async bumpTokenVersion(id: string): Promise<number> {
    const u = this.users.get(id);
    if (u) u.token_version = (u.token_version || 1) + 1;
    return u?.token_version || 1;
  }

  // Password reset tokens (stub)
  async createPasswordResetToken() {}
  async getPasswordResetToken() { return null; }
  async markPasswordResetTokenUsed() {}

  // Organizations & Pools (stubs)
  async getOrgById() { return null; }
  async listOrgsByOwner() { return []; }
  async createOrg(org: any) { return org; }
  async updateOrgTier() {}
  async getPoolById() { return null; }
  async listPoolsForUser() { return []; }
  async createPool(pool: any) { return pool; }
  async updatePool() {}
  async deletePool() {}
  async getPoolMember() { return null; }
  async listPoolMembers() { return []; }
  async upsertPoolMember() {}
  async updateMemberRole() {}
  async removePoolMember() {}
  async countPoolsByOrg() { return 0; }
  async countPersonalPools() { return 0; }
  async adjustMemberBalance() {}
  async getItemById() { return null; }
  async listItemsByPool() { return []; }
  async createItem(item: any) { return item; }
  async updateItem() {}
  async deleteItem() {}
  async adjustItemStock() {}
  async createTransaction(tx: any) { return tx; }
  async listTransactionsByPool() { return []; }
  async getShoppingItemById() { return null; }
  async listShoppingItemsByPool() { return []; }
  async createShoppingItem(item: any) { return item; }
  async updateShoppingItem() {}
  async deleteShoppingItem() {}
  async getPollById() { return null; }
  async listPollsByPool() { return []; }
  async createPoll(poll: any) { return poll; }
  async votePoll() {}
  async deletePoll() {}
  async createNotification(n: any) { return n; }
  async listNotificationsByUser() { return []; }
  async markNotificationRead() {}
  async markAllNotificationsRead() {}
  async deleteNotification() { return true; }
  async listWebhooksByPool() { return []; }
  async createWebhook(w: any) { return w; }
  async deleteWebhook() { return true; }
  async getSsoConfigByDomain() { return null; }
  async createTelemetryEvent(e: any) { return e; }
  async getTelemetryStats() { return {} as any; }
  async listAffiliateProducts() { return []; }
  async recordAffiliateClick() {}
  async getAffiliateStats() { return {} as any; }
  async getPoolSavingsSummary() { return {} as any; }
  async getGlobalSavingsLeaderboard() { return {} as any; }

  // Passkey implementation
  async createPasskeyCredential(cred: StoragePasskeyCredential): Promise<StoragePasskeyCredential> {
    this.passkeys.set(cred.id, { ...cred, created_at: new Date().toISOString() });
    return this.passkeys.get(cred.id)!;
  }

  async getPasskeyCredentialById(id: string): Promise<StoragePasskeyCredential | null> {
    return this.passkeys.get(id) || null;
  }

  async getPasskeyCredentialsByUserId(userId: string): Promise<StoragePasskeyCredential[]> {
    return Array.from(this.passkeys.values()).filter(p => p.user_id === userId);
  }

  async updatePasskeyCredentialCounter(id: string, counter: number, lastUsedAt?: string): Promise<void> {
    const cred = this.passkeys.get(id);
    if (cred) {
      cred.counter = counter;
      cred.last_used_at = lastUsedAt || new Date().toISOString();
    }
  }

  async deletePasskeyCredential(id: string, userId: string): Promise<boolean> {
    const cred = this.passkeys.get(id);
    if (cred && cred.user_id === userId) {
      return this.passkeys.delete(id);
    }
    return false;
  }
}

describe('Passkey / WebAuthn Authentication Suite', () => {
  let storage: MockPasskeyStorageAdapter;
  let app: any;
  const jwtSecret = 'test-passkey-jwt-secret-at-least-32-chars-long!';
  let testUser: StorageUser;
  let userToken: string;

  beforeEach(async () => {
    storage = new MockPasskeyStorageAdapter();
    testUser = await storage.createUser({
      id: 'u_passkey_test_1',
      email: 'passkey.user@example.com',
      name: 'Passkey Pioneer',
      system_role: 'user',
      token_version: 1
    });

    userToken = await createUniversalToken({
      userId: testUser.id,
      email: testUser.email,
      name: testUser.name,
      systemRole: testUser.system_role,
      tokenVersion: 1
    }, jwtSecret);

    app = createUniversalApi(storage as any as StorageAdapter, jwtSecret);
  });

  describe('Stateless Challenge Cryptography', () => {
    it('creates and verifies valid challenge tokens within TTL', async () => {
      const challengeToken = await createPasskeyChallengeToken(
        { challenge: 'random_raw_challenge_123', userId: testUser.id },
        jwtSecret,
        300
      );

      expect(typeof challengeToken).toBe('string');
      const payload = await verifyPasskeyChallengeToken(challengeToken, jwtSecret);
      expect(payload).not.toBeNull();
      expect(payload?.challenge).toBe('random_raw_challenge_123');
      expect(payload?.userId).toBe(testUser.id);
    });

    it('rejects tampered or malformed challenge tokens', async () => {
      const token = await createPasskeyChallengeToken(
        { challenge: 'secure_challenge', userId: testUser.id },
        jwtSecret
      );
      const tampered = token.slice(0, -6) + 'abcdef';
      const result = await verifyPasskeyChallengeToken(tampered, jwtSecret);
      expect(result).toBeNull();
    });

    it('rejects expired challenge tokens', async () => {
      const expiredToken = await createPasskeyChallengeToken(
        { challenge: 'expired_challenge', userId: testUser.id },
        jwtSecret,
        -10 // already expired
      );
      const result = await verifyPasskeyChallengeToken(expiredToken, jwtSecret);
      expect(result).toBeNull();
    });
  });

  describe('Passkey Registration Flow (/api/auth/passkey/register-*)', () => {
    it('rejects unauthenticated requests to register-options', async () => {
      const res = await app.request('/api/auth/passkey/register-options', {
        method: 'POST'
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Authentication required');
    });

    it('returns registration options with signed challengeToken for authenticated user', async () => {
      const res = await app.request('/api/auth/passkey/register-options', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          Host: 'localhost:3000'
        }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.options).toBeDefined();
      expect(data.options.challenge).toBeDefined();
      expect(data.options.rp.id).toBe('localhost');
      expect(data.options.user.name).toBe(testUser.email);
      expect(data.challengeToken).toBeDefined();

      const payload = await verifyPasskeyChallengeToken(data.challengeToken, jwtSecret);
      expect(payload?.challenge).toBe(data.options.challenge);
      expect(payload?.userId).toBe(testUser.id);
    });

    it('rejects registration verification with missing payload', async () => {
      const res = await app.request('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('required');
    });

    it('rejects registration verification with mismatched user in challenge token', async () => {
      const forgedChallengeToken = await createPasskeyChallengeToken(
        { challenge: 'test_challenge', userId: 'u_another_user' },
        jwtSecret
      );

      const res = await app.request('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          response: { id: 'mock_cred_1', rawId: 'mock_cred_1', type: 'public-key' },
          challengeToken: forgedChallengeToken
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('mismatch');
    });

    it('successfully verifies registration response and persists credential', async () => {
      const mockRawPubKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const challengeToken = await createPasskeyChallengeToken(
        { challenge: 'valid_registration_challenge', userId: testUser.id },
        jwtSecret
      );

      mockVerifyRegistrationResponse.mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          fmt: 'none',
          aaguid: '00000000-0000-0000-0000-000000000000',
          credentialType: 'public-key',
          credential: {
            id: 'cred_test_abc_123',
            publicKey: mockRawPubKey,
            counter: 0,
            transports: ['internal']
          },
          attestationObject: new Uint8Array(),
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          origin: 'http://localhost:3000',
          rpID: 'localhost'
        }
      });

      const res = await app.request('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
          Host: 'localhost:3000'
        },
        body: JSON.stringify({
          response: {
            id: 'cred_test_abc_123',
            rawId: 'cred_test_abc_123',
            type: 'public-key',
            response: { clientDataJSON: '', attestationObject: '' }
          },
          challengeToken,
          name: "Work Laptop Touch ID"
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.credential.id).toBe('cred_test_abc_123');
      expect(data.credential.name).toBe("Work Laptop Touch ID");

      // Verify stored in DB
      const stored = await storage.getPasskeyCredentialById('cred_test_abc_123');
      expect(stored).not.toBeNull();
      expect(stored?.user_id).toBe(testUser.id);
      expect(stored?.public_key).toBe(isoBase64URL.fromBuffer(mockRawPubKey));
      expect(stored?.counter).toBe(0);
    });
  });

  describe('Passkey Authentication Flow (/api/auth/passkey/auth-*)', () => {
    beforeEach(async () => {
      // Seed a registered passkey for testUser
      const mockRawPubKey = new Uint8Array([10, 20, 30, 40, 50]);
      await storage.createPasskeyCredential({
        id: 'cred_registered_99',
        user_id: testUser.id,
        public_key: isoBase64URL.fromBuffer(mockRawPubKey),
        counter: 1,
        device_type: 'multiDevice',
        backed_up: true,
        transports: ['internal'],
        name: 'iPhone 16 Passkey'
      });
    });

    it('generates authentication options without email (discoverable credentials)', async () => {
      const res = await app.request('/api/auth/passkey/auth-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Host: 'localhost:3000' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.options.challenge).toBeDefined();
      expect(data.options.rpId).toBe('localhost');
      expect(data.challengeToken).toBeDefined();
    });

    it('generates authentication options with email targeting allowedCredentials', async () => {
      const res = await app.request('/api/auth/passkey/auth-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Host: 'localhost:3000' },
        body: JSON.stringify({ email: testUser.email })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.options.allowCredentials).toBeDefined();
      expect(data.options.allowCredentials.length).toBe(1);
      expect(data.options.allowCredentials[0].id).toBe('cred_registered_99');
    });

    it('rejects auth-verify if passkey is unrecognized', async () => {
      const challengeToken = await createPasskeyChallengeToken(
        { challenge: 'random_auth_challenge' },
        jwtSecret
      );

      const res = await app.request('/api/auth/passkey/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: { id: 'unknown_cred_id' },
          challengeToken
        })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('not recognized');
    });

    it('successfully verifies valid passkey assertion and issues session token', async () => {
      const challengeToken = await createPasskeyChallengeToken(
        { challenge: 'auth_challenge_valid' },
        jwtSecret
      );

      mockVerifyAuthenticationResponse.mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          newCounter: 2,
          credentialID: 'cred_registered_99',
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          origin: 'http://localhost:3000',
          rpID: 'localhost'
        }
      });

      const res = await app.request('/api/auth/passkey/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Host: 'localhost:3000' },
        body: JSON.stringify({
          response: {
            id: 'cred_registered_99',
            rawId: 'cred_registered_99',
            type: 'public-key',
            response: { clientDataJSON: '', authenticatorData: '', signature: '' }
          },
          challengeToken
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.id).toBe(testUser.id);
      expect(data.user.email).toBe(testUser.email);
      expect(data.user.hasPasskey).toBe(true);

      // Verify counter was incremented in storage
      const updatedCred = await storage.getPasskeyCredentialById('cred_registered_99');
      expect(updatedCred?.counter).toBe(2);
      expect(updatedCred?.last_used_at).toBeDefined();
    });
  });

  describe('Passkey Management & Profile Reflection', () => {
    it('lists registered passkeys for authenticated user', async () => {
      await storage.createPasskeyCredential({
        id: 'cred_1',
        user_id: testUser.id,
        public_key: 'pub1',
        counter: 0,
        device_type: 'singleDevice',
        backed_up: false,
        name: 'Touch ID'
      });

      const res = await app.request('/api/auth/passkey/list', {
        headers: { Authorization: `Bearer ${userToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.credentials.length).toBe(1);
      expect(data.credentials[0].name).toBe('Touch ID');
    });

    it('revokes a passkey credential', async () => {
      await storage.createPasskeyCredential({
        id: 'cred_to_delete',
        user_id: testUser.id,
        public_key: 'pub2',
        counter: 0,
        device_type: 'multiDevice',
        backed_up: true,
        name: 'YubiKey'
      });

      const deleteRes = await app.request('/api/auth/passkey/cred_to_delete', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` }
      });

      expect(deleteRes.status).toBe(200);
      const data = await deleteRes.json();
      expect(data.success).toBe(true);

      // Ensure credential is gone from DB
      const after = await storage.getPasskeyCredentialById('cred_to_delete');
      expect(after).toBeNull();
    });

    it('returns 404 when deleting a non-existent or other user passkey', async () => {
      const res = await app.request('/api/auth/passkey/non_existent_cred', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` }
      });

      expect(res.status).toBe(404);
    });

    it('reflects hasPasskey flag accurately on /api/auth/me', async () => {
      // Initially no passkey
      const initialRes = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      const initialData = await initialRes.json();
      expect(initialData.user.hasPasskey).toBe(false);

      // Add a passkey
      await storage.createPasskeyCredential({
        id: 'cred_me_test',
        user_id: testUser.id,
        public_key: 'pub_test',
        counter: 0,
        backed_up: false
      });

      const updatedRes = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      const updatedData = await updatedRes.json();
      expect(updatedData.user.hasPasskey).toBe(true);
    });
  });
});
