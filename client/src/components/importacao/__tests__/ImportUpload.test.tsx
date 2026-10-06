/**
 * Testes para o componente ImportUpload
 *
 * Testa:
 * - Renderização inicial
 * - Validação de arquivo
 * - Upload progress
 * - Error handling
 * - Callback execution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportUpload } from '../ImportUpload.js';
import * as api from '../api.js';

/**
 * Mock do módulo de API
 */
vi.mock('../api.js', () => ({
  uploadArquivo: vi.fn(),
  ApiError: Error,
}));

describe('ImportUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Renderização', () => {
    it('deve renderizar zona de drop com texto descritivo', () => {
      render(<ImportUpload />);

      expect(
        screen.getByText(/Arraste o arquivo aqui ou clique para selecionar/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Tipos aceitos: OFX, CSV, PDF, JPEG, PNG/i)
      ).toBeInTheDocument();
    });

    it('deve ter um input de arquivo hidden', () => {
      render(<ImportUpload />);

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      expect(input).toHaveClass('hidden');
      expect(input).toHaveAttribute('type', 'file');
    });

    it('deve ter área de drop acessível via teclado', () => {
      render(<ImportUpload />);

      const dropZone = screen.getByRole('button', {
        name: /Área de drop para upload de arquivos/i,
      });
      expect(dropZone).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Validação de Arquivo', () => {
    it('deve aceitar arquivo CSV válido', async () => {
      const onUploadSuccess = vi.fn();
      render(<ImportUpload onUploadSuccess={onUploadSuccess} />);

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });

      // Mock upload bem-sucedido
      vi.mocked(api.uploadArquivo).mockResolvedValueOnce({
        sucesso: true,
        lote_id: 'lote-123',
        arquivo_nome: 'test.csv',
        tipo: 'CSV' as any,
        tamanho_bytes: 9,
      });

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(api.uploadArquivo).toHaveBeenCalledWith(file, expect.any(Function));
      });
    });

    it('deve rejeitar arquivo muito grande', async () => {
      const maxSize = 1024; // 1 KB
      const onUploadError = vi.fn();
      render(
        <ImportUpload
          maxFileSize={maxSize}
          onUploadError={onUploadError}
        />
      );

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const largeFile = new File(['x'.repeat(2048)], 'large.csv', {
        type: 'text/csv',
      });

      fireEvent.change(input, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(onUploadError).toHaveBeenCalledWith(
          expect.stringContaining('muito grande')
        );
      });
      expect(screen.getByText(/Arquivo muito grande/i)).toBeInTheDocument();
    });

    it('deve rejeitar tipo de arquivo não permitido', async () => {
      const onUploadError = vi.fn();
      render(
        <ImportUpload
          acceptedTypes={['text/csv']}
          onUploadError={onUploadError}
        />
      );

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const invalidFile = new File(['content'], 'test.txt', {
        type: 'text/plain',
      });

      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(onUploadError).toHaveBeenCalledWith(
          expect.stringContaining('não suportado')
        );
      });
    });
  });

  describe('Upload', () => {
    it('deve exibir barra de progresso durante upload', async () => {
      render(<ImportUpload />);

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const file = new File(['test'], 'test.csv', { type: 'text/csv' });

      let progressCallback: ((progress: number) => void) | undefined;
      vi.mocked(api.uploadArquivo).mockImplementationOnce(
        (f, onProgress) => {
          progressCallback = onProgress;
          return new Promise(() => {}); // Never resolves
        }
      );

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/Enviando: test.csv/i)).toBeInTheDocument();
      });

      // Simular progresso
      if (progressCallback) {
        progressCallback(50);
        expect(screen.getByText(/50%/i)).toBeInTheDocument();
      }
    });

    it('deve chamar onUploadSuccess após upload bem-sucedido', async () => {
      const onUploadSuccess = vi.fn();
      render(<ImportUpload onUploadSuccess={onUploadSuccess} />);

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const file = new File(['test'], 'test.csv', { type: 'text/csv' });

      const resultadoEsperado = {
        sucesso: true,
        lote_id: 'lote-123',
        arquivo_nome: 'test.csv',
        tipo: 'CSV' as any,
        tamanho_bytes: 4,
      };

      vi.mocked(api.uploadArquivo).mockResolvedValueOnce(resultadoEsperado);

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(onUploadSuccess).toHaveBeenCalledWith(resultadoEsperado);
      });

      expect(
        screen.getByText(/Arquivo enviado com sucesso!/i)
      ).toBeInTheDocument();
    });

    it('deve chamar onUploadError em caso de falha', async () => {
      const onUploadError = vi.fn();
      render(<ImportUpload onUploadError={onUploadError} />);

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const file = new File(['test'], 'test.csv', { type: 'text/csv' });

      const erro = new Error('Erro no servidor');
      vi.mocked(api.uploadArquivo).mockRejectedValueOnce(erro);

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(onUploadError).toHaveBeenCalledWith('Erro no servidor');
      });

      expect(screen.getByText(/Erro no upload/i)).toBeInTheDocument();
    });
  });

  describe('Drag and Drop', () => {
    it('deve aceitar arquivo via drag and drop', async () => {
      const onUploadSuccess = vi.fn();
      render(<ImportUpload onUploadSuccess={onUploadSuccess} />);

      const dropZone = screen.getByRole('button', {
        name: /Área de drop para upload de arquivos/i,
      });

      const file = new File(['test'], 'test.csv', { type: 'text/csv' });

      vi.mocked(api.uploadArquivo).mockResolvedValueOnce({
        sucesso: true,
        lote_id: 'lote-123',
        arquivo_nome: 'test.csv',
        tipo: 'CSV' as any,
        tamanho_bytes: 4,
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const dropEvent = new DragEvent('drop', {
        dataTransfer,
        bubbles: true,
      });

      fireEvent.drop(dropZone, { dataTransfer });

      await waitFor(() => {
        expect(api.uploadArquivo).toHaveBeenCalled();
      });
    });

    it('deve atualizar estilo ao fazer drag over', () => {
      render(<ImportUpload />);

      const dropZone = screen.getByRole('button', {
        name: /Área de drop para upload de arquivos/i,
      });

      fireEvent.dragOver(dropZone);
      expect(dropZone).toHaveClass('border-blue-500', 'bg-blue-50');
    });
  });

  describe('Estados', () => {
    it('deve permitir resetar após sucesso', async () => {
      render(<ImportUpload />);

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const file = new File(['test'], 'test.csv', { type: 'text/csv' });

      vi.mocked(api.uploadArquivo).mockResolvedValueOnce({
        sucesso: true,
        lote_id: 'lote-123',
        arquivo_nome: 'test.csv',
        tipo: 'CSV' as any,
        tamanho_bytes: 4,
      });

      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText(/Arquivo enviado com sucesso!/i)).toBeInTheDocument();
      });

      const botaoReset = screen.getByRole('button', {
        name: /Enviar outro arquivo/i,
      });
      fireEvent.click(botaoReset);

      expect(
        screen.getByText(/Arraste o arquivo aqui ou clique para selecionar/i)
      ).toBeInTheDocument();
    });
  });

  describe('Acessibilidade', () => {
    it('deve ter labels ARIA apropriados', () => {
      render(<ImportUpload />);

      expect(
        screen.getByLabelText(/Área de drop para upload de arquivos/i)
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Seletor de arquivo para importação/i)
      ).toBeInTheDocument();
    });

    it('deve ter progressbar com atributos aria', async () => {
      render(<ImportUpload />);

      const input = screen.getByLabelText(/Seletor de arquivo para importação/i);
      const file = new File(['test'], 'test.csv', { type: 'text/csv' });

      let progressCallback: ((progress: number) => void) | undefined;
      vi.mocked(api.uploadArquivo).mockImplementationOnce(
        (f, onProgress) => {
          progressCallback = onProgress;
          return new Promise(() => {});
        }
      );

      fireEvent.change(input, { target: { files: [file] } });

      if (progressCallback) {
        progressCallback(50);

        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '50');
        expect(progressBar).toHaveAttribute('aria-valuemin', '0');
        expect(progressBar).toHaveAttribute('aria-valuemax', '100');
      }
    });
  });
});
