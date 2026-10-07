/**
 * Componente de Upload de Arquivos com Drag-and-Drop
 *
 * Funcionalidades:
 * - Drag-and-drop de arquivos
 * - Seleção de arquivo via clique
 * - Validação de tipo e tamanho
 * - Barra de progresso
 * - Exibição de informações do arquivo
 * - Tratamento de erros
 * - Acessibilidade (ARIA labels, navegação por teclado)
 */

import React, { useCallback, useState, useRef } from 'react';
import type { ImportUploadProps, UploadState } from './types.js';
import { uploadArquivo, ApiError } from './api.js';

const TAMANHO_MAXIMO_PADRAO = 50 * 1024 * 1024; // 50 MB
const TIPOS_ACEITOS_PADRAO = [
  'application/x-ofx',
  'application/vnd.intu.qbo',
  'text/csv',
  'text/plain',
  'application/pdf',
  'image/jpeg',
  'image/png',
];

/**
 * Formatar tamanho de arquivo para exibição
 */
function formatarTamanho(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validar arquivo
 */
function validarArquivo(
  file: File,
  maxFileSize: number,
  acceptedTypes: string[]
): { valido: boolean; erro?: string } {
  // Validar tipo MIME
  if (!acceptedTypes.includes(file.type)) {
    const extensao = file.name.split('.').pop()?.toLowerCase();
    if (!extensao || !['ofx', 'qbo', 'csv', 'txt', 'pdf', 'jpg', 'jpeg', 'png'].includes(extensao)) {
      return {
        valido: false,
        erro: `Tipo de arquivo não suportado: ${file.type}. Suportados: OFX, CSV, PDF, JPEG, PNG`,
      };
    }
  }

  // Validar tamanho
  if (file.size > maxFileSize) {
    return {
      valido: false,
      erro: `Arquivo muito grande. Máximo: ${formatarTamanho(maxFileSize)}, seu arquivo: ${formatarTamanho(file.size)}`,
    };
  }

  return { valido: true };
}

/**
 * Componente principal de upload
 */
export const ImportUpload: React.FC<ImportUploadProps> = ({
  onUploadSuccess,
  onUploadError,
  maxFileSize = TAMANHO_MAXIMO_PADRAO,
  acceptedTypes = TIPOS_ACEITOS_PADRAO,
}) => {
  const [state, setState] = useState<UploadState>({
    isLoading: false,
    progress: 0,
    file: null,
    error: null,
    result: null,
  });
  const [isDragOver, setIsDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Processar arquivo selecionado/dropado
   */
  const processarArquivo = useCallback(
    async (file: File) => {
      // Validar
      const validacao = validarArquivo(file, maxFileSize, acceptedTypes);
      if (!validacao.valido) {
        const erro = validacao.erro || 'Arquivo inválido';
        setState((prev) => ({
          ...prev,
          error: erro,
          file: null,
        }));
        onUploadError?.(erro);
        return;
      }

      // Iniciar upload
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        progress: 0,
        file,
      }));

      try {
        const resultado = await uploadArquivo(file, (progress) => {
          setState((prev) => ({
            ...prev,
            progress,
          }));
        });

        if (resultado.sucesso) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            result: resultado,
            error: null,
            progress: 100,
          }));
          onUploadSuccess?.(resultado);
        } else {
          const erro = resultado.erro || 'Erro no upload';
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: erro,
            result: null,
          }));
          onUploadError?.(erro);
        }
      } catch (erro) {
        const mensagem =
          erro instanceof ApiError
            ? erro.message
            : erro instanceof Error
              ? erro.message
              : 'Erro desconhecido no upload';

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: mensagem,
          result: null,
        }));
        onUploadError?.(mensagem);
      }
    },
    [maxFileSize, acceptedTypes, onUploadSuccess, onUploadError]
  );

  /**
   * Handle drag over
   */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  /**
   * Handle drag leave
   */
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  /**
   * Handle drop
   */
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const { files } = e.dataTransfer;
    if (files.length > 0) {
      processarArquivo(files[0]);
    }
  };

  /**
   * Handle file input change
   */
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files.length > 0) {
      processarArquivo(files[0]);
    }
  };

  /**
   * Handle click on drop zone
   */
  const handleClickZone = () => {
    inputRef.current?.click();
  };

  /**
   * Resetar estado
   */
  const resetar = () => {
    setState({
      isLoading: false,
      progress: 0,
      file: null,
      error: null,
      result: null,
    });
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Zona de Drop */}
      {!state.result && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClickZone}
          role="button"
          tabIndex={0}
          aria-label="Área de drop para upload de arquivos"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleClickZone();
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleFileInput}
            accept={acceptedTypes.join(',')}
            disabled={state.isLoading}
            aria-label="Seletor de arquivo para importação"
          />

          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-6-8l-6-6m0 0l-6 6m6-6v16"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <p className="text-lg font-semibold text-gray-900">
            Arraste o arquivo aqui ou clique para selecionar
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Tipos aceitos: OFX, CSV, PDF, JPEG, PNG (máximo {formatarTamanho(maxFileSize)})
          </p>
        </div>
      )}

      {/* Upload em Progresso */}
      {state.isLoading && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">
                Enviando: {state.file?.name}
              </h3>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${state.progress}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(state.progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progresso do upload"
                />
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {Math.round(state.progress)}%
              </p>
            </div>
            <button
              onClick={resetar}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={state.isLoading}
              aria-label="Cancelar upload"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Erro */}
      {state.error && !state.isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-1">Erro no upload</h3>
              <p className="text-sm text-red-700">{state.error}</p>
            </div>
            <button
              onClick={resetar}
              className="text-red-700 hover:text-red-900 font-medium"
              aria-label="Fechar mensagem de erro"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Sucesso */}
      {state.result && !state.isLoading && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-green-900 mb-2">
                Arquivo enviado com sucesso!
              </h3>
              <div className="space-y-1 text-sm text-green-700">
                <p>
                  <span className="font-medium">ID do lote:</span>{' '}
                  <code className="bg-green-100 px-2 py-1 rounded font-mono text-xs">
                    {state.result.lote_id}
                  </code>
                </p>
                <p>
                  <span className="font-medium">Arquivo:</span> {state.result.arquivo_nome}
                </p>
                <p>
                  <span className="font-medium">Tipo:</span> {state.result.tipo}
                </p>
                <p>
                  <span className="font-medium">Tamanho:</span>{' '}
                  {formatarTamanho(state.result.tamanho_bytes || 0)}
                </p>
              </div>
              <button
                onClick={resetar}
                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                aria-label="Enviar outro arquivo"
              >
                Enviar outro arquivo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportUpload;
