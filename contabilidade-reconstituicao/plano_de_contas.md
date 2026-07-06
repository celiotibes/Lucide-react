# Plano de contas

Adaptado para pessoa física com atividade de fato de locação de imóveis.
Cada imóvel é um centro de custo (`imoveis.id`); cada contrato é uma conta
a receber recorrente (`contratos_locacao.id`). Ajuste os códigos livremente
antes da primeira importação — depois de categorizar transações, mudar
código exige recategorizar.

| Código  | Descrição                              | Grupo        |
|---------|-----------------------------------------|--------------|
| 1.1.01  | Aluguéis — contratos residenciais       | receita      |
| 1.2.01  | Airbnb / temporada                      | receita      |
| 1.3.01  | Multas e juros de atraso recebidos      | receita      |
| 1.9.01  | Salário — servidor federal              | pessoal      |
| 2.1.01  | Condomínio e IPTU                       | despesa      |
| 2.1.02  | Manutenção corrente                     | despesa      |
| 2.1.03  | Obra / capex                            | despesa      |
| 2.1.04  | Prestadores de serviço                  | despesa      |
| 2.1.05  | Financiamento imobiliário — juros       | despesa      |
| 2.1.06  | Financiamento imobiliário — amortização | despesa      |
| 2.1.07  | Taxas de plataforma (Airbnb/imobiliária)| despesa      |
| 2.1.08  | Inadimplência / perdas com locatário    | despesa      |
| 9.0.01  | Transferência entre contas próprias     | transferencia|
| 9.0.02  | Depósito caução recebido/devolvido      | transferencia|

`pessoal` e `transferencia` ficam fora do DRE da atividade de locação
(`src/reports/dre.py` só soma `receita` e `despesa`) — isso é o que separa
"resultado da empresa de fato" de "vida financeira pessoal completa".
