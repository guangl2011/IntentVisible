/**
 * Credential encryption at rest (spec D1: client secret / access tokens
 * stored encrypted). AES-256-GCM with a fresh IV per envelope:
 *
 *   base64( 0x01 | iv[12] | ciphertext+tag )
 *
 * The key is deployment configuration (INTENTVISIBLE_TOKEN_KEY, 32 raw
 * bytes of base64 or hex). Envelope versioning (0x01) keeps rotation
 * possible without a format migration.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION_BYTE = 0x01;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/** Thrown when the configured key is unusable or an envelope is corrupt. */
export class SecretBoxError extends Error {}

/** Decodes the base64- or hex-encoded 32-byte key once at startup. */
export function decodeTokenKey(encoded: string): Buffer {
  const trimmed = encoded.trim();
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, "hex");
  } else {
    try {
      const decoded = Buffer.from(trimmed, "base64");
      if (decoded.length === KEY_LENGTH) key = decoded;
    } catch {
      key = null;
    }
  }
  if (key === null || key.length !== KEY_LENGTH) {
    throw new SecretBoxError(
      `token encryption key must be ${KEY_LENGTH} raw bytes (base64 or hex), got ${trimmed.length} chars`,
    );
  }
  return key;
}

/** Encrypts a credential into the versioned envelope. */
export function encryptToken(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new SecretBoxError(`token encryption key must be ${KEY_LENGTH} bytes`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const envelope = Buffer.concat([
    Buffer.from([VERSION_BYTE]),
    iv,
    ciphertext,
    cipher.getAuthTag(),
  ]);
  return envelope.toString("base64");
}

/** Reverses encryptToken. A wrong key or truncated envelope throws. */
export function decryptToken(envelope: string, key: Buffer): string {
  const raw = Buffer.from(envelope, "base64");
  if (raw.length < 1 + IV_LENGTH + 16 || raw[0] !== VERSION_BYTE) {
    throw new SecretBoxError("encrypted token envelope is malformed");
  }
  const iv = raw.subarray(1, 1 + IV_LENGTH);
  const authTag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(1 + IV_LENGTH, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
