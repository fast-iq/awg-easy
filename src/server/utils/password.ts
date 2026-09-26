// ! Auto Imports are not supported in this file

import argon2 from 'argon2';
import { deserialize } from '@phc/format';

/**
 * Checks if `password` matches the hash.
 */
export function isPasswordValid(
  password: string,
  hash: string
): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Hashes a password.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

/**
 * Checks if the password hash is valid.
 * This only checks if the hash is a valid PHC formatted string using argon2.
 */
export function isValidPasswordHash(hash: string): boolean {
  try {
    const obj = deserialize(hash);

    if (obj.id !== 'argon2i' && obj.id !== 'argon2d' && obj.id !== 'argon2id') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * A pre-computed argon2id hash of a random string. Used to perform a dummy
 * verification when the user doesn't exist, so timing doesn't leak whether
 * a username is valid (see getCurrentUser in utils/session.ts).
 */
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$ZmFrZWhhc2hzYWx0MTIzNDU2Nzg$8fBpQ7yKJ1vXhWqLmNcRtYsUdGkHjAeOwPzVbCxMnEi';
