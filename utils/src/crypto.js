import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
const ALGORITHM = "aes-256-gcm";
function deriveKey(secret) {
    return createHash("sha256").update(secret).digest();
}
export function encryptSecret(plainText, secret) {
    const iv = randomBytes(12);
    const key = deriveKey(secret);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plainText, "utf8"),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return [
        iv.toString("base64url"),
        authTag.toString("base64url"),
        encrypted.toString("base64url")
    ].join(".");
}
export function decryptSecret(payload, secret) {
    const [ivRaw, authTagRaw, encryptedRaw] = payload.split(".");
    if (!ivRaw || !authTagRaw || !encryptedRaw) {
        throw new Error("Invalid encrypted payload format");
    }
    const iv = Buffer.from(ivRaw, "base64url");
    const authTag = Buffer.from(authTagRaw, "base64url");
    const encrypted = Buffer.from(encryptedRaw, "base64url");
    const key = deriveKey(secret);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]);
    return decrypted.toString("utf8");
}
//# sourceMappingURL=crypto.js.map