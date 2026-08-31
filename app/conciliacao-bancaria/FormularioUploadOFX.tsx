'use client';

import { useState, useRef } from 'react';

interface Conta {
  id: string;
  instituicao: string;
}

interface ResultadoUpload {
  importadas: number;
  jaExistentes: number;
}

interface Props {
  contas: Conta[];
  onUploadSucesso?: (resultado: ResultadoUpload) => void;
}

export function FormularioUploadOFX({ contas, onUploadSucesso }: Props) {
  const [contaSelecionada, setContaSelecionada] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!contaSelecionada) {
      setMensagem({ tipo: 'erro', texto: 'Selecione uma conta bancária.' });
      return;
    }

    const arquivo = fileInputRef.current?.files?.[0];
    if (!arquivo) {
      setMensagem({ tipo: 'erro', texto: 'Selecione um arquivo OFX.' });
      return;
    }

    try {
      setCarregando(true);
      const conteudo = await arquivo.text();

      const resposta = await fetch(`/api/contas-bancarias/${contaSelecionada}/importar-ofx`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: conteudo,
      });

      if (!resposta.ok) {
        const erro = await resposta.json();
        setMensagem({ tipo: 'erro', texto: erro.erro || 'Erro ao importar arquivo.' });
        return;
      }

      const resultado: ResultadoUpload = await resposta.json();
      setMensagem({
        tipo: 'sucesso',
        texto: `Importadas ${resultado.importadas} transações${resultado.jaExistentes > 0 ? ` (${resultado.jaExistentes} já existentes)` : ''}.`,
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setContaSelecionada('');

      onUploadSucesso?.(resultado);
    } catch (erro) {
      setMensagem({
        tipo: 'erro',
        texto: `Erro ao ler arquivo: ${erro instanceof Error ? erro.message : 'Desconhecido'}`,
      });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="formulario-upload-ofx">
      <fieldset disabled={carregando}>
        <legend>Importar Extrato Bancário (OFX)</legend>

        <div className="campo">
          <label htmlFor="conta">
            Conta Bancária:
            <select
              id="conta"
              value={contaSelecionada}
              onChange={(e) => setContaSelecionada(e.target.value)}
              required
            >
              <option value="">— Selecione uma conta —</option>
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {conta.instituicao}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="campo">
          <label htmlFor="arquivo">
            Arquivo OFX:
            <input
              id="arquivo"
              ref={fileInputRef}
              type="file"
              accept=".ofx,.txt,text/plain,application/x-ofx"
              required
            />
          </label>
        </div>

        <button type="submit" disabled={carregando}>
          {carregando ? 'Importando...' : 'Importar'}
        </button>
      </fieldset>

      {mensagem && (
        <div className={`mensagem mensagem-${mensagem.tipo}`}>
          {mensagem.texto}
        </div>
      )}
    </form>
  );
}
