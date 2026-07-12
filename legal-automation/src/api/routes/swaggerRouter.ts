import { Router, Request, Response } from 'express';
import { swaggerConfig, swaggerDocumentation, errorHandlingGuide } from '@utils/swagger';

const router = Router();

// Serve OpenAPI JSON specification
router.get('/openapi.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerConfig);
});

// Serve OpenAPI YAML (future enhancement)
router.get('/openapi.yaml', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.send(`
openapi: '3.0.0'
info:
  title: Legal Automation Platform API
  version: 1.0.0
servers:
  - url: http://localhost:3000
  - url: https://api.example.com
`);
});

// Error codes and HTTP status documentation
router.get('/error-codes', (req: Request, res: Response) => {
  res.json(swaggerDocumentation.errorCodes);
});

// Rate limiting configuration
router.get('/rate-limiting', (req: Request, res: Response) => {
  res.json(swaggerDocumentation.rateLimiting);
});

// Authentication requirements
router.get('/authentication', (req: Request, res: Response) => {
  res.json(swaggerDocumentation.authentication);
});

// Validation rules
router.get('/validation-rules', (req: Request, res: Response) => {
  res.json(swaggerDocumentation.validation);
});

// Example payloads
router.get('/examples', (req: Request, res: Response) => {
  res.json(swaggerDocumentation.examples);
});

// Comprehensive error handling guide
router.get('/error-handling-guide', (req: Request, res: Response) => {
  res.json(errorHandlingGuide);
});

// Swagger UI embedded HTML
router.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Legal Automation Platform - API Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  <redoc spec-url='/api-docs/openapi.json'></redoc>
  <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
</body>
</html>
  `);
});

export default router;
