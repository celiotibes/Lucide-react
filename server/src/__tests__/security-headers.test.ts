/**
 * Testes para Security Headers com Helmet.js
 * Validar: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import helmet from "helmet";
import request from "supertest";

describe("Security Headers (Helmet.js)", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();

    // Apply helmet with security configuration (same as in index.ts)
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
          },
        },
        hsts: {
          maxAge: 31536000, // 1 year in seconds
          includeSubDomains: true,
          preload: true,
        },
        frameguard: {
          action: "deny",
        },
        noSniff: true,
        referrerPolicy: {
          policy: "strict-origin-when-cross-origin",
        },
        xssFilter: true,
      }),
    );

    // Simple test route
    app.get("/api/health", (_req, res) => {
      res.json({ status: "ok" });
    });
  });

  describe("Content Security Policy (CSP)", () => {
    it("deve incluir header Content-Security-Policy", async () => {
      const response = await request(app).get("/api/health");

      expect(response.headers["content-security-policy"]).toBeDefined();
      expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
      expect(response.headers["content-security-policy"]).toContain("frame-src 'none'");
    });

    it("deve proteger contra inline scripts e externos", async () => {
      const response = await request(app).get("/api/health");
      const csp = response.headers["content-security-policy"];

      expect(csp).not.toContain("script-src *");
      expect(csp).not.toContain("script-src 'unsafe-inline'");
    });

    it("deve bloquear frames (clickjacking protection)", async () => {
      const response = await request(app).get("/api/health");
      const csp = response.headers["content-security-policy"];

      expect(csp).toContain("frame-src 'none'");
    });
  });

  describe("HTTP Strict Transport Security (HSTS)", () => {
    it("deve incluir header Strict-Transport-Security", async () => {
      const response = await request(app).get("/api/health");

      expect(response.headers["strict-transport-security"]).toBeDefined();
    });

    it("deve ter maxAge de 1 year", async () => {
      const response = await request(app).get("/api/health");
      const hsts = response.headers["strict-transport-security"];

      expect(hsts).toContain("max-age=31536000");
    });

    it("deve incluir subdomínios", async () => {
      const response = await request(app).get("/api/health");
      const hsts = response.headers["strict-transport-security"];

      expect(hsts).toContain("includeSubDomains");
    });

    it("deve incluir preload", async () => {
      const response = await request(app).get("/api/health");
      const hsts = response.headers["strict-transport-security"];

      expect(hsts).toContain("preload");
    });
  });

  describe("X-Frame-Options (Clickjacking Protection)", () => {
    it("deve incluir header X-Frame-Options", async () => {
      const response = await request(app).get("/api/health");

      expect(response.headers["x-frame-options"]).toBeDefined();
      expect(response.headers["x-frame-options"]).toBe("DENY");
    });
  });

  describe("X-Content-Type-Options (MIME Type Sniffing)", () => {
    it("deve incluir header X-Content-Type-Options", async () => {
      const response = await request(app).get("/api/health");

      expect(response.headers["x-content-type-options"]).toBeDefined();
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });
  });

  describe("Referrer-Policy", () => {
    it("deve incluir header Referrer-Policy", async () => {
      const response = await request(app).get("/api/health");

      expect(response.headers["referrer-policy"]).toBeDefined();
      expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    });

    it("deve ter política restritiva", async () => {
      const response = await request(app).get("/api/health");
      const referrer = response.headers["referrer-policy"];

      // strict-origin-when-cross-origin é mais restritivo que origin ou origin-when-cross-origin
      expect(["strict-origin-when-cross-origin", "no-referrer"]).toContain(referrer);
    });
  });

  describe("X-XSS-Protection", () => {
    it("deve incluir header X-XSS-Protection", async () => {
      const response = await request(app).get("/api/health");

      expect(response.headers["x-xss-protection"]).toBeDefined();
    });
  });

  describe("All Security Headers Present", () => {
    it("deve ter todos os headers críticos de segurança em qualquer resposta", async () => {
      const response = await request(app).get("/api/health");

      const requiredHeaders = [
        "content-security-policy",
        "strict-transport-security",
        "x-frame-options",
        "x-content-type-options",
        "referrer-policy",
        "x-xss-protection",
      ];

      for (const header of requiredHeaders) {
        expect(response.headers[header]).toBeDefined(
          `Header ${header} is missing from response`,
        );
      }
    });
  });
});
