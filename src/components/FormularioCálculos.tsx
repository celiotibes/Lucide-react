/**
 * Componente: Formulários de Cálculos Jurídicos
 * 
 * 3 calculadores integrados:
 * - Dano Material (IPCA/TR/SELIC + juros)
 * - Pensão Alimentícia (Binômio)
 * - Dano Moral (Jurisprudência TJSP)
 * 
 * Uso:
 * <FormularioCálculos />
 */

import { useState } from 'react'
import useFetch from '@/hooks/useFetch'
import styles from './FormularioCálculos.module.css'

export function FormularioCálculos() {
  const [abaAtiva, setAbaAtiva] = useState<'dano-material' | 'pensao' | 'dano-moral'>(
    'dano-material'
  )

  return (
    <div className={styles.container}>
      <div className={styles.abas}>
        <button
          className={`${styles.aba} ${abaAtiva === 'dano-material' ? styles.ativo : ''}`}
          onClick={() => setAbaAtiva('dano-material')}
        >
          💰 Dano Material
        </button>
        <button
          className={`${styles.aba} ${abaAtiva === 'pensao' ? styles.ativo : ''}`}
          onClick={() => setAbaAtiva('pensao')}
        >
          👨‍👧 Pensão Alimentícia
        </button>
        <button
          className={`${styles.aba} ${abaAtiva === 'dano-moral' ? styles.ativo : ''}`}
          onClick={() => setAbaAtiva('dano-moral')}
        >
          ⚖️ Dano Moral
        </button>
      </div>

      <div className={styles.conteudo}>
        {abaAtiva === 'dano-material' && <FormularioDanoMaterial />}
        {abaAtiva === 'pensao' && <FormularioPensaoAlimenticia />}
        {abaAtiva === 'dano-moral' && <FormularioDanoMoral />}
      </div>
    </div>
  )
}

// ============================================================================
// DANO MATERIAL
// ============================================================================

function FormularioDanoMaterial() {
  const [formData, setFormData] = useState({
    data_dano: '2025-03-15',
    valor_original: '50000',
    tipo_correccao: 'IPCA',
  })

  const { data, loading, error, fetch } = useFetch()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/calcular/dano-material', {
      method: 'POST',
      body: formData,
    })
  }

  return (
    <div className={styles.formulario}>
      <h3>Calculador de Dano Material</h3>
      <p className={styles.descricao}>
        Correção monetária (IPCA/TR/SELIC) + juros compostos (1% a.m.)
      </p>

      <form onSubmit={handleSubmit}>
        <div className={styles.grupo}>
          <label>📅 Data do Dano (YYYY-MM-DD)</label>
          <input
            type="date"
            value={formData.data_dano}
            onChange={(e) => setFormData({ ...formData, data_dano: e.target.value })}
            required
          />
        </div>

        <div className={styles.grupo}>
          <label>💵 Valor Original (R$)</label>
          <input
            type="number"
            value={formData.valor_original}
            onChange={(e) => setFormData({ ...formData, valor_original: e.target.value })}
            min="0"
            step="0.01"
            required
          />
        </div>

        <div className={styles.grupo}>
          <label>📊 Tipo de Correção</label>
          <select
            value={formData.tipo_correccao}
            onChange={(e) => setFormData({ ...formData, tipo_correccao: e.target.value })}
          >
            <option value="IPCA">IPCA (Índice de Preços ao Consumidor Amplo)</option>
            <option value="TR">TR (Taxa Referencial)</option>
            <option value="SELIC">SELIC (Taxa média anual)</option>
          </select>
        </div>

        <button type="submit" disabled={loading} className={styles.botao}>
          {loading ? '⏳ Calculando...' : '🧮 Calcular'}
        </button>
      </form>

      {error && <div className={styles.erro}>❌ {error.message}</div>}

      {data && (
        <div className={styles.resultado}>
          <h4>📋 Resultado</h4>
          <div className={styles.linhaResultado}>
            <span>Valor Corrigido:</span>
            <strong>R$ {parseFloat(data.valor_corrigido).toLocaleString('pt-BR')}</strong>
          </div>
          <div className={styles.linhaResultado}>
            <span>Juros de Mora:</span>
            <strong>R$ {parseFloat(data.juros_compostos).toLocaleString('pt-BR')}</strong>
          </div>
          <div className={styles.linhaResultado} style={{ fontSize: '18px', borderTop: '2px solid #333' }}>
            <span>💰 TOTAL:</span>
            <strong>R$ {parseFloat(data.valor_total).toLocaleString('pt-BR')}</strong>
          </div>
          <p className={styles.fundamento}>
            <strong>Fundamento Legal:</strong> {data.fundamento_legal}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PENSÃO ALIMENTÍCIA (Binômio)
// ============================================================================

function FormularioPensaoAlimenticia() {
  const [formData, setFormData] = useState({
    renda_credor: '1500',
    despesas_credor: '2500',
    idade_credor: '18',
    renda_devedor: '5000',
    despesas_devedor: '2000',
    situacao_devedor: 'empregado',
  })

  const { data, loading, error, fetch } = useFetch()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/calcular/pensao-alimenticia', {
      method: 'POST',
      body: formData,
    })
  }

  return (
    <div className={styles.formulario}>
      <h3>Análise: Binômio Necessidade-Possibilidade</h3>
      <p className={styles.descricao}>
        Determina viabilidade de ação de alimentos (art. 1.694 CC)
      </p>

      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>📊 Quem Recebe (Credor/Filho)</legend>

          <div className={styles.grupo}>
            <label>Renda Própria Mensal (R$)</label>
            <input
              type="number"
              value={formData.renda_credor}
              onChange={(e) => setFormData({ ...formData, renda_credor: e.target.value })}
              min="0"
              step="0.01"
            />
          </div>

          <div className={styles.grupo}>
            <label>Despesas Mensais (R$)</label>
            <input
              type="number"
              value={formData.despesas_credor}
              onChange={(e) => setFormData({ ...formData, despesas_credor: e.target.value })}
              min="0"
              step="0.01"
            />
          </div>

          <div className={styles.grupo}>
            <label>Idade</label>
            <input
              type="number"
              value={formData.idade_credor}
              onChange={(e) => setFormData({ ...formData, idade_credor: e.target.value })}
              min="0"
              max="120"
            />
          </div>
        </fieldset>

        <fieldset>
          <legend>👨‍💼 Quem Paga (Devedor/Pai)</legend>

          <div className={styles.grupo}>
            <label>Renda Bruta Mensal (R$)</label>
            <input
              type="number"
              value={formData.renda_devedor}
              onChange={(e) => setFormData({ ...formData, renda_devedor: e.target.value })}
              min="0"
              step="0.01"
              required
            />
          </div>

          <div className={styles.grupo}>
            <label>Despesas Essenciais (Moradia, Saúde, Educação)</label>
            <input
              type="number"
              value={formData.despesas_devedor}
              onChange={(e) => setFormData({ ...formData, despesas_devedor: e.target.value })}
              min="0"
              step="0.01"
            />
          </div>

          <div className={styles.grupo}>
            <label>Situação Ocupacional</label>
            <select
              value={formData.situacao_devedor}
              onChange={(e) => setFormData({ ...formData, situacao_devedor: e.target.value })}
            >
              <option value="empregado">Empregado (CLT)</option>
              <option value="autonomo">Autônomo</option>
              <option value="aposentado">Aposentado</option>
              <option value="desempregado">Desempregado</option>
              <option value="invalidez">Em situação de invalidez</option>
            </select>
          </div>
        </fieldset>

        <button type="submit" disabled={loading} className={styles.botao}>
          {loading ? '⏳ Analisando...' : '⚖️ Analisar Binômio'}
        </button>
      </form>

      {error && <div className={styles.erro}>❌ {error.message}</div>}

      {data && (
        <div className={styles.resultado}>
          <h4>📋 Análise do Binômio</h4>

          <div className={styles.caixa}>
            <strong>Necessidade (Credor):</strong>{' '}
            {data.necessidade_comprovada ? (
              <span style={{ color: '#d32f2f' }}>❌ Comprovada - Carece de recursos</span>
            ) : (
              <span style={{ color: '#2e7d32' }}>✅ Não comprovada - Tem renda suficiente</span>
            )}
          </div>

          <div className={styles.caixa}>
            <strong>Possibilidade (Devedor):</strong>{' '}
            {data.possibilidade_comprovada ? (
              <span style={{ color: '#2e7d32' }}>✅ Comprovada - Pode contribuir</span>
            ) : (
              <span style={{ color: '#d32f2f' }}>❌ Não comprovada - Sem capacidade</span>
            )}
          </div>

          <div className={styles.caixa}>
            <strong>Binômio Completo:</strong>{' '}
            {data.binomio_completo ? (
              <span style={{ color: '#2e7d32', fontSize: '18px' }}>✅ SIM - Ação viável!</span>
            ) : (
              <span style={{ color: '#d32f2f', fontSize: '18px' }}>❌ NÃO - Ação improcedente</span>
            )}
          </div>

          {data.binomio_completo && (
            <div className={styles.linhaResultado} style={{ fontSize: '18px', borderTop: '2px solid #333', marginTop: '10px' }}>
              <span>💰 Valor Recomendado:</span>
              <strong>R$ {parseFloat(data.valor_recomendado).toLocaleString('pt-BR')}</strong>
            </div>
          )}

          <p className={styles.recomendacao}>{data.recomendacao}</p>
          <p className={styles.fundamento}>
            <strong>Fundamento Legal:</strong> {data.fundamento_legal}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// DANO MORAL
// ============================================================================

function FormularioDanoMoral() {
  const [formData, setFormData] = useState({
    tipo_dano: 'moderado',
    descricao_fato: 'Violação de direitos autorais',
    fatores_agravantes: [] as string[],
    renda_vitima: '5000',
  })

  const { data, loading, error, fetch } = useFetch()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/calcular/dano-moral', {
      method: 'POST',
      body: formData,
    })
  }

  return (
    <div className={styles.formulario}>
      <h3>Calculador de Dano Moral</h3>
      <p className={styles.descricao}>
        Jurisprudência TJSP 2024 com faixas de R$ 1K a R$ 500K
      </p>

      <form onSubmit={handleSubmit}>
        <div className={styles.grupo}>
          <label>⚖️ Tipo de Dano Moral</label>
          <select
            value={formData.tipo_dano}
            onChange={(e) => setFormData({ ...formData, tipo_dano: e.target.value })}
          >
            <option value="leve">Leve (R$ 1K-5K) - Incômodo, constrangimento leve</option>
            <option value="moderado">Moderado (R$ 5K-20K) - Violação clara de direitos</option>
            <option value="grave">Grave (R$ 20K-100K) - Dano à dignidade, reputação</option>
            <option value="muito_grave">Muito Grave (R$ 100K-500K) - Dano irreversível</option>
          </select>
        </div>

        <div className={styles.grupo}>
          <label>📝 Descrição do Fato</label>
          <textarea
            value={formData.descricao_fato}
            onChange={(e) => setFormData({ ...formData, descricao_fato: e.target.value })}
            rows={3}
            placeholder="Descreva o fato danoso..."
          />
        </div>

        <div className={styles.grupo}>
          <label>💰 Renda Mensal da Vítima (R$) - Opcional</label>
          <input
            type="number"
            value={formData.renda_vitima}
            onChange={(e) => setFormData({ ...formData, renda_vitima: e.target.value })}
            min="0"
            step="0.01"
            placeholder="Para proporcionalidade (art. 944 CC)"
          />
        </div>

        <button type="submit" disabled={loading} className={styles.botao}>
          {loading ? '⏳ Calculando...' : '🧮 Calcular Indenização'}
        </button>
      </form>

      {error && <div className={styles.erro}>❌ {error.message}</div>}

      {data && (
        <div className={styles.resultado}>
          <h4>📋 Recomendação de Valor</h4>

          <div className={styles.linhaResultado} style={{ fontSize: '18px', borderTop: '2px solid #333' }}>
            <span>💰 Valor Ideal:</span>
            <strong>R$ {parseFloat(data.recomendacao_pedido.valor_ideal).toLocaleString('pt-BR')}</strong>
          </div>

          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <small>
              Faixa jurisprudencial: R${parseFloat(data.recomendacao_pedido.valor_minimo).toLocaleString('pt-BR')} - R${parseFloat(data.recomendacao_pedido.valor_maximo).toLocaleString('pt-BR')}
            </small>
          </div>

          <p className={styles.recomendacao}>{data.recomendacao_pedido.pedido_recomendado}</p>
          <p className={styles.fundamento}>
            <strong>Fundamento Legal:</strong> {data.fundamento_legal}
          </p>
        </div>
      )}
    </div>
  )
}

export default FormularioCálculos
