export function resolvePoolCode(p: any): string {
  if (!p) return '';
  if (p.code) return p.code;
  if (p.qrCodeKey) return p.qrCodeKey;
  if (p.qr_code_key) return p.qr_code_key;
  if (typeof p.id === 'string' && p.id.startsWith('pool_') && p.id.length > 10) {
    return p.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
  }
  return p.id || '';
}
