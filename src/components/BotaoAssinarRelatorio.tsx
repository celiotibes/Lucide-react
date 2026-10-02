/**
 * BotaoAssinarRelatorio Component
 *
 * Componente React para assinatura digital de relatórios (DRE, Fluxo, Margens)
 * com validação 2FA (Ser Pro ID SMS).
 *
 * Fluxo:
 * 1. Usuário clica botão "Assinar Relatório"
 * 2. Sistema envia desafio SMS (Ser Pro ID)
 * 3. Usuário recebe SMS e insere código
 * 4. Sistema valida código 2FA
 * 5. PDF é assinado digitalmente com Certisign
 * 6. Assinatura é salva e armazenada
 */

import React, { useState } from "react";

interface BotaoAssinarRelatorioProps {
  relatorio_id: string;
  relatorio_tipo: "DRE" | "FLUXO" | "MARGENS";
  relatorio_periodo: string; // YYYY-MM
  pdf_url: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_cpf?: string;
  onAssinado?: (resultado: ResultadoAssinatura) => void;
  onErro?: (erro: string) => void;
  desabilitar?: boolean;
}

interface EstadoAssinatura {
  fase: "inicial" | "aguardando_sms" | "validando_sms" | "assinando" | "concluido" | "erro";
  nonce_2fa?: string;
  telefone_mascarado?: string;
  tentativas_restantes?: number;
  tempo_expiracao?: Date;
  codigo_sms?: string;
  mensagem_erro?: string;
  assinatura?: ResultadoAssinatura;
}

interface ResultadoAssinatura {
  sucesso: boolean;
  assinatura_id?: string;
  timestamp_assinatura?: string;
  certificado_id?: string;
  pdf_assinado_url?: string;
  mensagem_erro?: string;
}

/**
 * Componente BotaoAssinarRelatorio
 */
export const BotaoAssinarRelatorio: React.FC<BotaoAssinarRelatorioProps> = ({
  relatorio_id,
  relatorio_tipo,
  relatorio_periodo,
  pdf_url,
  usuario_id,
  usuario_nome,
  usuario_cpf,
  onAssinado,
  onErro,
  desabilitar = false,
}) => {
  const [estado, setEstado] = useState<EstadoAssinatura>({
    fase: "inicial",
  });

  const [codigo_sms, setCodigo] = useState("");
  const [mostrando_modal, setMostrando] = useState(false);

  /**
   * Inicia o processo de assinatura
   */
  const iniciarAssinatura = async () => {
    try {
      setMostrando(true);
      setEstado({ fase: "aguardando_sms" });

      // Step 1: Envia desafio SMS
      const respostaDesafio = await fetch("/api/relatorios/desafio-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario_id,
          usuario_cpf,
          contexto: `assinatura_relatorio_${relatorio_tipo.toLowerCase()}_${relatorio_periodo}`,
        }),
      });

      if (!respostaDesafio.ok) {
        throw new Error("Failed to send SMS challenge");
      }

      const dadosDesafio = await respostaDesafio.json();

      setEstado({
        fase: "aguardando_sms",
        nonce_2fa: dadosDesafio.nonce,
        telefone_mascarado: dadosDesafio.telefone_mascarado,
        tentativas_restantes: dadosDesafio.tentativas_restantes,
        tempo_expiracao: new Date(
          Date.now() + 10 * 60 * 1000
        ), // 10 minutos
      });
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      setEstado({
        fase: "erro",
        mensagem_erro: `Failed to initiate signature: ${mensagem}`,
      });
      onErro?.(
        `Failed to initiate signature: ${mensagem}`
      );
      setMostrando(false);
    }
  };

  /**
   * Valida o código SMS enviado
   */
  const validarCodigoSMS = async () => {
    try {
      if (!codigo_sms || !/^\d{6}$/.test(codigo_sms)) {
        setEstado((prev) => ({
          ...prev,
          mensagem_erro: "Invalid code format (must be 6 digits)",
        }));
        return;
      }

      setEstado({ fase: "validando_sms", nonce_2fa: estado.nonce_2fa });

      // Step 2: Valida código SMS
      const respostaValidacao = await fetch("/api/relatorios/validar-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: estado.nonce_2fa,
          codigo_sms,
        }),
      });

      if (!respostaValidacao.ok) {
        const erro = await respostaValidacao.json();
        throw new Error(erro.mensagem_erro || "Invalid SMS code");
      }

      // Step 3: Assina relatório
      await assinarRelatorio();
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      setEstado({
        fase: "erro",
        mensagem_erro: `Failed to validate SMS: ${mensagem}`,
        nonce_2fa: estado.nonce_2fa,
      });
      onErro?.(`Failed to validate SMS: ${mensagem}`);
    }
  };

  /**
   * Assina o relatório após validação 2FA
   */
  const assinarRelatorio = async () => {
    try {
      setEstado((prev) => ({
        ...prev,
        fase: "assinando",
      }));

      const respostaAssinatura = await fetch(
        `/api/relatorios/${relatorio_id}/assinar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nonce_2fa: estado.nonce_2fa,
            usuario_id,
            usuario_nome,
            usuario_cpf,
            relatorio_tipo,
            relatorio_periodo,
            pdf_url,
          }),
        }
      );

      if (!respostaAssinatura.ok) {
        const erro = await respostaAssinatura.json();
        throw new Error(erro.mensagem_erro || "Failed to sign document");
      }

      const resultado = await respostaAssinatura.json();

      setEstado({
        fase: "concluido",
        assinatura: resultado,
      });

      onAssinado?.(resultado);
      setCodigo("");

      // Fecha modal após 2 segundos
      setTimeout(() => {
        setMostrando(false);
      }, 2000);
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      setEstado({
        fase: "erro",
        mensagem_erro: `Failed to sign document: ${mensagem}`,
        nonce_2fa: estado.nonce_2fa,
      });
      onErro?.(`Failed to sign document: ${mensagem}`);
    }
  };

  /**
   * Reseta o estado
   */
  const reset = () => {
    setEstado({ fase: "inicial" });
    setCodigo("");
    setMostrando(false);
  };

  return (
    <>
      {/* Botão principal */}
      <button
        onClick={iniciarAssinatura}
        disabled={desabilitar || estado.fase === "assinando"}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
        title="Sign this report with digital certificate"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
            clipRule="evenodd"
          />
        </svg>
        Sign Report
      </button>

      {/* Modal de assinatura */}
      {mostrando_modal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Sign Report</h2>

            {/* Fase inicial / Aguardando SMS */}
            {estado.fase === "inicial" && (
              <div className="space-y-4">
                <p className="text-gray-600">
                  Sign <strong>{relatorio_tipo}</strong> report for{" "}
                  <strong>{relatorio_periodo}</strong>
                </p>
                <button
                  onClick={iniciarAssinatura}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Send SMS Challenge
                </button>
              </div>
            )}

            {/* Aguardando SMS */}
            {estado.fase === "aguardando_sms" && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">
                    SMS sent to: <strong>{estado.telefone_mascarado}</strong>
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Expires in 10 minutes
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter 6-digit SMS code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    pattern="[0-9]*"
                    value={codigo_sms}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-2xl text-center tracking-widest"
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Attempts remaining: {estado.tentativas_restantes}
                  </p>
                </div>

                {estado.mensagem_erro && (
                  <div className="bg-red-50 p-3 rounded-lg">
                    <p className="text-sm text-red-600">
                      {estado.mensagem_erro}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={validarCodigoSMS}
                    disabled={codigo_sms.length !== 6}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={reset}
                    className="flex-1 px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Validando SMS */}
            {estado.fase === "validando_sms" && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-block animate-spin">
                    <svg
                      className="h-8 w-8 text-blue-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                  <p className="mt-4 text-gray-600">
                    Validating SMS code...
                  </p>
                </div>
              </div>
            )}

            {/* Assinando */}
            {estado.fase === "assinando" && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-block animate-spin">
                    <svg
                      className="h-8 w-8 text-blue-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                  <p className="mt-4 text-gray-600">
                    Signing document with Certisign...
                  </p>
                </div>
              </div>
            )}

            {/* Concluído */}
            {estado.fase === "concluido" && (
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-6 w-6 text-green-600"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-green-800 font-semibold">
                      Report signed successfully!
                    </p>
                  </div>
                </div>

                {estado.assinatura && (
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Signature ID:</strong>{" "}
                      {estado.assinatura.assinatura_id}
                    </p>
                    <p>
                      <strong>Signed at:</strong>{" "}
                      {new Date(
                        estado.assinatura.timestamp_assinatura || ""
                      ).toLocaleString()}
                    </p>
                    {estado.assinatura.pdf_assinado_url && (
                      <a
                        href={estado.assinatura.pdf_assinado_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Download signed PDF
                      </a>
                    )}
                  </div>
                )}

                <button
                  onClick={reset}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            )}

            {/* Erro */}
            {estado.fase === "erro" && (
              <div className="space-y-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-red-800 font-semibold">
                    Signature failed
                  </p>
                  <p className="text-red-700 text-sm mt-2">
                    {estado.mensagem_erro}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={iniciarAssinatura}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={reset}
                    className="flex-1 px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default BotaoAssinarRelatorio;
