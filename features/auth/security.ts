const encoder = new TextEncoder();
const PASSWORD_SCHEME = 'pbkdf2-sha256';
// Cloudflare Workers currently caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const derivePassword = async (password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
};

export const hashPassword = async (password: string): Promise<string> => {
  if (password.length < 12 || password.length > 256) {
    throw new Error('La contraseña debe tener entre 12 y 256 caracteres');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [scheme, iterationsText, saltText, expectedText] = storedHash.split('$');
  const iterations = Number(iterationsText);
  if (scheme !== PASSWORD_SCHEME || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
    return false;
  }

  try {
    const salt = fromBase64Url(saltText);
    const expected = fromBase64Url(expectedText);
    const actual = await derivePassword(password, salt, iterations);
    if (actual.length !== expected.length) return false;
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
};

export interface JwtClaims {
  id: string;
  email: string;
  role: 'admin' | 'coordinator' | 'viewer';
  career_id: string | null;
  iat: number;
  exp: number;
}

export const signJwt = async (
  payload: Omit<JwtClaims, 'iat' | 'exp'>,
  secret: string,
  lifetimeSeconds = 8 * 60 * 60,
): Promise<string> => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const claims = toBase64Url(encoder.encode(JSON.stringify({ ...payload, iat: issuedAt, exp: issuedAt + lifetimeSeconds })));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${claims}`));
  return `${header}.${claims}.${toBase64Url(new Uint8Array(signature))}`;
};

export const verifyJwt = async (token: string, secret: string): Promise<JwtClaims> => {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token malformed');
  const [headerText, claimsText, signatureText] = parts;
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(headerText))) as { alg?: string; typ?: string };
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported token');

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(signatureText) as BufferSource,
    encoder.encode(`${headerText}.${claimsText}`),
  );
  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(claimsText))) as Partial<JwtClaims>;
  const now = Math.floor(Date.now() / 1000);
  if (!payload.id || !payload.email || !['admin', 'coordinator', 'viewer'].includes(String(payload.role)) ||
      typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || payload.exp <= now || payload.iat > now + 60) {
    throw new Error('Invalid claims');
  }
  return payload as JwtClaims;
};

export const safeSecretEquals = async (left: string, right: string): Promise<boolean> => {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  return constantTimeEqual(new Uint8Array(leftDigest), new Uint8Array(rightDigest));
};
