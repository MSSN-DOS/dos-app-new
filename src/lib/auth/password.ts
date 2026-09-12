// Password hashing utility.
//
// Algorithm choice: bcrypt, implemented via `bcryptjs` (a pure-JS bcrypt) rather than the
// native `bcrypt` package. Reason: the native build needs a C toolchain that is unreliable on
// Windows dev machines, and the project standard (DESIGN.md §7, AGENTS.md) is "pick bcrypt OR
// argon2 and stick to it" — bcryptjs IS bcrypt, just without the native binary. 12 salt rounds
// per OWASP guidance. Never store plaintext; never compare with `===`.

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
