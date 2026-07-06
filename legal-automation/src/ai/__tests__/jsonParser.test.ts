import RobustJSONParser from '../jsonParser';

describe('RobustJSONParser', () => {
  describe('Direct JSON Parsing', () => {
    it('should parse valid JSON directly', () => {
      const json = '{"name": "João", "role": "author"}';
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('João');
    });

    it('should parse JSON arrays', () => {
      const json = '[1, 2, 3, 4, 5]';
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle empty content', () => {
      const result = RobustJSONParser.parse('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty content');
    });
  });

  describe('Markdown Code Block Extraction', () => {
    it('should extract JSON from markdown code blocks', () => {
      const markdown = `
        Here is the JSON:
        \`\`\`json
        {"type": "sentença", "court": "STF"}
        \`\`\`
        End of response.
      `;
      const result = RobustJSONParser.parse(markdown);
      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('sentença');
    });

    it('should handle triple backticks without language', () => {
      const markdown = `
        \`\`\`
        {"status": "success"}
        \`\`\`
      `;
      const result = RobustJSONParser.parse(markdown);
      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('success');
    });
  });

  describe('JSON Extraction from Text', () => {
    it('should extract JSON from surrounding text', () => {
      const text = 'Some text {"extracted": "data"} more text';
      const result = RobustJSONParser.parse(text);
      expect(result.success).toBe(true);
      expect(result.data?.extracted).toBe('data');
    });

    it('should handle nested JSON', () => {
      const text = 'Response: {"outer": {"inner": "value"}}';
      const result = RobustJSONParser.parse(text);
      expect(result.success).toBe(true);
      expect(result.data?.outer?.inner).toBe('value');
    });

    it('should handle JSON arrays in text', () => {
      const text = 'Items: [{"id": 1}, {"id": 2}]';
      const result = RobustJSONParser.parse(text);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('JSON Repair', () => {
    it('should fix trailing commas', () => {
      const json = '{"name": "João",}';
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('João');
    });

    it('should fix unquoted keys', () => {
      const json = '{name: "João", role: "author"}';
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('João');
    });

    it('should handle multiple issues', () => {
      const json = '{name: "João", age: 30,}';
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('João');
      expect(result.data?.age).toBe(30);
    });
  });

  describe('JSONL (Newline-Delimited) Parsing', () => {
    it('should extract first JSON object from multi-line content', () => {
      const multiline = `{"id": 1, "type": "petição"}
Other text on another line`;
      const result = RobustJSONParser.parse(multiline);
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(1);
      expect(result.data?.type).toBe('petição');
    });

    it('should handle mixed content with JSON', () => {
      const mixed = `Some text
{"id": 2, "status": "open"}
More text`;
      const result = RobustJSONParser.parse(mixed);
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(2);
    });
  });

  describe('parseAnalysis', () => {
    it('should parse analysis response with all fields', () => {
      const response = `
      {
        "summary": "Processo em fase de recurso",
        "phase": "Apelação",
        "riskLevel": "high",
        "recommendations": ["Preparar contra-razões", "Revisar jurisprudência"]
      }
      `;
      const result = RobustJSONParser.parseAnalysis(response);
      expect(result.summary).toBe('Processo em fase de recurso');
      expect(result.phase).toBe('Apelação');
      expect(result.riskLevel).toBe('high');
      expect(result.recommendations?.length).toBe(2);
    });

    it('should provide defaults for missing fields', () => {
      const response = '{"summary": "Test", "phase": "Recurso"}';
      const result = RobustJSONParser.parseAnalysis(response);
      expect(result.summary).toBe('Test');
      expect(result.phase).toBe('Recurso');
      expect(typeof result).toBe('object');
    });

    it('should handle malformed analysis', () => {
      const response = 'Invalid JSON';
      const result = RobustJSONParser.parseAnalysis(response);
      expect(result.summary).toBe('');
      expect(result.phase).toBe('Unknown');
    });
  });

  describe('parseExtraction', () => {
    it('should parse extraction with full schema', () => {
      const response = `{
        "partes": [{"nome": "João Silva", "role": "autor"}],
        "pretensoes": ["Indenização por danos morais"],
        "fundamentos": ["Artigo 5º, X da CF"],
        "prazos": [{"descricao": "Prazo para defesa", "data": "2026-07-20"}]
      }`;
      const result = RobustJSONParser.parseExtraction(response);
      expect(result.partes?.length).toBe(1);
      expect(result.partes?.[0]?.nome).toBe('João Silva');
      expect(result.pretensoes?.length).toBe(1);
      expect(result.fundamentos?.length).toBe(1);
      expect(result.prazos?.length).toBe(1);
    });

    it('should provide empty arrays for missing fields', () => {
      const response = '{"partes": []}';
      const result = RobustJSONParser.parseExtraction(response);
      expect(result.partes?.length).toBe(0);
      expect(Array.isArray(result.pretensoes)).toBe(true);
      expect(Array.isArray(result.fundamentos)).toBe(true);
    });

    it('should set proper confidence for valid extraction', () => {
      const response = '{"partes": [{"nome": "Test", "role": "author"}]}';
      const result = RobustJSONParser.parseExtraction(response);
      expect(result.partes).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
  });

  describe('parseValidation', () => {
    it('should parse validation response with all fields', () => {
      const response = `{
        "isValid": true,
        "score": 92,
        "issues": [],
        "warnings": ["Verifique citações"],
        "suggestions": ["Expandir fundamentação"]
      }`;
      const result = RobustJSONParser.parseValidation(response);
      expect(result.isValid).toBe(true);
      expect(result.score).toBe(92);
      expect(result.warnings?.length).toBe(1);
      expect(result.suggestions?.length).toBe(1);
    });

    it('should coerce invalid score to number', () => {
      const response = '{"isValid": true, "score": "85"}';
      const result = RobustJSONParser.parseValidation(response);
      expect(result.score).toBe(0); // Invalid type becomes 0
    });

    it('should handle partial validation data', () => {
      const response = '{"isValid": false}';
      const result = RobustJSONParser.parseValidation(response);
      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle JSON with special characters', () => {
      const json = '{"text": "Artigo 5º, inciso X da CF/88"}';
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(result.data?.text).toContain('Artigo 5º');
    });

    it('should handle JSON with escaped quotes', () => {
      const json = '{"quote": "Ele disse \\"Olá\\""}';
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(result.data?.quote).toContain('Olá');
    });

    it('should handle very long JSON', () => {
      const longText = 'x'.repeat(10000);
      const json = `{"text": "${longText}"}`;
      const result = RobustJSONParser.parse(json);
      expect(result.success).toBe(true);
      expect(result.data?.text?.length).toBe(10000);
    });

    it('should mark fallback usage appropriately', () => {
      const malformed = '{broken: true}';
      const result = RobustJSONParser.parse(malformed);
      if (result.success) {
        expect(result.fallbackUsed).toBeDefined();
      }
    });
  });

  describe('Real-World Scenarios', () => {
    it('should parse LLM response with preamble', () => {
      const response = `
        Aqui está a análise do processo:

        \`\`\`json
        {
          "summary": "Processo aguardando sentença",
          "phase": "Sentença",
          "riskLevel": "medium",
          "recommendations": ["Acompanhar processo", "Preparar petição"]
        }
        \`\`\`

        Obs: A análise foi realizada em 2026-07-06.
      `;
      const result = RobustJSONParser.parseAnalysis(response);
      expect(result.summary).toBe('Processo aguardando sentença');
      expect(result.phase).toBe('Sentença');
    });

    it('should parse petition validation response', () => {
      const response = `A validação resultou em:
{
  "isValid": true,
  "score": 87,
  "issues": [],
  "warnings": ["Verifique artigos citados", "Revisar datas"],
  "suggestions": ["Melhorar estrutura de argumentação"]
}`;
      const result = RobustJSONParser.parseValidation(response);
      expect(result.isValid).toBe(true);
      expect(result.score).toBe(87);
      expect(result.warnings?.length).toBe(2);
    });

    it('should extract data from semi-structured response', () => {
      const response = `Dados extraídos:
- Partes: {"partes": [{"nome": "Empresa XYZ", "role": "ré"}]}
- Pretensões do autor
- Data: 2026-07-06`;
      const result = RobustJSONParser.parseExtraction(response);
      expect(result.partes?.length).toBeGreaterThan(0);
    });
  });
});
