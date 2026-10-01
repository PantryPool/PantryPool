import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveGeminiEndpointConfig, resetGeminiAuthCache } from '../src/server/api/geminiAuth';

describe('Gemini Enterprise & ADC Authenticator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGeminiAuthCache();
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GCP_SERVICE_ACCOUNT_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGeminiAuthCache();
  });

  it('resolves Studio API key endpoint when GEMINI_API_KEY is configured', async () => {
    const config = await resolveGeminiEndpointConfig({
      GEMINI_API_KEY: 'test_valid_gemini_key_12345'
    });

    expect(config).not.toBeNull();
    expect(config?.mode).toBe('studio');
    expect(config?.url('gemini-2.5-flash')).toContain('generativelanguage.googleapis.com');
    expect(config?.url('gemini-2.5-flash')).toContain('key=test_valid_gemini_key_12345');
    expect(config?.headers['Content-Type']).toBe('application/json');
  });

  it('returns null when neither ADC nor valid API key is present', async () => {
    const config = await resolveGeminiEndpointConfig({
      GEMINI_API_KEY: 'MY_GEMINI_API_KEY'
    });
    expect(config).toBeNull();
  });

  it('rejects placeholder and test keys for Studio mode', async () => {
    expect(await resolveGeminiEndpointConfig({ GEMINI_API_KEY: 'PLACEHOLDER_KEY' })).toBeNull();
    expect(await resolveGeminiEndpointConfig({ GEMINI_API_KEY: 'TEST_KEY' })).toBeNull();
  });

  it('resolves Enterprise ADC endpoint when GCP_SERVICE_ACCOUNT_KEY is configured in env', async () => {
    // Generate an RSA keypair for testing Web Crypto JWT signing
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['sign', 'verify']
    );

    const exportedPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const b64 = Buffer.from(exportedPkcs8).toString('base64');
    const pemHeader = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
    const pemFooter = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');
    const pem = `${pemHeader}\n${b64}\n${pemFooter}`;

    // Mock fetch across all global scopes (Node global, browser window, globalThis)
    const fetchMock = vi.fn().mockImplementation(async (url: any) => {
      const urlStr = String(url?.url || url || '');
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock_ya29_enterprise_token_abc123',
            expires_in: 3600,
            token_type: 'Bearer'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchMock);
    if (typeof globalThis !== 'undefined') (globalThis as any).fetch = fetchMock;
    if (typeof window !== 'undefined') (window as any).fetch = fetchMock;

    try {
      const config = await resolveGeminiEndpointConfig({
        GCP_SERVICE_ACCOUNT_KEY: JSON.stringify({
          client_email: 'pantrypool-gemini-agent@test-gcp-project-12345.iam.gserviceaccount.com',
          private_key: pem,
          project_id: 'test-gcp-project-12345'
        }),
        GOOGLE_CLOUD_LOCATION: 'us-central1'
      });

      expect(config).not.toBeNull();
      expect(config?.mode).toBe('enterprise');
      expect(config?.projectId).toBe('test-gcp-project-12345');
      expect(config?.location).toBe('us-central1');
      expect(config?.headers.Authorization).toBe('Bearer mock_ya29_enterprise_token_abc123');
      expect(config?.url('gemini-2.5-flash')).toBe(
        'https://us-central1-aiplatform.googleapis.com/v1/projects/test-gcp-project-12345/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent'
      );

      // Verify default global location resolution
      resetGeminiAuthCache();
      const globalConfig = await resolveGeminiEndpointConfig({
        GCP_SERVICE_ACCOUNT_KEY: JSON.stringify({
          client_email: 'pantrypool-gemini-agent@test-gcp-project-12345.iam.gserviceaccount.com',
          private_key: pem,
          project_id: 'test-gcp-project-12345'
        })
      });

      expect(globalConfig).not.toBeNull();
      expect(globalConfig?.location).toBe('global');
      expect(globalConfig?.model).toBe('gemini-2.5-flash-lite');
      expect(globalConfig?.url('gemini-2.5-flash-lite')).toBe(
        'https://aiplatform.googleapis.com/v1/projects/test-gcp-project-12345/locations/global/publishers/google/models/gemini-2.5-flash-lite:generateContent'
      );
      expect(globalConfig?.url('gemini-3.5-flash-lite')).toBe(
        'https://aiplatform.googleapis.com/v1/projects/test-gcp-project-12345/locations/global/publishers/google/models/gemini-3.5-flash-lite:generateContent'
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
