import { describe, expect, it } from 'vitest';
import { hashPassword, safeSecretEquals, signJwt, verifyJwt, verifyPassword } from './security';

describe('password security', () => {
  it('hashes with a salt and verifies only the correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('incorrect password', hash)).toBe(false);
  });

  it('rejects legacy and malformed hashes', async () => {
    expect(await verifyPassword('anything', 'legacy-sha256')).toBe(false);
  });
});

describe('JWT security', () => {
  it('round-trips signed claims and rejects a different secret', async () => {
    const token = await signJwt({ id: 'u1', email: 'user@example.com', role: 'admin', career_id: null }, 'a-very-long-secret-value');
    await expect(verifyJwt(token, 'a-very-long-secret-value')).resolves.toMatchObject({ id: 'u1', role: 'admin' });
    await expect(verifyJwt(token, 'another-long-secret-value')).rejects.toThrow('Invalid signature');
  });

  it('compares bootstrap secrets without exposing them', async () => {
    await expect(safeSecretEquals('same', 'same')).resolves.toBe(true);
    await expect(safeSecretEquals('same', 'different')).resolves.toBe(false);
  });
});
