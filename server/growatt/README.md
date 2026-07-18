# Cliente ShinePhone (Growatt)

Integração com a API legada do app ShinePhone (Growatt) — geração fotovoltaica diária, para a auditoria de energia solar (`docs/30-auditoria-geracao-solar.md`).

## `client.ts`

`GrowattClient` com `listarPlantas` e `buscarEnergiaDiaria`, autenticação por usuário/senha (mesma conta do app, self-service — via oficial exige token pedido pelo instalador, ver docs/30). `fetchImpl` é injetável para teste (nenhum teste bate na rede de verdade). Endpoints vêm da biblioteca comunitária `growattServer` (engenharia reversa do app, não documentação oficial da Growatt).

**Limitação honesta, mais grave que a do Asaas:** aqui não é falta de credencial — você forneceu usuário, senha e app key reais do ShinePhone. É a **política de rede deste ambiente sandbox** que bloqueia `server.growatt.com` e `openapi.growatt.com` (403/"connect_rejected" no proxy de saída, confirmado testando os dois hosts diretamente). O client nunca pôde ser executado contra a API real neste ambiente, e essa restrição persistiria com qualquer outra credencial Growatt — só muda testando fora deste sandbox (máquina local, ou uma vez implantado em produção/Vercel). Os 6 testes provam que a forma da requisição e da resposta batem com o que a biblioteca comunitária descreve, incluindo reaproveitamento de sessão — isso **não substitui** um teste real contra a API antes de confiar no client para popular `leituras_geracao_solar_diaria`.

## Credenciais

`GROWATT_USERNAME`/`GROWATT_PASSWORD`/`GROWATT_APP_KEY` — nunca hardcoded, nunca commitadas. Valores reais só em `.env.growatt.local` (gitignorado, mesmo padrão de `.env.local` para `DATABASE_URL`/`ASAAS_API_KEY`, `docs/09-credenciais-necessarias.md`).

## O que falta para produção

- Validar `GrowattClient` contra a API real, fora deste sandbox (único bloqueio real).
- Job diário chamando `buscarEnergiaDiaria` para alimentar `leituras_geracao_solar_diaria` — ainda não escrito, depende da validação acima.
