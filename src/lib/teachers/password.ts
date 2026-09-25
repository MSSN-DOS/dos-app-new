import { randomBytes } from "node:crypto";

// Ambiguous glyphs are excluded on purpose. This password is read off an Admin's screen and
// typed on a phone by someone who has never seen it before — 0/O, 1/l/I, and 0/o are the
// characters that turn a first sign-in into a support ticket.
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, no O
const LOWERCASE = "abcdefghijkmnpqrstuvwxyz"; // no l, no o
const DIGITS = "23456789"; // no 0, no 1

const ALPHABET = `${UPPERCASE}${LOWERCASE}${DIGITS}`;
const DEFAULT_LENGTH = 12;

// 256 % 56 !== 0, so `byte % 56` would favour the first few characters. Reject the unusable
// tail of the byte range instead of accepting a skewed distribution.
const REJECTION_THRESHOLD = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/**
 * A random initial password for a newly created Teacher.
 *
 * 12 characters over a 56-symbol alphabet is ~70 bits, comfortably beyond the 8-character
 * minimum the login and register schemas enforce.
 */
export function generateInitialPassword(length: number = DEFAULT_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error("Password length must be a positive integer");
  }

  const characters: string[] = [];
  while (characters.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (characters.length >= length) break;
      if (byte >= REJECTION_THRESHOLD) continue;
      characters.push(ALPHABET[byte % ALPHABET.length] as string);
    }
  }
  return characters.join("");
}

export const INITIAL_PASSWORD_ALPHABET = ALPHABET;
