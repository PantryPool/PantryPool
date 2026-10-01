/**
 * Mock for cloudflare:sockets in local Node.js / Vitest environments
 */

export function connect(address: any, options?: any) {
  return {
    readable: new ReadableStream(),
    writable: new WritableStream(),
    closed: Promise.resolve(),
    opened: Promise.resolve({ remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }),
    upgraded: false,
    secureTransport: options?.secureTransport || 'off',
    close: async () => {},
    startTls: () => ({}),
  };
}
