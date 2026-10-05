/**
 * Certisign Digital Signature Service
 *
 * Integração com API REST da Certisign (A3 Certificate)
 * Implementa assinatura digital de PDFs com certificado digital.
 *
 * Documentação: https://api.certisign.com.br
 */

import crypto from "crypto";

export interface CertisignConfig {
  apiUrl: string; // Ex: https://api.certisign.com.br
  apiKey: string; // Bearer token de autenticação
  timeout?: number; // Em ms, default 30000
}

export interface ResultadoAssinatura {
  sucesso: boolean;
  pdf_assinado?: Buffer; // PDF com assinatura digital
  hash_assinatura?: string; // SHA256 da assinatura
  timestamp?: string; // ISO 8601
  mensagem_erro?: string;
  codigo_erro?: string;
}

export interface ValidacaoCertificado {
  valido: boolean;
  numero_serie: string;
  titular: string;
  valido_ate: Date;
  emissor: string;
  motivo_invalido?: string;
}

/**
 * Serviço de assinatura digital com Certisign
 */
export class CertisignAssinador {
  private config: CertisignConfig;

  constructor(config: CertisignConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };

    if (!config.apiKey) {
      throw new Error("Certisign API key is required");
    }
  }

  /**
   * Assina um PDF com certificado digital A3
   *
   * @param pdfBuffer Buffer contendo o PDF a ser assinado
   * @param numeroSerie Número de série do certificado A3
   * @param senhaToken Senha do token de segurança (se token protegido)
   * @returns Resultado contendo PDF assinado ou erro
   */
  async assinarPDF(
    pdfBuffer: Buffer,
    numeroSerie: string,
    senhaToken?: string
  ): Promise<ResultadoAssinatura> {
    try {
      // Validações básicas
      if (!pdfBuffer || pdfBuffer.length === 0) {
        return {
          sucesso: false,
          mensagem_erro: "PDF buffer is empty",
          codigo_erro: "INVALID_PDF",
        };
      }

      if (!numeroSerie) {
        return {
          sucesso: false,
          mensagem_erro: "Certificate serial number is required",
          codigo_erro: "MISSING_SERIAL",
        };
      }

      // Prepara payload para API Certisign
      const payload = {
        documento_base64: pdfBuffer.toString("base64"),
        numero_serie_certificado: numeroSerie,
        senha_token: senhaToken || "",
        algoritmo_hash: "SHA256",
        tipo_assinatura: "digital", // digital, carimbo_tempo, etc
      };

      // Faz chamada à API Certisign (simulado)
      // Em produção, usar fetch ou axios com certificado TLS
      const resultado = await this.chamarApiCertisign(payload);

      if (!resultado.sucesso) {
        return {
          sucesso: false,
          mensagem_erro: resultado.mensagem_erro,
          codigo_erro: resultado.codigo_erro,
        };
      }

      // Decodifica PDF assinado retornado pela API
      const pdfAssinado = Buffer.from(resultado.pdf_assinado_base64, "base64");

      // Calcula hash da assinatura
      const hashAssinatura = crypto
        .createHash("sha256")
        .update(pdfAssinado)
        .digest("hex");

      return {
        sucesso: true,
        pdf_assinado: pdfAssinado,
        hash_assinatura: hashAssinatura,
        timestamp: new Date().toISOString(),
      };
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error during signing";
      return {
        sucesso: false,
        mensagem_erro: mensagem,
        codigo_erro: "ERRO_ASSINATURA",
      };
    }
  }

  /**
   * Valida se um certificado digital é válido
   *
   * @param numeroSerie Número de série do certificado
   * @returns Resultado de validação
   */
  async validarCertificado(numeroSerie: string): Promise<ValidacaoCertificado> {
    try {
      if (!numeroSerie) {
        return {
          valido: false,
          numero_serie: "",
          titular: "",
          valido_ate: new Date(),
          emissor: "",
          motivo_invalido: "Serial number is required",
        };
      }

      // Chama API Certisign para validar
      const resultado = await this.chamarApiCertisign(
        {
          numero_serie_certificado: numeroSerie,
          acao: "validar",
        },
        "GET"
      );

      if (!resultado.valido) {
        return {
          valido: false,
          numero_serie: numeroSerie,
          titular: "",
          valido_ate: new Date(),
          emissor: "",
          motivo_invalido: resultado.motivo_invalido || "Invalid certificate",
        };
      }

      return {
        valido: true,
        numero_serie: numeroSerie,
        titular: resultado.titular,
        valido_ate: new Date(resultado.valido_ate),
        emissor: resultado.emissor,
      };
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      return {
        valido: false,
        numero_serie: numeroSerie,
        titular: "",
        valido_ate: new Date(),
        emissor: "",
        motivo_invalido: `Error validating certificate: ${mensagem}`,
      };
    }
  }

  /**
   * Obtém informações do certificado (interno)
   */
  async obterInfoCertificado(
    numeroSerie: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const resultado = await this.chamarApiCertisign(
        {
          numero_serie_certificado: numeroSerie,
          acao: "info",
        },
        "GET"
      );

      return resultado.sucesso ? resultado.certificado : null;
    } catch {
      return null;
    }
  }

  /**
   * Chamada genérica para API Certisign
   * (Implementação real faria HTTP request; aqui é simulado)
   */
  private async chamarApiCertisign(
    payload: Record<string, unknown>,
    _metodo: string = "POST"
  ): Promise<Record<string, unknown>> {
    // Simulação: Em produção, faria:
    // const response = await fetch(`${this.config.apiUrl}/api/v1/...`, {
    //   method: _metodo,
    //   headers: {
    //     'Authorization': `Bearer ${this.config.apiKey}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify(payload),
    //   timeout: this.config.timeout
    // });

    // Para testes, retorna resposta simulada
    if (payload.acao === "validar") {
      return {
        sucesso: true,
        valido: true,
        titular: "Test User",
        valido_ate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        emissor: "Certisign",
      };
    }

    if (payload.acao === "info") {
      return {
        sucesso: true,
        certificado: {
          numero_serie: payload.numero_serie_certificado,
          titular: "Test User",
          valido_ate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          emissor: "Certisign",
        },
      };
    }

    // Assinatura
    if (payload.documento_base64) {
      const documento = Buffer.from(payload.documento_base64 as string, "base64");
      const assinatura = crypto
        .createHash("sha256")
        .update(documento)
        .digest();

      // Retorna documento com metadados de assinatura
      const documentoAssinado = Buffer.concat([
        documento,
        Buffer.from("\n/* ASSINADO DIGITALMENTE */\n"),
        Buffer.from(assinatura.toString("hex")),
      ]);

      return {
        sucesso: true,
        pdf_assinado_base64: documentoAssinado.toString("base64"),
        timestamp: new Date().toISOString(),
      };
    }

    return {
      sucesso: false,
      mensagem_erro: "Invalid request",
    };
  }
}

/**
 * Factory para criar instância do assinador
 */
export function criarAssinadorCertisign(
  apiKey: string,
  apiUrl: string = "https://api.certisign.com.br"
): CertisignAssinador {
  return new CertisignAssinador({
    apiKey,
    apiUrl,
  });
}
