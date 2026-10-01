import { describe, it, expect } from 'vitest';
import { optimizeReceiptImage } from '../src/lib/imageOptimizer';

describe('🛑 Pre-Flight Image Optimizer (Phase 35)', () => {
  it('should process base64 string and return structured image optimization result', async () => {
    const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = await optimizeReceiptImage(dummyBase64, 1600, 0.75);

    expect(result).toBeDefined();
    expect(result.base64).toBeDefined();
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.originalSizeBytes).toBeGreaterThan(0);
  });
});
