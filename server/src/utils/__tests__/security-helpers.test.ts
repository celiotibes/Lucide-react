/**
 * SEC-011B: Tests for Timing Attack Protection
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  timingSafeStringEqual,
  validateTokenSafely,
  validateCsrfTokenSafely,
  validateHashSafely,
  constantTimeCompare,
  createTimingSafeHmac,
  verifyTimingSafeHmac,
  generateSecureToken,
  generateSecureRandomNumber,
  hashSensitiveData,
  verifySensitiveDataHash,
  redactSensitive,
  containsSensitivePattern,
} from "../security-helpers.js";

describe("SEC-011B: Security Helpers - Timing Attack Protection", () => {
  describe("timingSafeStringEqual", () => {
    it("should return true for identical strings", () => {
      const token = "test-secret-token";
      expect(timingSafeStringEqual(token, token)).toBe(true);
    });

    it("should return true for identical buffers", () => {
      const buffer = Buffer.from("test-secret-token");
      expect(timingSafeStringEqual(buffer, buffer)).toBe(true);
    });

    it("should return false for different strings", () => {
      expect(timingSafeStringEqual("token1", "token2")).toBe(false);
    });

    it("should return false for strings of different lengths", () => {
      expect(timingSafeStringEqual("short", "much-longer-string")).toBe(
        false,
      );
    });

    it("should handle empty strings", () => {
      expect(timingSafeStringEqual("", "")).toBe(true);
      expect(timingSafeStringEqual("", "nonempty")).toBe(false);
    });

    it("should handle mixed string and buffer inputs", () => {
      const str = "test";
      const buf = Buffer.from("test");
      expect(timingSafeStringEqual(str, buf)).toBe(true);
    });
  });

  describe("validateTokenSafely", () => {
    it("should validate matching tokens", () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      expect(validateTokenSafely(token, token)).toBe(true);
    });

    it("should reject non-matching tokens", () => {
      const token1 =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const token2 =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ODc2NTQzMjEwIn0.0nVVTLxYKjSA_j_u3x_ZN4JKvePl-l5vPQXEfbmVFYk";
      expect(validateTokenSafely(token1, token2)).toBe(false);
    });

    it("should handle empty tokens", () => {
      expect(validateTokenSafely("", "")).toBe(true);
      expect(validateTokenSafely("", "token")).toBe(false);
    });

    it("should return false for non-string inputs", () => {
      expect(validateTokenSafely(null as any, "token")).toBe(false);
      expect(validateTokenSafely("token", undefined as any)).toBe(false);
    });
  });

  describe("validateCsrfTokenSafely", () => {
    it("should validate matching CSRF tokens", () => {
      const csrfToken = crypto.randomBytes(32).toString("hex");
      expect(validateCsrfTokenSafely(csrfToken, csrfToken)).toBe(true);
    });

    it("should reject non-matching CSRF tokens", () => {
      const token1 = crypto.randomBytes(32).toString("hex");
      const token2 = crypto.randomBytes(32).toString("hex");
      expect(validateCsrfTokenSafely(token1, token2)).toBe(false);
    });
  });

  describe("validateHashSafely", () => {
    it("should validate matching hashes", () => {
      const hash = "abc123def456ghi789";
      expect(validateHashSafely(hash, hash)).toBe(true);
    });

    it("should reject different hashes", () => {
      const hash1 = "abc123def456ghi789";
      const hash2 = "xyz987uvw654tsr321";
      expect(validateHashSafely(hash1, hash2)).toBe(false);
    });
  });

  describe("constantTimeCompare", () => {
    it("should return true for equal numbers", () => {
      expect(constantTimeCompare(42, 42)).toBe(true);
      expect(constantTimeCompare(0, 0)).toBe(true);
      expect(constantTimeCompare(2147483647, 2147483647)).toBe(true);
    });

    it("should return false for unequal numbers", () => {
      expect(constantTimeCompare(42, 43)).toBe(false);
      expect(constantTimeCompare(0, 1)).toBe(false);
    });

    it("should handle negative numbers", () => {
      expect(constantTimeCompare(-5, -5)).toBe(true);
      expect(constantTimeCompare(-5, 5)).toBe(false);
    });
  });

  describe("createTimingSafeHmac", () => {
    it("should create deterministic HMACs", () => {
      const secret = "my-secret";
      const data = "test-data";

      const hmac1 = createTimingSafeHmac(secret, data);
      const hmac2 = createTimingSafeHmac(secret, data);

      expect(hmac1).toBe(hmac2);
    });

    it("should produce different HMACs for different data", () => {
      const secret = "my-secret";
      const hmac1 = createTimingSafeHmac(secret, "data1");
      const hmac2 = createTimingSafeHmac(secret, "data2");

      expect(hmac1).not.toBe(hmac2);
    });

    it("should produce different HMACs for different secrets", () => {
      const data = "test-data";
      const hmac1 = createTimingSafeHmac("secret1", data);
      const hmac2 = createTimingSafeHmac("secret2", data);

      expect(hmac1).not.toBe(hmac2);
    });
  });

  describe("verifyTimingSafeHmac", () => {
    it("should verify valid HMACs", () => {
      const secret = "my-secret";
      const data = "test-data";
      const signature = createTimingSafeHmac(secret, data);

      expect(verifyTimingSafeHmac(data, signature, secret)).toBe(true);
    });

    it("should reject invalid HMACs", () => {
      const secret = "my-secret";
      const data = "test-data";
      const wrongSignature = createTimingSafeHmac(secret, "other-data");

      expect(verifyTimingSafeHmac(data, wrongSignature, secret)).toBe(false);
    });

    it("should reject HMACs with wrong secret", () => {
      const data = "test-data";
      const signature = createTimingSafeHmac("secret1", data);

      expect(verifyTimingSafeHmac(data, signature, "secret2")).toBe(false);
    });
  });

  describe("generateSecureToken", () => {
    it("should generate tokens of correct length", () => {
      const token32 = generateSecureToken(32);
      const token64 = generateSecureToken(64);

      expect(token32.length).toBe(64); // 32 bytes = 64 hex chars
      expect(token64.length).toBe(128); // 64 bytes = 128 hex chars
    });

    it("should generate different tokens each call", () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      const token3 = generateSecureToken();

      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      expect(token1).not.toBe(token3);
    });

    it("should generate tokens with only hex characters", () => {
      const token = generateSecureToken(32);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    it("should use default length of 32 bytes", () => {
      const token = generateSecureToken();
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });
  });

  describe("generateSecureRandomNumber", () => {
    it("should generate numbers in range", () => {
      const min = 1;
      const max = 100;

      for (let i = 0; i < 100; i++) {
        const num = generateSecureRandomNumber(min, max);
        expect(num).toBeGreaterThanOrEqual(min);
        expect(num).toBeLessThanOrEqual(max);
      }
    });

    it("should handle single-value ranges", () => {
      const num = generateSecureRandomNumber(42, 42);
      expect(num).toBe(42);
    });

    it("should distribute values across range", () => {
      const min = 0;
      const max = 9;
      const distribution = new Set();

      for (let i = 0; i < 1000; i++) {
        distribution.add(generateSecureRandomNumber(min, max));
      }

      // Should generate all values in range
      expect(distribution.size).toBeGreaterThan(5);
    });
  });

  describe("hashSensitiveData and verifySensitiveDataHash", () => {
    it("should hash and verify passwords", () => {
      const password = "MySecurePassword123!";
      const { hash, salt } = hashSensitiveData(password);

      expect(verifySensitiveDataHash(password, hash, salt)).toBe(true);
    });

    it("should reject wrong passwords", () => {
      const password = "MySecurePassword123!";
      const wrongPassword = "WrongPassword456@";
      const { hash, salt } = hashSensitiveData(password);

      expect(verifySensitiveDataHash(wrongPassword, hash, salt)).toBe(false);
    });

    it("should generate different hashes for same password", () => {
      const password = "MySecurePassword123!";
      const hash1 = hashSensitiveData(password);
      const hash2 = hashSensitiveData(password);

      expect(hash1.hash).not.toBe(hash2.hash);
      expect(hash1.salt).not.toBe(hash2.salt);
    });

    it("should handle custom iteration counts", () => {
      const password = "test";
      const { hash, salt } = hashSensitiveData(password, 50000);

      // Verify with same iterations
      expect(verifySensitiveDataHash(password, hash, salt, 50000)).toBe(true);

      // Verify fails with different iterations
      expect(verifySensitiveDataHash(password, hash, salt, 100000)).toBe(false);
    });
  });

  describe("redactSensitive", () => {
    it("should redact long strings showing only last N chars", () => {
      const apiKey = "sk-1234567890abcdefghij";
      const redacted = redactSensitive(apiKey, 4);

      expect(redacted).toBe("*******************ghij");
      expect(redacted).not.toContain("1234567890");
    });

    it("should redact with default visible chars (4)", () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const redacted = redactSensitive(token);

      expect(redacted).toEndWith("R8U");
      expect(redacted).toStartWith("*");
    });

    it("should fully redact short strings", () => {
      expect(redactSensitive("abc", 4)).toBe("[REDACTED]");
      expect(redactSensitive("ab", 4)).toBe("[REDACTED]");
      expect(redactSensitive("", 4)).toBe("[REDACTED]");
    });

    it("should handle non-string inputs gracefully", () => {
      expect(redactSensitive(null as any, 4)).toBe("[REDACTED]");
      expect(redactSensitive(undefined as any, 4)).toBe("[REDACTED]");
    });
  });

  describe("containsSensitivePattern", () => {
    it("should detect API keys", () => {
      expect(containsSensitivePattern("api_key: sk-1234567890")).toBe(true);
      expect(containsSensitivePattern("api-key = abc123")).toBe(true);
      expect(containsSensitivePattern("apikey:secret123")).toBe(true);
    });

    it("should detect tokens", () => {
      expect(
        containsSensitivePattern(
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        ),
      ).toBe(true);
      expect(containsSensitivePattern("token: abc123def456")).toBe(true);
    });

    it("should detect passwords", () => {
      expect(containsSensitivePattern("password: MySecurePass123!")).toBe(true);
      expect(
        containsSensitivePattern(
          'Authorization: Basic dXNlcjpwYXNzd29yZA==',
        ),
      ).toBe(true);
    });

    it("should detect secrets", () => {
      expect(containsSensitivePattern("secret = mysecretvalue")).toBe(true);
    });

    it("should not trigger on normal text", () => {
      expect(containsSensitivePattern("This is a normal message")).toBe(false);
      expect(containsSensitivePattern("User logged in successfully")).toBe(
        false,
      );
    });
  });
});
