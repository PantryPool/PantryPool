import { createUniversalApi } from '../server/api/app';
import { createUniversalToken } from '../server/api/authUtils';
import { InMemoryStorageAdapter } from './InMemoryStorageAdapter';
import { StorageUser } from '../server/storage/types';

export const TEST_JWT_SECRET = 'test-suite-super-secret-jwt-key-32chars!';

export interface TestAppHarness {
  app: ReturnType<typeof createUniversalApi>;
  storage: InMemoryStorageAdapter;
  secret: string;
}

/**
 * Creates an instance of the Universal Hono API wired to a clean InMemoryStorageAdapter.
 */
export function createTestApp(storage?: InMemoryStorageAdapter, secret = TEST_JWT_SECRET): TestAppHarness {
  const store = storage ?? new InMemoryStorageAdapter();
  const app = createUniversalApi(store, secret);
  return { app, storage: store, secret };
}

/**
 * Creates and registers a user in the in-memory storage adapter with sensible defaults.
 */
export async function createTestUser(
  storage: InMemoryStorageAdapter,
  overrides?: Partial<StorageUser>
): Promise<StorageUser> {
  const rand = Math.random().toString(36).substring(2, 8);
  const user: Partial<StorageUser> & { id: string; email: string; name: string } = {
    id: overrides?.id ?? `u_${rand}`,
    email: overrides?.email ?? `user_${rand}@example.com`,
    name: overrides?.name ?? `Test User ${rand}`,
    system_role: overrides?.system_role ?? 'user',
    token_version: overrides?.token_version ?? 1,
    ...overrides,
  };
  return storage.createUser(user);
}

/**
 * Generates a valid universal JWT token for test authorization headers.
 */
export async function createTestToken(
  user: { id: string; email: string; name: string; system_role?: 'superadmin' | 'admin' | 'user'; token_version?: number },
  secret = TEST_JWT_SECRET
): Promise<string> {
  return createUniversalToken(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.system_role ?? 'user',
      tokenVersion: user.token_version ?? 1,
    },
    secret
  );
}
