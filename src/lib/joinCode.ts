/**
 * Normalizes, sanitizes, and extracts pool join codes from raw strings, URLs, or query parameters.
 * Supports inputs like:
 * - 'PANTRY-4K9L2P'
 * - 'pantry-4k9l2p'
 * - '4k9l2p'
 * - 'https://pantrypool.com/?join=PANTRY-4K9L2P'
 * - 'http://localhost:3000/?pool=PANTRY-4K9L2P'
 * - 'pantrypool.com/join/PANTRY-4K9L2P'
 */
export function extractJoinCode(rawInput: string): string {
  if (!rawInput) return '';
  const trimmed = rawInput.trim();
  // If user pasted a full URL or domain with query parameters or path segments
  if (trimmed.includes('?') || trimmed.includes('/') || trimmed.includes('pantrypool')) {
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const joinParam = url.searchParams.get('join') || url.searchParams.get('pool') || url.searchParams.get('code') || url.searchParams.get('org_join') || url.searchParams.get('invite') || url.searchParams.get('org');
      if (joinParam) return joinParam.trim().toUpperCase();
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        if (lastSegment && lastSegment.toLowerCase() !== 'join') return lastSegment.trim().toUpperCase();
      }
    } catch {}
  }
  return trimmed.toUpperCase();
}
