import { describe, it, expect, vi } from 'vitest';
import { D1StorageAdapter } from '../src/server/storage/d1Adapter';
import fs from 'fs';
import path from 'path';

describe('D1 Transient Lock Resilience & Staged Backup Architecture', () => {
  it('transparently retries on transient SQLITE_BUSY / locked errors and recovers', async () => {
    let callCount = 0;
    const mockDb = {
      prepare: vi.fn().mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount < 3) {
              throw new Error('D1_ERROR: SQLITE_BUSY: database is locked');
            }
            return {
              id: 'u_test_1',
              email: 'test@pantrypool.com',
              name: 'Test User',
              system_role: 'user',
              token_version: 1,
              created_at: new Date().toISOString()
            };
          })
        };
      })
    };

    const adapter = new D1StorageAdapter(mockDb);
    const user = await adapter.getUserById('u_test_1');

    expect(callCount).toBe(3);
    expect(user).toBeDefined();
    expect(user?.email).toBe('test@pantrypool.com');
  });

  it('rethrows non-transient errors immediately without retrying', async () => {
    let callCount = 0;
    const mockDb = {
      prepare: vi.fn().mockImplementation(() => {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(async () => {
            callCount++;
            throw new Error('D1_ERROR: UNIQUE constraint failed: users.email');
          })
        };
      })
    };

    const adapter = new D1StorageAdapter(mockDb);
    await expect(adapter.getUserById('u_test_2')).rejects.toThrow('UNIQUE constraint failed');
    expect(callCount).toBe(1);
  });

  it('verifies the presence and executable script of staged zero-downtime backup utility', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/staged_d1_backup.ts');
    expect(fs.existsSync(scriptPath)).toBe(true);

    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('sqlite_master');
    expect(content).toContain('SELECT * FROM');
    expect(content).toContain('zlib.createGzip');
  });
});
