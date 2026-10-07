import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY env var is required. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars).");
  }
  return buf;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt ciphertext produced by encrypt().
 * Expects format: iv:authTag:ciphertext (all base64)
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format. Expected iv:authTag:ciphertext");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export type DecryptPageTokenResult =
  | { ok: true; value: string }
  | { ok: false; code: "format" | "wrong_key"; message: string };

/** Giải mã page token; phân biệt lỗi format vs ENCRYPTION_KEY không khớp. */
export function decryptPageToken(encryptedData: string): DecryptPageTokenResult {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    return {
      ok: false,
      code: "format",
      message: "Dữ liệu token trong DB không đúng định dạng mã hóa.",
    };
  }

  try {
    return { ok: true, value: decrypt(encryptedData) };
  } catch {
    return {
      ok: false,
      code: "wrong_key",
      message:
        "Token Page được mã hóa bằng ENCRYPTION_KEY cũ (thường do đã tạo lại .env hoặc Docker dùng key khác với lúc lưu Page). Dán Page Access Token mới trong form sửa Page, hoặc kết nối lại Facebook để làm mới token.",
    };
  }
}
