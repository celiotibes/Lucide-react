# Atendimento

Função pura de apoio à central de chamados do inquilino (`docs/16-portal-inquilino-helpdesk.md`).

## `prazoSla.ts`
Calcula o prazo de SLA de um chamado a partir do horário de abertura e da política da natureza da demanda. Duas rotas de cálculo, escolhidas pela política, não por uma regra fixa no código: horas corridas (relógio de parede — usado para emergência, "2 horas" sem qualificador no pedido do cliente) ou horas úteis (expediente seg-sex 9h-18h — usado para financeiro/contratual/manutenção, "24 horas **úteis**" no pedido). Abertura fora do expediente avança para o próximo início de expediente antes de começar a contar.

## Testes
```
npm test
```
9 testes, incluindo virada de fim de semana, abertura fora do expediente, e o caso de prazo terminando exatamente no fim do expediente (não vaza para o dia seguinte).
