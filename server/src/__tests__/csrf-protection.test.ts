/**
 * SEC-013: CSRF Protection Tests
 *
 * Testa a proteção contra Cross-Site Request Forgery:
 * 1. GET retorna token CSRF no header XSRF-TOKEN
 * 2. POST sem token retorna 403
 * 3. POST com token válido funciona
 * 4. POST com token inválido retorna 403
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import csurf from "csurf";

describe("SEC-013: CSRF Protection", () => {
  let app: express.Application;
  let server: NodeJS.Server | undefined;

  beforeAll(() => {
    app = express();

    // Minimal express setup for testing
    app.use(express.json());

    // Session middleware (required for csurf)
    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, secure: false, sameSite: "strict" },
      }),
    );

    // CSRF middleware
    const csrfProtection = csurf({ cookie: false });
    app.use(csrfProtection);

    // Middleware para adicionar token ao response
    app.use((req: express.Request & { csrfToken?: () => string }, res, next) => {
      res.setHeader("XSRF-TOKEN", req.csrfToken?.() || "");
      next();
    });

    // Test routes
    app.get("/api/test/form", (req, res) => {
      res.json({ token: res.getHeader("XSRF-TOKEN") });
    });

    app.post("/api/test/submit", (req, res) => {
      res.json({ success: true, message: "POST aceito com token válido" });
    });

    // CSRF error handler
    app.use((erro: Error & { code?: string }, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (erro.code === "EBADCSRFTOKEN") {
        res.status(403).json({ erro: "Token CSRF inválido ou expirado" });
        return;
      }
      next(erro);
    });

    server = app.listen(0);
  });

  afterAll(async () => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  it("GET /api/test/form retorna token CSRF no header XSRF-TOKEN", async () => {
    const response = await request(app).get("/api/test/form");

    expect(response.status).toBe(200);
    expect(response.headers["xsrf-token"]).toBeTruthy();
    expect(typeof response.headers["xsrf-token"]).toBe("string");
    expect(response.headers["xsrf-token"].length).toBeGreaterThan(0);
  });

  it("POST sem token CSRF retorna 403", async () => {
    const response = await request(app)
      .post("/api/test/submit")
      .send({ data: "test" });

    expect(response.status).toBe(403);
    expect(response.body.erro).toContain("CSRF");
  });

  it("POST com token CSRF válido retorna 200", async () => {
    // Usa um agent para manter sessão entre requisições
    const agent = request.agent(app);

    // Step 1: GET para obter o token
    const getResponse = await agent.get("/api/test/form");
    expect(getResponse.status).toBe(200);

    const token = getResponse.headers["xsrf-token"];
    expect(token).toBeTruthy();

    // Step 2: POST com o token na mesma sessão
    const postResponse = await agent
      .post("/api/test/submit")
      .set("X-CSRF-Token", token)
      .send({ data: "test" });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.success).toBe(true);
  });

  it("POST com token CSRF inválido retorna 403", async () => {
    const response = await request(app)
      .post("/api/test/submit")
      .set("X-CSRF-Token", "invalid-token-that-doesnt-exist")
      .send({ data: "test" });

    expect(response.status).toBe(403);
    expect(response.body.erro).toContain("CSRF");
  });

  it("Session permite múltiplas requisições com diferentes tokens", async () => {
    // Cria um agent para manter cookies entre requisições (simula sessão)
    const agent = request.agent(app);

    // Step 1: GET para obter token 1
    const response1 = await agent.get("/api/test/form");
    const token1 = response1.headers["xsrf-token"];
    expect(token1).toBeTruthy();

    // Step 2: POST com token1 deve funcionar
    const postResponse1 = await agent
      .post("/api/test/submit")
      .set("X-CSRF-Token", token1)
      .send({ data: "test" });

    expect(postResponse1.status).toBe(200);

    // Step 3: GET novamente para obter novo token (pode ser diferente)
    const response2 = await agent.get("/api/test/form");
    const token2 = response2.headers["xsrf-token"];
    expect(token2).toBeTruthy();

    // Step 4: POST com o novo token também deve funcionar
    const postResponse2 = await agent
      .post("/api/test/submit")
      .set("X-CSRF-Token", token2)
      .send({ data: "test" });

    expect(postResponse2.status).toBe(200);
  });

  it("Token CSRF é transmitido em header de resposta", async () => {
    const response = await request(app).get("/api/test/form");

    expect(response.headers).toHaveProperty("xsrf-token");
    expect(typeof response.headers["xsrf-token"]).toBe("string");
    expect(response.headers["xsrf-token"].length).toBeGreaterThan(10);
  });
});
