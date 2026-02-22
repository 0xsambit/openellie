import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getEnv } from "./env.js";
import { AppError, ErrorCode } from "./errors.js";

/**
 * Derives a workspace-specific AES-256 encryption key using HMAC-SHA256.
 * Each workspace gets a unique key derived from the master key.
 *
 * @param workspaceId - The workspace UUID.
 * @returns 32-byte derived key as a Buffer.
 */
export function deriveWorkspaceKey(workspaceId: string): Buffer {
  const env = getEnv();
  const masterKey = Buffer.from(env.ENCRYPTION_MASTER_KEY, "hex");
  return createHmac("sha256", masterKey).update(workspaceId).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The value to encrypt.
 * @param workspaceId - Workspace ID used to derive the encryption key.
 * @returns Encrypted string in format "iv:authTag:ciphertext" (all base64).
 * @throws AppError if encryption fails.
 */
export function encrypt(plaintext: string, workspaceId: string): string {
  try {
    const key = deriveWorkspaceKey(workspaceId);
    // GCM standard: 12-byte (96-bit) IV
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  } catch (error) {
    throw new AppError(
      "Encryption failed",
      ErrorCode.ENCRYPTION_FAILED,
      500,
      error,
    );
  }
}

/**
 * Decrypts a string encrypted by `encrypt()`.
 *
 * @param ciphertext - Encrypted string in "iv:authTag:ciphertext" format (all base64).
 * @param workspaceId - Workspace ID used to derive the decryption key.
 * @returns Decrypted plaintext string.
 * @throws AppError if decryption fails (wrong key, tampered data, etc.).
 */
export function decrypt(ciphertext: string, workspaceId: string): string {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid ciphertext format — expected iv:authTag:ciphertext");
    }

    const [ivBase64, authTagBase64, encryptedBase64] = parts as [
      string,
      string,
      string,
    ];

    const key = deriveWorkspaceKey(workspaceId);
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    const encrypted = Buffer.from(encryptedBase64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (error) {
    throw new AppError(
      "Decryption failed — key may be incorrect or data may be tampered",
      ErrorCode.DECRYPTION_FAILED,
      500,
      error,
    );
  }
}

/**
 * Encrypts a JSON-serializable object.
 *
 * @param obj - Any JSON-serializable object.
 * @param workspaceId - Workspace ID for key derivation.
 * @returns Encrypted string.
 */
export function encryptJSON(obj: unknown, workspaceId: string): string {
  return encrypt(JSON.stringify(obj), workspaceId);
}

/**
 * Decrypts and parses a JSON object encrypted by `encryptJSON()`.
 *
 * @param ciphertext - Encrypted JSON string.
 * @param workspaceId - Workspace ID for key derivation.
 * @returns Parsed JavaScript value.
 */
export function decryptJSON<T = unknown>(
  ciphertext: string,
  workspaceId: string,
): T {
  const plaintext = decrypt(ciphertext, workspaceId);
  return JSON.parse(plaintext) as T;
}
