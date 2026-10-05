/**
 * Ser Pro ID 2FA Validation Service
 *
 * Integração com API Ser Pro ID para validação de assinatura digital via SMS 2FA.
 * Implementa desafio e resposta para confirmar ações críticas (assinatura de relatórios).
 *
 * Documentação: https://www.serproid.com.br/api
 */

import crypto from "crypto";

export interface SerProIdConfig {
  apiUrl: string; // Ex: https://api.serproid.com.br
  apiKey: string; // API Key de autenticação
  timeout?: number; // Em ms, default 30000
  cpf?: string; // CPF do usuário (para identificar conta)
}

export interface DesafioSMS {
  sucesso: boolean;
  nonce: string; // Token único para correlacionar desafio com resposta
  telefone_mascarado?: string; // Ex: "11999999***"
  tentativas_restantes?: number;
  expira_em?: string; // ISO 8601 - em quanto tempo expira o desafio
  mensagem_erro?: string;
}

export interface ValidacaoSMS {
  sucesso: boolean;
  nonce_validado: string;
  codigo_confirmacao?: string; // Código confirmado pelo usuário
  timestamp_validacao?: string;
  mensagem_erro?: string;
  tentativas_restantes?: number;
}

export interface StatusValidacao {
  nonce: string;
  validado: boolean;
  ativo: boolean;
  expira_em: Date;
  tentativas_restantes: number;
}

/**
 * Serviço de validação 2FA com Ser Pro ID
 */
export class SerProIdValidacao {
  private config: SerProIdConfig;
  private desafios: Map<string, DesafioArmazenado> = new Map();

  constructor(config: SerProIdConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };

    if (!config.apiKey) {
      throw new Error("Ser Pro ID API key is required");
    }
  }

  /**
   * Envia SMS com desafio de 2FA
   *
   * @param cpf CPF do usuário que vai confirmar
   * @param contexto Contexto da operação (ex: "assinatura_relatorio_dre_2024_01")
   * @returns Desafio com nonce e telefone mascarado
   */
  async enviarDesafioSMS(cpf: string, contexto: string): Promise<DesafioSMS> {
    try {
      // Validações
      if (!cpf || !/^\d{11}$/.test(cpf.replace(/\D/g, ""))) {
        return {
          sucesso: false,
          nonce: "",
          mensagem_erro: "Invalid CPF format",
        };
      }

      if (!contexto) {
        return {
          sucesso: false,
          nonce: "",
          mensagem_erro: "Context is required",
        };
      }

      // Gera nonce único
      const nonce = crypto.randomUUID();

      // Payload para API Ser Pro ID
      const payload = {
        cpf: cpf.replace(/\D/g, ""),
        contexto,
        nonce,
        acao: "enviar_sms",
      };

      // Chamada à API (simulado)
      const resultado = await this.chamarApiSerProId(payload);

      if (!resultado.sucesso) {
        return {
          sucesso: false,
          nonce: "",
          mensagem_erro: resultado.mensagem_erro,
        };
      }

      // Armazena desafio internamente (em produção, usar Redis/Memcached)
      const desafio: DesafioArmazenado = {
        nonce,
        cpf,
        contexto,
        telefone_mascarado: resultado.telefone_mascarado,
        criado_em: new Date(),
        expira_em: new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
        tentativas_restantes: 3,
        validado: false,
      };

      this.desafios.set(nonce, desafio);

      return {
        sucesso: true,
        nonce,
        telefone_mascarado: resultado.telefone_mascarado,
        tentativas_restantes: 3,
        expira_em: desafio.expira_em.toISOString(),
      };
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error sending SMS";
      return {
        sucesso: false,
        nonce: "",
        mensagem_erro: mensagem,
      };
    }
  }

  /**
   * Valida resposta ao desafio SMS
   *
   * @param nonce Nonce do desafio
   * @param codigoSMS Código SMS de 6 dígitos recebido pelo usuário
   * @returns Resultado de validação
   */
  async validarRespostaSMS(
    nonce: string,
    codigoSMS: string
  ): Promise<ValidacaoSMS> {
    try {
      // Valida formato
      if (!nonce) {
        return {
          sucesso: false,
          nonce_validado: "",
          mensagem_erro: "Nonce is required",
        };
      }

      if (!codigoSMS || !/^\d{6}$/.test(codigoSMS)) {
        return {
          sucesso: false,
          nonce_validado: "",
          mensagem_erro: "Invalid SMS code format (must be 6 digits)",
        };
      }

      // Busca desafio armazenado
      const desafio = this.desafios.get(nonce);

      if (!desafio) {
        return {
          sucesso: false,
          nonce_validado: "",
          mensagem_erro: "Challenge not found or expired",
        };
      }

      // Valida expiração
      if (new Date() > desafio.expira_em) {
        this.desafios.delete(nonce);
        return {
          sucesso: false,
          nonce_validado: "",
          mensagem_erro: "Challenge expired",
        };
      }

      // Valida tentativas
      if (desafio.tentativas_restantes <= 0) {
        this.desafios.delete(nonce);
        return {
          sucesso: false,
          nonce_validado: "",
          mensagem_erro: "Maximum attempts exceeded",
        };
      }

      // Chamada à API Ser Pro ID para validar código
      const resultado = await this.chamarApiSerProId(
        {
          nonce,
          codigo_sms: codigoSMS,
          acao: "validar_sms",
        },
        "POST"
      );

      if (resultado.sucesso) {
        // Marca desafio como validado
        desafio.validado = true;
        desafio.timestamp_validacao = new Date();

        return {
          sucesso: true,
          nonce_validado: nonce,
          codigo_confirmacao: codigoSMS,
          timestamp_validacao: desafio.timestamp_validacao.toISOString(),
        };
      }

      // Decrementa tentativas
      desafio.tentativas_restantes--;

      if (desafio.tentativas_restantes === 0) {
        this.desafios.delete(nonce);
        return {
          sucesso: false,
          nonce_validado: "",
          mensagem_erro: "Maximum attempts exceeded",
          tentativas_restantes: 0,
        };
      }

      return {
        sucesso: false,
        nonce_validado: "",
        mensagem_erro: resultado.mensagem_erro || "Invalid SMS code",
        tentativas_restantes: desafio.tentativas_restantes,
      };
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error validating SMS";
      return {
        sucesso: false,
        nonce_validado: "",
        mensagem_erro: mensagem,
      };
    }
  }

  /**
   * Consulta status de um desafio
   */
  async obterStatusDesafio(nonce: string): Promise<StatusValidacao | null> {
    const desafio = this.desafios.get(nonce);

    if (!desafio) {
      return null;
    }

    return {
      nonce,
      validado: desafio.validado,
      ativo: new Date() <= desafio.expira_em && desafio.tentativas_restantes > 0,
      expira_em: desafio.expira_em,
      tentativas_restantes: desafio.tentativas_restantes,
    };
  }

  /**
   * Limpa desafio (após uso bem-sucedido)
   */
  limparDesafio(nonce: string): void {
    this.desafios.delete(nonce);
  }

  /**
   * Chamada genérica para API Ser Pro ID
   * (Implementação real faria HTTP request; aqui é simulado)
   */
  private async chamarApiSerProId(
    payload: Record<string, unknown>,
    _metodo: string = "POST"
  ): Promise<Record<string, unknown>> {
    // Simulação: Em produção, faria:
    // const response = await fetch(`${this.config.apiUrl}/api/v1/...`, {
    //   method: metodo,
    //   headers: {
    //     'Authorization': `Bearer ${this.config.apiKey}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify(payload),
    //   timeout: this.config.timeout
    // });

    // Simulação de resposta
    if (payload.acao === "enviar_sms") {
      return {
        sucesso: true,
        telefone_mascarado: "11999999***",
        tentativas: 3,
      };
    }

    if (payload.acao === "validar_sms") {
      // Simula código correto
      if (payload.codigo_sms === "123456") {
        return {
          sucesso: true,
          nonce: payload.nonce,
        };
      }

      return {
        sucesso: false,
        mensagem_erro: "Invalid SMS code",
      };
    }

    return {
      sucesso: false,
      mensagem_erro: "Invalid action",
    };
  }
}

interface DesafioArmazenado {
  nonce: string;
  cpf: string;
  contexto: string;
  telefone_mascarado: string;
  criado_em: Date;
  expira_em: Date;
  tentativas_restantes: number;
  validado: boolean;
  timestamp_validacao?: Date;
}

/**
 * Factory para criar instância do validador
 */
export function criarValidadorSerProId(
  apiKey: string,
  cpf?: string,
  apiUrl: string = "https://api.serproid.com.br"
): SerProIdValidacao {
  return new SerProIdValidacao({
    apiKey,
    cpf,
    apiUrl,
  });
}
