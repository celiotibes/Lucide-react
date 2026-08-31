'use client';

import { useActionState, useState } from 'react';
import { registrarInteresseAction, type EstadoFormularioInteresse } from './actions';

export interface ImovelColivingOpcao {
  id: string;
  identificacao: string;
  comodos: { id: string; identificacao: string }[];
}

const ESTADO_INICIAL: EstadoFormularioInteresse = {};

function SeletorQuarto({ imoveis, nomeImovel, nomeComodo, obrigatorio }: {
  imoveis: ImovelColivingOpcao[];
  nomeImovel: string;
  nomeComodo: string;
  obrigatorio: boolean;
}) {
  const [imovelId, setImovelId] = useState('');
  const comodos = imoveis.find((i) => i.id === imovelId)?.comodos ?? [];

  return (
    <div className="grid-2">
      <label>
        Imóvel
        <select name={nomeImovel} required={obrigatorio} value={imovelId} onChange={(e) => setImovelId(e.target.value)}>
          <option value="">{obrigatorio ? 'Selecione...' : 'Sem 2ª opção'}</option>
          {imoveis.map((i) => (
            <option key={i.id} value={i.id}>
              {i.identificacao}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quarto
        <select name={nomeComodo} required={obrigatorio && imovelId !== ''} disabled={!imovelId}>
          <option value="">Selecione...</option>
          {comodos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.identificacao}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function FormularioInteresse({ imoveis }: { imoveis: ImovelColivingOpcao[] }) {
  const [estado, formAction, pendente] = useActionState(registrarInteresseAction, ESTADO_INICIAL);
  const [temPet, setTemPet] = useState(false);

  if (estado.sucesso) {
    return (
      <p className="section-hint">
        Cadastro recebido. A gestão vai avaliar seu perfil — se já houver outro candidato para o quarto vizinho, a análise de
        compatibilidade é calculada automaticamente; se você for o primeiro interessado, seu perfil fica registrado aguardando
        um segundo candidato.
      </p>
    );
  }

  return (
    <form action={formAction} className="formulario">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <div className="tcle-box">
        <strong>Termo de consentimento (LGPD):</strong> os dados de saúde e perfil de convivência coletados abaixo são usados
        exclusivamente para adequação de infraestrutura e formação da análise de compatibilidade — nunca para preterir
        candidatos ao acesso à moradia.
        <label style={{ display: 'block', marginTop: '0.5rem', fontWeight: 'normal' }}>
          <input type="checkbox" name="aceite_lgpd" required /> Li e concordo com o tratamento de dados para fins de triagem.
        </label>
      </div>

      <h3>Identificação</h3>
      <label>
        Nome completo
        <input name="nome" required />
      </label>
      <label>
        E-mail ou WhatsApp para contato
        <input name="contato" />
      </label>

      <h3>Quarto pretendido</h3>
      <SeletorQuarto imoveis={imoveis} nomeImovel="imovel_interesse_id" nomeComodo="comodo_interesse_id" obrigatorio />
      <h4>2ª opção (contingência, opcional)</h4>
      <SeletorQuarto
        imoveis={imoveis}
        nomeImovel="imovel_interesse_2_id"
        nomeComodo="comodo_interesse_2_id"
        obrigatorio={false}
      />

      <h3>Perfil de convivência</h3>

      <label>
        Limpeza nas áreas comuns
        <select name="v1_limpeza" defaultValue="2">
          <option value="1">Baixa (flexível com a arrumação diária)</option>
          <option value="2">Moderada (manutenção básica e funcional)</option>
          <option value="3">Alta (limpeza imediata após o uso)</option>
        </select>
      </label>

      <label>
        Sensibilidade a ruído/visitas
        <select name="v2_ruido" defaultValue="2">
          <option value="1">Hipersensível — exijo silêncio rigoroso</option>
          <option value="2">Moderada — cumprimento estrito do horário de silêncio</option>
          <option value="3">Tolerância normal a ruído cotidiano/visitas</option>
        </select>
      </label>

      <label>
        Cronotipo
        <select name="v3_rotina" defaultValue="2">
          <option value="1">Predominantemente diurno</option>
          <option value="2">Misto/variável</option>
          <option value="3">Predominantemente noturno</option>
        </select>
      </label>

      <label>
        Política de tabagismo
        <select name="v4_fumo" defaultValue="1">
          <option value="1">Exijo ambiente estritamente livre de fumo</option>
          <option value="2">Não fumante, mas tolero uso em área externa</option>
          <option value="3">Fumante ativo</option>
        </select>
      </label>

      <label>
        Tolerância a animais de estimação
        <select name="v5_pets" defaultValue="2">
          <option value="1">Intolerância/alergia severa</option>
          <option value="2">Tolerância restrita (só pequeno porte)</option>
          <option value="3">Alta tolerância/possuo pet</option>
        </select>
      </label>

      <label>
        Hábitos alimentares
        <select name="v6_dieta" defaultValue="1">
          <option value="1">Onívoro, sem restrições de utensílios</option>
          <option value="2">Vegetariano/vegano — prefiro separar louça</option>
          <option value="3">Restrição severa — risco de contaminação cruzada</option>
        </select>
      </label>

      <label>
        Resolução de conflitos
        <select name="v7_conflito" defaultValue="3">
          <option value="1">Evitação — tento ignorar e me isolar</option>
          <option value="2">Prefiro que a gestão intermedeie</option>
          <option value="3">Comunicação direta com o colega</option>
        </select>
      </label>

      <h3>Posse de animal</h3>
      <label>
        <input type="checkbox" name="tem_pet" checked={temPet} onChange={(e) => setTemPet(e.target.checked)} /> Terei um pet
        residindo no imóvel
      </label>
      {temPet && (
        <label>
          Espécie/porte
          <input name="descricao_pet" placeholder="ex.: gato, cão SRD pequeno porte" />
        </label>
      )}

      <h3>Saúde e adaptação (não eliminatório)</h3>
      <span className="section-hint">Usado só para adequação de infraestrutura e formação da análise de compatibilidade.</span>

      <label>
        Identidade de gênero
        <input name="genero" />
      </label>
      <label>
        Preferência de convivência
        <select name="preferencia_genero_convivio" defaultValue="indiferente">
          <option value="indiferente">Indiferente a gênero</option>
          <option value="mesmo_genero">Prefiro conviver só com o mesmo gênero</option>
        </select>
      </label>
      <label>
        Neurodivergência (opcional)
        <input name="neurodivergencia" placeholder="ex.: TDAH, TEA, ou deixe em branco" />
      </label>
      <label>
        Deficiência — PCD (opcional)
        <input name="pcd" placeholder="ex.: motora, auditiva/visual, ou deixe em branco" />
      </label>
      <label>
        Condição crônica de saúde (opcional)
        <input name="condicao_saude" />
      </label>
      <label>
        Quadro alérgico principal
        <select name="quadro_alergico" defaultValue="nenhuma">
          <option value="nenhuma">Nenhuma alergia</option>
          <option value="respiratoria">Respiratória (ácaro/mofo/poeira)</option>
          <option value="animais">Animais (pelos/saliva)</option>
          <option value="alimentar">Alimentar (glúten/lactose/amendoim)</option>
          <option value="medicamentosa_insetos">Medicamentosa/picada de insetos</option>
          <option value="outras">Outras</option>
          <option value="prefiro_nao_responder">Prefiro não responder</option>
        </select>
      </label>
      <label>
        Observação sobre alergia/saúde (opcional)
        <input name="quadro_alergico_detalhe" />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Enviando…' : 'Assinar termo e submeter triagem'}
      </button>
    </form>
  );
}
