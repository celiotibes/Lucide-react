'use client';

import { useActionState } from 'react';
import { uploadDocumentoContrato, type EstadoUploadDocumento } from './actions';

const ESTADO_INICIAL: EstadoUploadDocumento = {};

const RUBRICA_TIPO: Record<string, string> = {
  contrato_assinado: 'Contrato assinado',
  aditivo: 'Aditivo',
  comunicacao_renovacao: 'Comunicação de renovação',
  comunicacao_negociacao: 'Comunicação de negociação (e-mail)',
  outro: 'Outro',
};

export function FormularioUpload({ contratoId }: { contratoId: string }) {
  const uploadComContrato = uploadDocumentoContrato.bind(null, contratoId);
  const [estado, formAction, pendente] = useActionState(uploadComContrato, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}
      {estado.sucesso && <p className="aviso">Documento enviado. Processamento de leitura inicia em instantes.</p>}

      <label>
        Tipo de documento
        <select name="tipo" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {Object.entries(RUBRICA_TIPO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </label>

      <label>
        Arquivo (PDF, imagem ou Word — até 25MB)
        <input type="file" name="arquivo" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" required />
      </label>

      <button type="submit" disabled={pendente} className="botao-secundario">
        {pendente ? 'Enviando...' : 'Enviar documento'}
      </button>
    </form>
  );
}
