import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../entidadeLegal";
import { encerrarPeriodo, validarBalanceamento } from "../ledger";
import { gerarDRE, gerarBalanco, gerarFluxoCaixa, type LinhasDRE, type LinhasBalancete } from "../relatorios-integrados";
import { CONTA_CAIXA_ERP } from "../mapeamentoPlanoApp";
import { historicoRazaoDaTransacao, reclassificarTransacao } from "../../reclassificacao/reclassificarTransacao";

const TOLERANCIA = 0.01; // mesma margem usada em conciliacao.ts e ledger.ts

/**
 * TESTE PONTA A PONTA: reconstituição contábil de um ano inteiro de movimento, simulando o
 * critério de sucesso do produto ("para qualquer valor, dizer de onde veio, qual regra o
 * classificou, quem aprovou, o que mudou, qual documento prova e como reproduzir o
 * cálculo") e verificando que DRE, Balanço e Fluxo de Caixa BATEM ENTRE SI — não apenas que
 * cada um roda sem erro isoladamente, que é tudo que os 17 testes de
 * relatorios-integrados.test.ts (fixtures pequenos, uma função por vez) cobrem hoje.
 *
 * CENÁRIO (2025, pessoa física, 1 imóvel alugado):
 *   - 1 entidade legal (CPF válido) + 2 contas bancárias cadastradas (1 em uso).
 *   - 1 imóvel + 1 contrato de locação residencial (R$ 2.000/mês), aluguel recebido nos 12
 *     meses via `transacoes` (o caminho real de produção — migracao-ledger.ts; não existe
 *     `contratos-ledger-integration.ts` no repositório, então "contratos" como
 *     origem_modulo do ledger não é como o sistema de fato classifica hoje).
 *   - Condomínio (que no plano do app, "2.1.01", já inclui IPTU — mapeamentoPlanoApp.ts)
 *     pago nos 12 meses; manutenção paga em 3 meses distintos (fev, jun, out).
 *   - 1 despesa de capital (reforma, código "2.1.03") em junho — deve capitalizar no ativo
 *     (1.2.05), não virar despesa do período.
 *   - 1 transação de março lançada com o código ERRADO (condomínio) e depois corrigida via
 *     `reclassificarTransacao` para o código certo (manutenção) — before/after em todos os
 *     relatórios.
 *   - Fechamento do período de janeiro via `encerrarPeriodo`.
 *
 * ACHADOS (gravidade CRÍTICA, novos — não cobertos por nenhum teste em __auditoria__/):
 * este cenário realista, com movimento em AMBOS os lados (débito e crédito) da mesma conta
 * ao longo de vários meses, expõe três defeitos que nenhum teste unitário anterior
 * alcançava (os testes existentes em __auditoria__/balanco-patrimonial.test.ts, por
 * exemplo, só lançam um único débito OU um único crédito por conta — nunca os dois).
 *
 * A) gerarBalanco / gerarBalancoComFiltro (relatorios-integrados.ts, getAtivoConta
 *    ~L309-321, getPassivoConta ~L323-335, getPatrimonioLiquidoConta ~L337-349, e os
 *    gêmeos em gerarBalancoComFiltro ~L703-761): a query usa
 *      SUM(CASE WHEN cp.natureza = 'debito' THEN le.valor_debito ELSE le.valor_credito END)
 *    Isso soma SÓ o lado natural da conta e IGNORA POR COMPLETO qualquer lançamento no lado
 *    oposto — nunca desconta. Como toda conta do plano real é homogênea (todo ativo é
 *    'debito', todo passivo/PL é 'credito' — planoDeContasErp.ts), o CASE nunca cai no
 *    ELSE na prática: o total apresentado é a soma de TODOS os débitos já lançados na conta
 *    (para ativo) desde sempre, e NUNCA diminui — nem quando dinheiro sai do caixa (crédito
 *    em 1.1.01), nem quando um passivo é baixado (débito em 3.2.01), nem quando um
 *    lançamento é estornado. Neste cenário, o Ativo de dezembro sai R$ 74.000,00 quando o
 *    correto (caixa líquido + imóvel) é R$ 18.700,00 — sobra exatamente a soma de todos os
 *    créditos ao caixa do ano (condomínio + manutenção + obra + o lançamento reclassificado
 *    = R$ 55.300,00).
 *
 * B) gerarFluxoCaixa / gerarFluxoCaixaComFiltro (relatorios-integrados.ts ~L410-442 e
 *    ~L811-848): `saldo_inicial` tem o MESMO defeito do CASE acima (só soma o lado natural
 *    do caixa, ignorando saídas) E, adicionalmente, só olha o período IMEDIATAMENTE
 *    anterior — nunca acumula os meses anteriores a esse. A partir do 2º mês migrado, o
 *    saldo final do Fluxo de Caixa diverge do saldo real do razão (SUM(valor_debito) -
 *    SUM(valor_credito) da conta de caixa, a mesma lógica que conciliacao.ts::saldo_razao
 *    já usa e testa).
 *
 * C) gerarDRE / gerarDREComFiltro (relatorios-integrados.ts, getDebito/getCredito
 *    ~L175-197 e ~L571-605): `SUM(le.valor_debito)`/`SUM(le.valor_credito)` brutos, SEM
 *    descontar estornos. `reclassificarTransacao` (o desenho está correto: estorna a perna
 *    antiga e lança uma nova — nunca dá UPDATE) gera, na MESMA conta antiga, um débito
 *    original e um crédito de estorno de mesmo valor. Como a DRE soma só a coluna de
 *    débito sem olhar a de crédito da mesma linha, o estorno não desconta NADA: a despesa
 *    original continua contada por inteiro na conta antiga, e a nova classificação soma por
 *    cima na conta nova — uma reclassificação DOBRA a despesa em vez de corrigi-la, sempre
 *    que a correção cai no mesmo período contábil (o caso comum). Prova neste teste: R$
 *    500,00 reclassificados de Condomínio para Manutenção aparecem CORRETAMENTE somados em
 *    Manutenção (R$ 500,00 — a parte nova funciona) mas CONTINUAM em Condomínio (que
 *    deveria cair para R$ 300,00 e permanece em R$ 800,00) — a despesa é contada duas vezes,
 *    não corrigida.
 *
 * D) Ausência de lançamento de encerramento (não é um bug de uma função específica, é uma
 *    lacuna estrutural): nenhum lugar do código transfere o resultado do período (receita −
 *    despesa) para uma conta de Patrimônio Líquido (2.1.02 "Lucros acumulados" existe no
 *    plano — planoDeContasErp.ts L41 — mas nunca é creditada por nada; `encerrarPeriodo` em
 *    ledger.ts fecha o período e grava o snapshot/hash, mas não lança essa transferência).
 *    Por isso o Patrimônio Líquido do Balanço nunca se move com o resultado operacional: a
 *    variação do PL entre o início e o fim de um período é R$ 0,00 mesmo quando a DRE do
 *    mesmo período aponta um resultado de R$ 1.700,00 — a peça central pedida pela auditoria
 *    ("a DRE liga com o Balanço") não fecha por falta dessa transferência.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__tests__/reconstituicao-golden-path.test.ts`.
 *
 * Onde corrigir (fora do escopo desta tarefa, que é só escrever e fazer passar o teste):
 *   - A: trocar o CASE por SUM(valor_debito) - SUM(valor_credito) (ativo) / SUM(valor_credito)
 *     - SUM(valor_debito) (passivo/PL), sempre líquido, nunca picking um lado só.
 *   - B: acumular saldo_inicial por todos os períodos <= o anterior (mesma
 *     `condicaoAcumulada` que gerarBalanco já usa), com o mesmo netting do item A.
 *   - C: subtrair estornos — SUM(valor_debito) - SUM(valor_credito) por conta em vez de só
 *     a coluna do lado nominal, OU excluir da soma qualquer lançamento com
 *     estornado_por_id IS NOT NULL e excluir o próprio estorno.
 *   - D: em encerrarPeriodo, lançar a transferência de resultado do período para 2.1.02.
 */
describe("Reconstituição contábil — golden path de 1 ano (2025)", () => {
  let db: Database;
  let entidade_id: number;
  let operador_id: number;

  // Ids das transações inseridas — usados por vários testes.
  let idAlugueis: number[]; // 12, um por mês
  let idCondominios: number[]; // 12, um por mês
  let idManutencoes: number[]; // 3 (fev, jun, out)
  let idCapex: number;
  let idMiscodificada: number; // março: lançada como condomínio, depois reclassificada

  let periodoPorMes: Record<number, number>; // mes(1-12) -> periodo_id

  // Snapshots antes/depois da reclassificação de março, capturados uma única vez no
  // beforeAll para nenhum teste depender de outro ter rodado antes.
  let dreMarAntes: LinhasDRE;
  let dreMarDepois: LinhasDRE;
  let balancoMarAntes: LinhasBalancete;
  let balancoMarDepois: LinhasBalancete;
  let resultadoReclassificacao: ReturnType<typeof reclassificarTransacao>;

  let fechamentoJaneiro: { sucesso: boolean; mensagem: string };

  beforeAll(async () => {
    db = await criarBancoDeTeste();

    // 1-2 contas bancárias — a segunda cadastrada mas sem movimento, como uma conta
    // poupança ociosa real costuma aparecer no cadastro sem nunca ser usada.
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Banco Principal', '0001', '111112', 'Titular de Teste', 'corrente')",
    );
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (2, 'Banco Secundário', '0002', '222223', 'Titular de Teste', 'poupanca')",
    );

    // CPF real na aritmética dos dígitos verificadores, sem titular — o mesmo exemplo
    // canônico já usado em migracao-ledger.test.ts e nos testes de __auditoria__.
    const onboarding = criarEntidadeLegal(db, {
      nome: "Titular de Teste — Golden Path",
      cpf_cnpj: "529.982.247-25",
    });
    if (!onboarding.sucesso || !onboarding.entidade_id) {
      throw new Error(`Fixture não conseguiu criar a entidade: ${onboarding.mensagem}`);
    }
    entidade_id = onboarding.entidade_id;
    operador_id = 7; // "quem aprovou" a reclassificação, adiante

    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, cidade, endereco, financiado, uso_pessoal)
       VALUES (1, 'Kitnet Centro', 'apartamento', 'Florianópolis', 'Rua Teste, 100', 0, 0)`,
    );
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
       VALUES (1, 1, 'Locatário de Teste', 'residencial_fixo', 2000, 5, '2025-01-01')`,
    );

    // === 12 meses de aluguel recebido (contrato 1, imóvel 1) — o caminho real de
    // produção: transação bancária → migracao-ledger.ts → ledger_entries
    // (origem_modulo='transacoes'). Ligada ao contrato/imóvel de origem via
    // transacoes.contrato_id/imovel_id, para a rastreabilidade "de onde veio".
    idAlugueis = [];
    idCondominios = [];
    let proximoId = 1;
    for (let mes = 1; mes <= 12; mes++) {
      const idAluguel = proximoId++;
      executar(
        db,
        `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id, contrato_id)
         VALUES (?, 1, ?, 2000, 'Aluguel recebido - Kitnet Centro', '1.1.01', 1, 1)`,
        [idAluguel, `2025-${String(mes).padStart(2, "0")}-05`],
      );
      idAlugueis.push(idAluguel);

      // Condomínio (inclui IPTU no código do app, "2.1.01" — mapeamentoPlanoApp.ts).
      const idCondominio = proximoId++;
      executar(
        db,
        `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id)
         VALUES (?, 1, ?, -300, 'Condomínio e IPTU - Kitnet Centro', '2.1.01', 1)`,
        [idCondominio, `2025-${String(mes).padStart(2, "0")}-10`],
      );
      idCondominios.push(idCondominio);
    }

    // Manutenção recorrente em 3 meses distintos.
    idManutencoes = [];
    for (const mes of [2, 6, 10]) {
      const id = proximoId++;
      executar(
        db,
        `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id)
         VALUES (?, 1, ?, -400, 'Manutenção - reparo hidráulico', '2.1.02', 1)`,
        [id, `2025-${String(mes).padStart(2, "0")}-15`],
      );
      idManutencoes.push(id);
    }

    // Despesa de capital (reforma) — código 2.1.03, deve CAPITALIZAR no imóvel (1.2.05),
    // não virar despesa do período (mapeamentoPlanoApp.ts).
    idCapex = proximoId++;
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id)
       VALUES (?, 1, '2025-06-20', -50000, 'Reforma completa - Kitnet Centro', '2.1.03', 1)`,
      [idCapex],
    );

    // Transação de março lançada com o código ERRADO (condomínio) — na verdade é
    // manutenção. Corrigida mais abaixo via reclassificarTransacao().
    idMiscodificada = proximoId++;
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id)
       VALUES (?, 1, '2025-03-12', -500, 'Troca de bomba d''água (lançada errado)', '2.1.01', 1)`,
      [idMiscodificada],
    );

    const migracao = sincronizarRazao(db, entidade_id);
    if (migracao.transacoes_falhadas > 0) {
      throw new Error(
        `Fixture não migrou todas as transações: ${JSON.stringify(migracao.erros)}`,
      );
    }

    periodoPorMes = {};
    for (let mes = 1; mes <= 12; mes++) {
      const [periodo] = consultar<{ id: number }>(
        db,
        "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2025 AND mes = ?",
        [entidade_id, mes],
      );
      periodoPorMes[mes] = periodo.id;
    }

    // === Before/after da reclassificação de março, capturado uma única vez ===
    dreMarAntes = gerarDRE(db, entidade_id, periodoPorMes[3]);
    balancoMarAntes = gerarBalanco(db, entidade_id, periodoPorMes[3]);

    resultadoReclassificacao = reclassificarTransacao(db, idMiscodificada, "2.1.02", {
      categorizado_por: "manual",
      reclassificado_por: operador_id,
      motivo: "Revisão contábil: era manutenção (troca de bomba), não condomínio.",
    });

    dreMarDepois = gerarDRE(db, entidade_id, periodoPorMes[3]);
    balancoMarDepois = gerarBalanco(db, entidade_id, periodoPorMes[3]);

    // === Fechamento de pelo menos 1 período: janeiro, o mês mais simples do ano (só
    // aluguel + condomínio, sem capex nem reclassificação) ===
    fechamentoJaneiro = await encerrarPeriodo(db, periodoPorMes[1], operador_id, "Fechamento de teste — golden path");
  });

  it("a migração lançou as 29 transações e o razão fecha (débito = crédito) em todo período", () => {
    for (let mes = 1; mes <= 12; mes++) {
      const bal = validarBalanceamento(db, periodoPorMes[mes]);
      expect(bal.balanceado, `período ${mes}/2025 desbalanceado: diferença ${bal.diferenca}`).toBe(true);
    }
  });

  it("o fechamento de janeiro foi aceito", () => {
    expect(fechamentoJaneiro.sucesso).toBe(true);
    const [periodo] = consultar<{ status: string }>(
      db,
      "SELECT status FROM periodos_contabeis WHERE id = ?",
      [periodoPorMes[1]],
    );
    expect(periodo.status).toBe("fechado");
  });

  describe("o que já funciona hoje", () => {
    it("capex (reforma) não reduz o resultado da DRE de junho", () => {
      const dreJun = gerarDRE(db, entidade_id, periodoPorMes[6]);
      // Junho tem: aluguel 2000, condomínio 300, manutenção 400 — a reforma de R$ 50.000
      // NÃO deve entrar em custos (o código 1.2.05 não é um dos códigos que a DRE soma).
      expect(dreJun.custos.total_custos).toBeCloseTo(300 + 400, 2);
      expect(dreJun.resultado_final).toBeCloseTo(2000 - 300 - 400, 2);
    });

    it("capex (reforma) aparece como ativo imobilizado no Balanço acumulado de junho", () => {
      const balancoJun = gerarBalanco(db, entidade_id, periodoPorMes[6]);
      // 1.2.05 só recebe débitos neste cenário (nunca um crédito) — fora do alcance do
      // defeito A documentado no topo do arquivo, então este número é confiável.
      expect(balancoJun.ativo.nao_circulante_total).toBeCloseTo(50000, 2);
    });

    it("a parte NOVA da reclassificação aparece corretamente em Manutenção", () => {
      // R$ 500 reclassificados de Condomínio para Manutenção: a conta nova soma certo.
      expect(dreMarAntes.custos.manutencao).toBeCloseTo(0, 2);
      expect(dreMarDepois.custos.manutencao).toBeCloseTo(500, 2);
    });

    it("a reclassificação (só contas de resultado) não altera o Balanço de março", () => {
      // Condomínio (5210) e Manutenção (5205) são despesa — o Balanço só soma
      // ativo/passivo/PL. Reclassificar entre duas contas de despesa não deveria (e não
      // altera, aqui) nenhum total patrimonial.
      expect(balancoMarDepois).toEqual(balancoMarAntes);
    });

    it("rastreabilidade completa da transação reclassificada: de onde veio, quem aprovou, o que mudou, qual documento prova", () => {
      expect(resultadoReclassificacao.sucesso).toBe(true);
      expect(resultadoReclassificacao.razao_ajustado).toBe(true);

      const historico = historicoRazaoDaTransacao(db, idMiscodificada);
      // 3 lançamentos de contrapartida: original (condomínio, errado), estorno dele,
      // e o novo (manutenção, certo). A perna de caixa fica de fora por design.
      expect(historico).toHaveLength(3);

      const [original, estorno, novo] = historico;
      // De onde veio: lançamento original, migrado da transação bancária, na conta errada
      // do RAZÃO — "5.2.10" (Condomínio), a contrapartida ERP do código do app "2.1.01"
      // (mapeamentoPlanoApp.ts); os dois planos usam numeração própria, não o mesmo código.
      expect(original.conta_codigo).toBe("5.2.10");
      expect(original.valor_debito).toBeCloseTo(500, 2);
      expect(original.referencia_documento).toBe(`TXN-${idMiscodificada}`);
      expect(original.estornado_por_id).toBe(estorno.id);
      // O motivo fica gravado no lançamento ORIGINAL (o que foi estornado), não no estorno.
      expect(original.motivo_estorno).toMatch(/manutenção/i);

      // O que mudou: o estorno reverte exatamente o original, na mesma conta.
      expect(estorno.conta_codigo).toBe("5.2.10");
      expect(estorno.valor_credito).toBeCloseTo(500, 2);

      // A nova classificação, correta — "5.2.05" (Manutenção), contrapartida ERP de "2.1.02".
      expect(novo.conta_codigo).toBe("5.2.05");
      expect(novo.valor_debito).toBeCloseTo(500, 2);
      expect(novo.referencia_documento).toBe(`TXN-${idMiscodificada}-RECLASS-2.1.02`);

      // Quem aprovou: criado_por não está no retorno de historicoRazaoDaTransacao
      // (LancamentoHistoricoTransacao não expõe a coluna) — consultado direto em
      // ledger_entries, exatamente como o enunciado pede para quando o helper não bastar.
      const autores = consultar<{ criado_por: number | null }>(
        db,
        "SELECT criado_por FROM ledger_entries WHERE id IN (?, ?)",
        [estorno.id, novo.id],
      );
      expect(autores.every((a) => a.criado_por === operador_id)).toBe(true);

      // Qual regra classificou: o app grava como a transação foi categorizada.
      const [transacao] = consultar<{ plano_conta_codigo: string; categorizado_por: string }>(
        db,
        "SELECT plano_conta_codigo, categorizado_por FROM transacoes WHERE id = ?",
        [idMiscodificada],
      );
      expect(transacao.plano_conta_codigo).toBe("2.1.02");
      expect(transacao.categorizado_por).toBe("manual");

      // Como reproduzir o cálculo: o efeito líquido em Manutenção (5205), calculado
      // direto do razão por origem_id — sem passar pelas funções de relatório —
      // deve bater com o valor absoluto da transação.
      const [efeitoLiquido] = consultar<{ d: number; c: number }>(
        db,
        `SELECT COALESCE(SUM(valor_debito),0) d, COALESCE(SUM(valor_credito),0) c
         FROM ledger_entries WHERE conta_id = 5205 AND referencia_documento LIKE ?`,
        [`TXN-${idMiscodificada}%`],
      );
      expect(efeitoLiquido.d - efeitoLiquido.c).toBeCloseTo(500, 2);

      // A perna de caixa da transação original nunca foi tocada pela reclassificação —
      // o dinheiro que saiu continua exatamente onde estava.
      const [pernaCaixa] = consultar<{ valor_credito: number; estornado_por_id: number | null }>(
        db,
        "SELECT valor_credito, estornado_por_id FROM ledger_entries WHERE conta_id = ? AND origem_modulo = 'transacoes' AND origem_id = ?",
        [CONTA_CAIXA_ERP, idMiscodificada],
      );
      expect(pernaCaixa.valor_credito).toBeCloseTo(500, 2);
      expect(pernaCaixa.estornado_por_id).toBeNull();
    });
  });

  describe("ACHADOS — identidades contábeis que os relatórios hoje NÃO garantem (ver comentário no topo do arquivo)", () => {
    // ACHADO A. Ver comentário no topo do arquivo. Ativo real de dezembro (caixa líquido
    // do ano + imóvel capitalizado) é a soma correta e reproduzível por SQL direto —
    // Passivo e PL são ambos R$ 0,00 neste cenário (nenhuma conta de passivo/PL foi
    // tocada), então a identidade correta é Ativo = Resultado acumulado do ano.
    it.fails(
      "Balanço de dezembro fecha: Ativo total = Passivo total + Patrimônio Líquido total",
      () => {
        const balancoDez = gerarBalanco(db, entidade_id, periodoPorMes[12]);

        const [resultadoReal] = consultar<{ resultado: number }>(
          db,
          `SELECT COALESCE(SUM(
             CASE
               WHEN cp.grupo = 'receita' THEN COALESCE(le.valor_credito,0) - COALESCE(le.valor_debito,0)
               WHEN cp.grupo = 'despesa' THEN COALESCE(le.valor_credito,0) - COALESCE(le.valor_debito,0)
               ELSE 0
             END
           ), 0) AS resultado
           FROM ledger_entries le
           INNER JOIN contas_plano_contas cp ON cp.id = le.conta_id
           WHERE le.entidade_id = ?`,
          [entidade_id],
        );
        // resultado aqui é receita líquida MENOS despesa líquida (a expressão soma
        // crédito-débito nos dois grupos; despesa é natureza débito, então
        // crédito-débito de uma despesa pura sai negativo — exatamente o sinal certo
        // para somar direto com receita e cair no resultado líquido).
        expect(balancoDez.ativo.total_ativo).toBeCloseTo(
          balancoDez.passivo.total_passivo + balancoDez.patrimonio_liquido + resultadoReal.resultado,
          2,
        );
      },
    );

    // ACHADO D. Ver comentário no topo do arquivo. Janeiro é o mês mais simples do ano
    // (só aluguel + condomínio) — isola o problema sem a distorção do capex/reclass.
    it.fails(
      "DRE liga com o Balanço: resultado do período = variação do PL entre início e fim do período",
      () => {
        const dreJan = gerarDRE(db, entidade_id, periodoPorMes[1]);
        const balancoJan = gerarBalanco(db, entidade_id, periodoPorMes[1]);
        // Não há período anterior a janeiro/2025 para esta entidade — PL inicial é 0 por
        // definição (nenhum saldo carregado de antes da abertura).
        const plInicial = 0;
        const variacaoPL = balancoJan.patrimonio_liquido - plInicial;
        expect(dreJan.resultado_final).toBeCloseTo(variacaoPL, 2);
      },
    );

    // ACHADO B. Ver comentário no topo do arquivo. saldo_razao aqui é calculado
    // exatamente como conciliacao.ts::saldo_razao já faz e testa: soma direta e líquida
    // de valor_debito - valor_credito da conta de caixa, sobre TODOS os lançamentos até a
    // data — não uma aproximação.
    it.fails(
      "Fluxo de Caixa de dezembro: saldo final apurado = soma líquida da conta de caixa no razão",
      () => {
        const fluxoDez = gerarFluxoCaixa(db, entidade_id, periodoPorMes[12]);

        const [somaCaixa] = consultar<{ d: number; c: number }>(
          db,
          "SELECT COALESCE(SUM(valor_debito),0) d, COALESCE(SUM(valor_credito),0) c FROM ledger_entries WHERE conta_id = ?",
          [CONTA_CAIXA_ERP],
        );
        const saldoRealCaixa = somaCaixa.d - somaCaixa.c;

        expect(fluxoDez.saldo_final).toBeCloseTo(saldoRealCaixa, 2);
      },
    );

    // ACHADO C. Ver comentário no topo do arquivo. A parte NOVA já foi provada correta
    // acima ("a parte NOVA da reclassificação aparece corretamente em Manutenção") — este
    // teste prova a outra metade: a conta ANTIGA deveria ter voltado a R$ 300 (só o
    // condomínio de verdade) e continua em R$ 800 (o valor de antes da correção, intacto)
    // — a despesa reclassificada não sai de onde estava, só é somada de novo no lugar
    // certo.
    it.fails(
      "a reclassificação corrige Condomínio (não deveria continuar contando o valor reclassificado)",
      () => {
        expect(dreMarAntes.custos.condominio).toBeCloseTo(300 + 500, 2); // 300 do mês + 500 mal classificado
        expect(dreMarDepois.custos.condominio).toBeCloseTo(300, 2); // deveria voltar a só o condomínio real
      },
    );
  });
});
