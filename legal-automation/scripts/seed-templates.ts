import { Pool } from 'pg';
import { config } from '../src/utils/config';

const pool = new Pool({
  connectionString: config.database_url || 'postgresql://localhost:5432/legal_automation',
});

const seedTemplates = [
  {
    name: 'Petição Inicial - Dano Moral',
    type: 'initial',
    category: 'indenizacao',
    jurisdiction: ['tjsc', 'tjpr', 'tjmt', 'tjro'],
    variables: JSON.stringify([
      { name: 'plaintiff_name', type: 'string', required: true, placeholder: 'Nome do autor' },
      { name: 'plaintiff_cpf', type: 'string', required: true, placeholder: '000.000.000-00' },
      { name: 'defendant_name', type: 'string', required: true, placeholder: 'Nome do réu' },
      { name: 'incident_date', type: 'date', required: true, placeholder: 'Data do fato' },
      {
        name: 'incident_description',
        type: 'multiline',
        required: true,
        placeholder: 'Descrição detalhada do ocorrido',
      },
      {
        name: 'moral_damage_amount',
        type: 'number',
        required: true,
        placeholder: 'Valor da indenização',
      },
      {
        name: 'evidence',
        type: 'multiline',
        required: false,
        placeholder: 'Provas/documentos',
      },
    ]),
    content: `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO

{{plaintiff_name}}, inscrito na CPF {{plaintiff_cpf}}, devidamente representado neste ato, vem respeitosamente perante Vossa Excelência interpor AÇÃO DE INDENIZAÇÃO POR DANO MORAL contra {{defendant_name}}, pelos fatos e razões seguintes:

DOS FATOS

Em {{incident_date}}, o autor sofreu grave dano moral em virtude dos seguintes fatos:

{{incident_description}}

DA FUNDAMENTAÇÃO JURÍDICA

O direito à reparação de dano moral encontra fundamento no artigo 5º, inciso X da Constituição Federal, bem como nos artigos 186 e 927 do Código Civil Brasileiro.

A jurisprudência pacífica tem reconhecido o direito à indenização por dano moral em casos análogos ao presente, quando comprovada a culpa do agente.

PEDIDO

Diante do exposto, requer o autor:

a) A condenação do réu ao pagamento de indenização por dano moral no valor de R$ {{moral_damage_amount}};
b) O pagamento das custas processuais e honorários advocatícios;
c) Condenação à taxa Selic em caso de condenação.

Termos em que pede deferimento.

Respeitosamente submetido.

Data: __/__/____`,
    ai_generated: false,
    status: 'active',
  },
  {
    name: 'Petição Inicial - Ação Trabalhista',
    type: 'initial',
    category: 'trabalhista',
    jurisdiction: ['tjsc', 'tjpr', 'tjmt', 'tjro'],
    variables: JSON.stringify([
      { name: 'employee_name', type: 'string', required: true },
      { name: 'employee_cpf', type: 'string', required: true },
      { name: 'employer_name', type: 'string', required: true },
      { name: 'employment_period', type: 'string', required: true },
      { name: 'salary', type: 'number', required: true },
      { name: 'claim_type', type: 'string', required: true, placeholder: 'Tipos: Rescisão, Diferenças Salariais, etc' },
      { name: 'claim_amount', type: 'number', required: true },
    ]),
    content: `RECLAMAÇÃO TRABALHISTA

Reclamante: {{employee_name}}, CPF {{employee_cpf}}
Reclamada: {{employer_name}}
Período: {{employment_period}}
Salário: R$ {{salary}}

OBJETO:
{{claim_type}} - Valor total reclamado: R$ {{claim_amount}}

EXPOSIÇÃO DOS FATOS:
[Descrição dos fatos relevantes]

FUNDAMENTAÇÃO:
O direito trabalhista assegura proteção ao empregado conforme Consolidação das Leis do Trabalho (CLT).

PEDIDOS:
1. Condenação ao pagamento de {{claim_amount}}
2. Custas e despesas processuais
3. Honorários advocatícios`,
    ai_generated: false,
    status: 'active',
  },
  {
    name: 'Petição Intermediária - Impugnação de Sentença',
    type: 'intermediate',
    category: 'geral',
    jurisdiction: ['tjsc', 'tjpr', 'tjmt', 'tjro'],
    variables: JSON.stringify([
      { name: 'process_number', type: 'string', required: true },
      { name: 'judge_name', type: 'string', required: false },
      { name: 'sentence_date', type: 'date', required: true },
      { name: 'impugn_reasons', type: 'multiline', required: true },
      { name: 'legal_arguments', type: 'multiline', required: true },
    ]),
    content: `PETIÇÃO DE IMPUGNAÇÃO

Processo: {{process_number}}
Data da Sentença: {{sentence_date}}

FUNDAMENTAÇÃO:

Respeitosamente vem a parte impugnar a sentença proferida neste processo pelos seguintes motivos:

{{impugn_reasons}}

ARGUMENTAÇÃO JURÍDICA:

{{legal_arguments}}

Requer-se a reforma da decisão.

Data: __/__/____`,
    ai_generated: false,
    status: 'active',
  },
  {
    name: 'Contrarrazões de Apelação',
    type: 'appeal',
    category: 'geral',
    jurisdiction: ['tjsc', 'tjpr', 'tjmt', 'tjro'],
    variables: JSON.stringify([
      { name: 'plaintiff_name', type: 'string', required: true },
      { name: 'process_number', type: 'string', required: true },
      { name: 'appeal_arguments', type: 'multiline', required: true },
      { name: 'legal_precedent', type: 'multiline', required: false },
    ]),
    content: `CONTRARRAZÕES DE APELAÇÃO

Apelante: {{plaintiff_name}}
Processo: {{process_number}}

As contrarrazões seguem fundamentadas nos seguintes pontos:

{{appeal_arguments}}

Jurisprudência aplicável:
{{legal_precedent}}

Requer-se a manutenção da sentença apelada.`,
    ai_generated: false,
    status: 'active',
  },
  {
    name: 'Moção para Prorrogação de Prazo',
    type: 'motion',
    category: 'geral',
    jurisdiction: ['tjsc', 'tjpr', 'tjmt', 'tjro'],
    variables: JSON.stringify([
      { name: 'process_number', type: 'string', required: true },
      { name: 'current_deadline', type: 'date', required: true },
      { name: 'justification', type: 'multiline', required: true },
      { name: 'requested_period', type: 'string', required: true, placeholder: 'Ex: 15 dias' },
    ]),
    content: `MOÇÃO PARA PRORROGAÇÃO DE PRAZO

Processo: {{process_number}}
Prazo original: {{current_deadline}}
Período solicitado: {{requested_period}}

JUSTIFICATIVA:

{{justification}}

Requer-se o acolhimento da moção.

Data: __/__/____`,
    ai_generated: false,
    status: 'active',
  },
];

async function seedDatabase() {
  const client = await pool.connect();

  try {
    console.log('🌱 Seeding templates...');

    await client.query('BEGIN');

    for (const template of seedTemplates) {
      const result = await client.query(
        `INSERT INTO templates
         (name, type, category, content, variables, jurisdiction, status, ai_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name`,
        [
          template.name,
          template.type,
          template.category,
          template.content,
          template.variables,
          template.jurisdiction,
          template.status,
          template.ai_generated,
        ],
      );

      console.log(`✓ Seeded: ${result.rows[0].name}`);
    }

    await client.query('COMMIT');
    console.log(`✅ Successfully seeded ${seedTemplates.length} templates`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
