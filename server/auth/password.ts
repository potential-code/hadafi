import bcrypt from "bcryptjs";

// Passwords stay bcrypt (12 rounds): every pre-Better-Auth hash is bcrypt and
// migration 0022 copied them into auth_accounts as-is, so one algorithm keeps
// old and new passwords working the same way.
const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  if (!hash.startsWith("$2")) return false;
  return bcrypt.compare(password, hash);
}
