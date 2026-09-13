// Página de download dos relatórios exportáveis (docs/15). Sem seletor de
// data por enquanto — cada link já aponta para o mês corrente por padrão
// (as rotas aceitam ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD para outro período,
// mas um formulário de período fica para quando houver mais de 3 relatórios
// e a navegação por link deixar de ser suficiente).

export default function PaginaRelatorios() {
  return (
    <>
      <h2>Relatórios</h2>
      <p>Exportações para conciliação e uso em sistemas contábeis. Cada link baixa o mês corrente.</p>
      <ul className="lista-relatorios">
        <li>
          <a href="/api/relatorios/faturas">Faturas (CSV)</a> — regime de competência, tudo que foi faturado no período.
        </li>
        <li>
          <a href="/api/relatorios/despesas">Despesas de prestadores (CSV)</a> — folha de prestadores fixos + custos
          avulsos de ordem de serviço.
        </li>
        <li>
          <a href="/api/relatorios/cobrancas">Extrato de cobranças pagas (OFX)</a> — regime de caixa, formato padrão de
          conciliação bancária/contábil.
        </li>
      </ul>
    </>
  );
}
