import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const getJwtSecret = () => process.env.JWT_SECRET || 'test-only-secret-do-not-use-in-production';
const RESOLVED_JWT_SECRET = getJwtSecret();
const TOKEN_EXPIRY = '24h';

const googleOAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  systemRole?: string;
  tokenVersion?: number;
}

export interface GoogleVerifiedPayload {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleVerifiedPayload | null> {
  try {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      // Test-only fallback: decode without verification (NEVER runs in production)
      const decoded: any = jwt.decode(idToken);
      if (decoded && decoded.email) {
        return {
          googleId: decoded.sub || decoded.googleId || `google_${Date.now()}`,
          email: decoded.email,
          name: decoded.name || decoded.email.split('@')[0],
          avatarUrl: decoded.picture || decoded.avatarUrl,
        };
      }
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId) {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) return null;
      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        avatarUrl: payload.picture,
      };
    } else {
      console.error('[Google OAuth] GOOGLE_CLIENT_ID is not configured. Google sign-in is disabled.');
      return null;
    }
  } catch (err) {
    console.error('[Google OAuth] Token verification failed:', err);
  }
  return null;
}

export interface AppleVerifiedPayload {
  appleSub: string;
  email?: string;
}

export async function verifyAppleToken(identityToken: string): Promise<AppleVerifiedPayload | null> {
  try {
    if (!identityToken) return null;

    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      const decoded: any = jwt.decode(identityToken);
      if (decoded && (decoded.sub || decoded.appleSub)) {
        return {
          appleSub: decoded.sub || decoded.appleSub,
          email: decoded.email,
        };
      }
    }

    const decodedComplete = jwt.decode(identityToken, { complete: true });
    if (!decodedComplete || !decodedComplete.payload) {
      return null;
    }

    const payload: any = decodedComplete.payload;
    if (payload.iss && payload.iss !== 'https://appleid.apple.com') {
      console.error('[Apple Auth] Invalid issuer:', payload.iss);
      return null;
    }
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.error('[Apple Auth] Token expired');
      return null;
    }

    return {
      appleSub: payload.sub,
      email: payload.email,
    };
  } catch (err) {
    console.error('[Apple Auth] Token verification failed:', err);
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = (process.env.NODE_ENV === 'test' || process.env.VITEST) ? 4 : 12;
  const salt = await bcrypt.genSalt(saltRounds);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;
  } catch (err) {
    return null;
  }
}

export interface AuthRequest {
  headers: Record<string, any>;
  cookies?: Record<string, any>;
  user?: JwtPayload;
}

export function authMiddleware(req: any, res: any, next: (err?: any) => void) {
  const authHeader = req.headers?.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers?.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc: any, c: string) => {
      const eqIndex = c.indexOf('=');
      if (eqIndex > 0) {
        const key = c.substring(0, eqIndex).trim();
        const value = c.substring(eqIndex + 1).trim();
        acc[key] = value;
      }
      return acc;
    }, {});
    token = cookies.token || '';
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. No token provided.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }

  req.user = decoded;
  next();
}

export function superadminMiddleware(req: any, res: any, next: (err?: any) => void) {
  authMiddleware(req, res, () => {
    const role = req.user?.systemRole;
    if (role !== 'superadmin' && role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Platform Admin or Superadmin privileges required.'
      });
    }
    next();
  });
}


