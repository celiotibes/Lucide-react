import { logger } from '@utils/logger';

export interface JSONParseResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  rawContent?: string;
  fallbackUsed?: boolean;
}

export class RobustJSONParser {
  /**
   * Parse JSON with multiple fallback strategies
   */
  static parse<T = any>(content: string): JSONParseResult<T> {
    if (!content || content.trim().length === 0) {
      return { success: false, data: null, error: 'Empty content' };
    }

    // Strategy 1: Direct JSON parse
    const directResult = this.tryDirectParse<T>(content);
    if (directResult.success) {
      return directResult;
    }

    // Strategy 2: Extract JSON from markdown code blocks
    const markdownResult = this.tryMarkdownExtraction<T>(content);
    if (markdownResult.success) {
      return markdownResult;
    }

    // Strategy 3: Find first valid JSON object/array
    const extractResult = this.tryExtractJSON<T>(content);
    if (extractResult.success) {
      return extractResult;
    }

    // Strategy 4: Attempt repair of malformed JSON
    const repairResult = this.tryRepairJSON<T>(content);
    if (repairResult.success) {
      return { ...repairResult, fallbackUsed: true };
    }

    // Strategy 5: Parse as JSONL (newline-delimited JSON)
    const jsonlResult = this.tryJSONLParse<T>(content);
    if (jsonlResult.success) {
      return { ...jsonlResult, fallbackUsed: true };
    }

    return {
      success: false,
      data: null,
      error: 'Failed to parse JSON after all strategies',
      rawContent: content,
    };
  }

  /**
   * Parse for analysis results (with expected fields)
   */
  static parseAnalysis(content: string): any {
    const result = this.parse<any>(content);
    if (!result.success) {
      logger.warn(`Failed to parse analysis: ${result.error}`);
      return { summary: '', phase: 'Unknown', riskLevel: 'medium', recommendations: [] };
    }
    return result.data || {};
  }

  /**
   * Parse for document extraction (with expected schema)
   */
  static parseExtraction(content: string): any {
    const result = this.parse<any>(content);
    if (!result.success) {
      logger.warn(`Failed to parse extraction: ${result.error}`);
      return { partes: [], pretensoes: [], fundamentos: [], prazos: [] };
    }

    const data = result.data || {};
    return {
      partes: data.partes || [],
      pretensoes: data.pretensoes || [],
      fundamentos: data.fundamentos || [],
      prazos: data.prazos || [],
      confidence: result.fallbackUsed ? 0.6 : 0.85,
    };
  }

  /**
   * Parse for validation results (with expected schema)
   */
  static parseValidation(content: string): any {
    const result = this.parse<any>(content);
    if (!result.success) {
      logger.warn(`Failed to parse validation: ${result.error}`);
      return { isValid: false, score: 0, issues: [], warnings: [], suggestions: [] };
    }

    const data = result.data || {};
    return {
      isValid: data.isValid || false,
      score: typeof data.score === 'number' ? data.score : 0,
      issues: Array.isArray(data.issues) ? data.issues : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    };
  }

  // ========== Private Strategies ==========

  private static tryDirectParse<T>(content: string): JSONParseResult<T> {
    try {
      const data = JSON.parse(content);
      return { success: true, data };
    } catch (e) {
      return { success: false, data: null, error: 'Direct parse failed' };
    }
  }

  private static tryMarkdownExtraction<T>(content: string): JSONParseResult<T> {
    // Look for ```json ... ```
    const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        return { success: true, data };
      } catch (e) {
        return { success: false, data: null, error: 'Markdown extraction failed' };
      }
    }

    return { success: false, data: null, error: 'No markdown block found' };
  }

  private static tryExtractJSON<T>(content: string): JSONParseResult<T> {
    // Find first { ... } or [ ... ]
    let startIdx = content.indexOf('{');
    let isArray = false;

    if (content.indexOf('[') < startIdx && content.indexOf('[') !== -1) {
      startIdx = content.indexOf('[');
      isArray = true;
    }

    if (startIdx === -1) {
      return { success: false, data: null, error: 'No JSON structure found' };
    }

    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let endIdx = startIdx;

    for (let i = startIdx; i < content.length; i++) {
      const char = content[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;

      if (braceCount === 0 && bracketCount === 0 && i > startIdx) {
        endIdx = i + 1;
        break;
      }
    }

    const jsonStr = content.substring(startIdx, endIdx);

    try {
      const data = JSON.parse(jsonStr);
      return { success: true, data };
    } catch (e) {
      return { success: false, data: null, error: 'Extracted JSON parse failed' };
    }
  }

  private static tryRepairJSON<T>(content: string): JSONParseResult<T> {
    try {
      // Remove trailing commas
      let repaired = content.replace(/,\s*([}\]])/g, '$1');

      // Fix unquoted keys (basic approach)
      repaired = repaired.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');

      // Try to parse
      const data = JSON.parse(repaired);
      return { success: true, data };
    } catch (e) {
      return { success: false, data: null, error: 'Repair attempt failed' };
    }
  }

  private static tryJSONLParse<T>(content: string): JSONParseResult<T> {
    // Try parsing as newline-delimited JSON and combine into array
    const lines = content.split('\n').filter(l => l.trim());

    const objects: any[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        objects.push(obj);
      } catch (e) {
        // Skip invalid lines
        continue;
      }
    }

    if (objects.length > 0) {
      // If single object, return it; if multiple, return array
      const data = objects.length === 1 ? (objects[0] as T) : (objects as T);
      return { success: true, data };
    }

    return { success: false, data: null, error: 'JSONL parse failed' };
  }
}

export default RobustJSONParser;
