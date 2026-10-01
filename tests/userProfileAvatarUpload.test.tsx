import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserProfileModal } from '../src/components/UserProfileModal';
import { createUniversalApi } from '../src/server/api/app';
import { StorageAdapter, StorageUserAvatar } from '../src/server/storage/types';
import { createUniversalToken } from '../src/server/api/authUtils';

// Mock client api module for component tests
vi.mock('../src/lib/api', () => ({
  uploadUserAvatarApi: vi.fn(),
  deleteUserAvatarApi: vi.fn(),
  fetchPublicSettingsApi: vi.fn(() => Promise.resolve({ appleLoginEnabled: false })),
  listPasskeysApi: vi.fn(() => Promise.resolve({ success: true, credentials: [] })),
  linkAuthProviderApi: vi.fn(),
  getPasskeyRegistrationOptionsApi: vi.fn(),
  verifyPasskeyRegistrationApi: vi.fn(),
  deletePasskeyApi: vi.fn(),
}));

vi.mock('../src/lib/imageOptimizer', () => ({
  optimizeAvatarImage: vi.fn((file: any) => Promise.resolve({
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
    sizeBytes: 68,
    originalSizeBytes: 100,
    width: 400,
    height: 400,
    compressionRatio: 0.68,
  })),
}));

describe('User Profile Icon Upload vs URL Feature', () => {
  const mockUser = {
    id: 'u_test_user_42',
    name: 'Robin Pantry',
    email: 'robin@example.com',
    avatarUrl: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Robin',
    systemRole: 'user' as const,
    hasPassword: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, user: mockUser }),
      } as any)
    );
  });

  describe('UI Component: UserProfileModal', () => {
    it('renders the custom profile icon upload zone and no longer renders a URL text input', () => {
      render(
        <UserProfileModal
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          onUpdateUser={vi.fn()}
        />
      );

      // Verify Upload UI is present
      expect(screen.getByText(/Upload Custom Profile Icon/i)).toBeInTheDocument();
      expect(screen.getByText(/Click or drag & drop photo/i)).toBeInTheDocument();

      // Verify the old URL input is NOT rendered
      expect(screen.queryByPlaceholderText('https://example.com/avatar.jpg')).not.toBeInTheDocument();
      expect(screen.queryByText(/Use custom image URL \/ photo/i)).not.toBeInTheDocument();
    });

    it('uploads an image file when chosen and updates the active avatar preview', async () => {
      const { uploadUserAvatarApi } = await import('../src/lib/api');
      vi.mocked(uploadUserAvatarApi).mockResolvedValueOnce({
        success: true,
        avatarUrl: '/api/users/avatar/usr_avatar_test123',
        avatarId: 'usr_avatar_test123',
      });

      render(
        <UserProfileModal
          isOpen={true}
          onClose={vi.fn()}
          user={mockUser}
          onUpdateUser={vi.fn()}
        />
      );

      // Find file input and simulate selecting an image file
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();

      const fakeFile = new File(['fake-image-bytes'], 'avatar.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [fakeFile] } });

      await waitFor(() => {
        expect(uploadUserAvatarApi).toHaveBeenCalledTimes(1);
      });

      // Confirmation badge appears
      await waitFor(() => {
        expect(screen.getByText(/Custom profile icon uploaded/i)).toBeInTheDocument();
      });
    });

    it('allows resetting a custom uploaded avatar back to the default avatar', async () => {
      const userWithCustomAvatar = {
        ...mockUser,
        avatarUrl: '/api/users/avatar/usr_avatar_test123',
      };

      render(
        <UserProfileModal
          isOpen={true}
          onClose={vi.fn()}
          user={userWithCustomAvatar}
          onUpdateUser={vi.fn()}
        />
      );

      const resetBtn = screen.getByRole('button', { name: /Reset to default avatar/i });
      expect(resetBtn).toBeInTheDocument();

      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(screen.queryByText(/Reset to default avatar/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Universal Server API: /api/users/avatar endpoints', () => {
    const jwtSecret = 'test-secret-must-be-at-least-32-chars-long!';
    let inMemoryAvatars: Map<string, StorageUserAvatar>;
    let mockStorage: Partial<StorageAdapter>;
    let app: any;

    beforeEach(() => {
      inMemoryAvatars = new Map();
      const usersMap = new Map<string, any>([
        [
          'u_server_test_1',
          {
            id: 'u_server_test_1',
            email: 'user1@example.com',
            name: 'User One',
            avatar_url: null,
            system_role: 'user',
            token_version: 1,
          },
        ],
      ]);

      mockStorage = {
        getUserById: vi.fn(async (id: string) => usersMap.get(id) || null),
        updateUser: vi.fn(async (id: string, updates: any) => {
          const u = usersMap.get(id);
          if (u) Object.assign(u, updates);
        }),
        saveUserAvatar: vi.fn(async (avatar: StorageUserAvatar) => {
          inMemoryAvatars.set(avatar.id, avatar);
        }),
        getUserAvatar: vi.fn(async (id: string) => inMemoryAvatars.get(id) || null),
        deleteUserAvatar: vi.fn(async (id: string) => {
          inMemoryAvatars.delete(id);
        }),
      };

      app = createUniversalApi(mockStorage as StorageAdapter, jwtSecret);
    });

    it('rejects POST /api/users/avatar without authorization token (401)', async () => {
      const res = await app.request('/api/users/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'base64...' }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('accepts base64 image upload, saves to storage, and updates user profile (201)', async () => {
      const token = await createUniversalToken(
        { userId: 'u_server_test_1', email: 'user1@example.com', name: 'User One', systemRole: 'user' },
        jwtSecret
      );

      const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await app.request('/api/users/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: tinyPngBase64,
          mimeType: 'image/png',
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.avatarUrl).toMatch(/^\/api\/users\/avatar\/usr_avatar_/);
      expect(json.avatarId).toBeDefined();

      // Verify saved in storage
      expect(mockStorage.saveUserAvatar).toHaveBeenCalledTimes(1);
      expect(mockStorage.updateUser).toHaveBeenCalledWith('u_server_test_1', {
        avatar_url: json.avatarUrl,
      });

      // Verify public retrieval of the avatar image via GET /api/users/avatar/:id
      const getRes = await app.request(json.avatarUrl);
      expect(getRes.status).toBe(200);
      expect(getRes.headers.get('Content-Type')).toBe('image/png');
      expect(getRes.headers.get('Cache-Control')).toContain('public');
    });

    it('returns 404 for nonexistent avatar ID', async () => {
      const res = await app.request('/api/users/avatar/usr_avatar_nonexistent');
      expect(res.status).toBe(404);
    });

    it('deletes user avatar and clears avatar_url via DELETE /api/users/avatar/:id', async () => {
      const token = await createUniversalToken(
        { userId: 'u_server_test_1', email: 'user1@example.com', name: 'User One', systemRole: 'user' },
        jwtSecret
      );

      const res = await app.request('/api/users/avatar/usr_avatar_dummy123', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockStorage.deleteUserAvatar).toHaveBeenCalledWith('usr_avatar_dummy123');
      expect(mockStorage.updateUser).toHaveBeenCalledWith('u_server_test_1', {
        avatar_url: null,
      });
    });
  });
});
