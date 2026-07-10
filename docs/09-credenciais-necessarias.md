# Credenciais que só você pode gerar

Duas frentes do projeto estão implementadas e testadas o máximo possível sem depender de conta externa, mas travam num ponto que exige login/cobrança que só você pode fazer. Este documento é o passo a passo exato para desbloquear as duas — quando tiver as credenciais, me passe e eu conecto e valido de ponta a ponta, como fiz com o Postgres local até aqui.

## 1. Projeto Supabase (obrigatório para autenticação e para o banco de produção)

1. Acesse [supabase.com](https://supabase.com) e crie uma conta (ou entre com GitHub).
2. Crie um novo projeto — escolha uma região perto do Brasil (`South America (São Paulo)` se disponível).
3. Anote a senha do banco gerada na criação (ou defina uma) — vai compor a `DATABASE_URL`.
4. Depois do projeto provisionar (leva 1-2 minutos), vá em **Project Settings → Database → Connection string** e copie a URI no formato `postgres://postgres:[SENHA]@[HOST]:5432/postgres`.
5. Aplique o schema: no **SQL Editor** do projeto, cole o conteúdo de `database/schema.sql` inteiro e rode. (Ver `database/README.md` para detalhes.)
6. Me passe a connection string (ou coloque em `.env.local` como `DATABASE_URL` se formos trabalhar no mesmo ambiente) — com isso eu rodo `npm run test:integration` contra o banco real e valido que RLS/constraints se comportam da mesma forma que no Postgres local.
7. Para autenticação (decisão já tomada: magic link por e-mail), vá em **Authentication → Providers** e confirme que "Email" está habilitado com "Confirm email" conforme sua preferência de segurança. Não precisa configurar mais nada agora — a integração de login no Next.js é o próximo passo depois que o projeto existir.

**Custo:** plano Free cobre o desenvolvimento inicial; para produção, ver `docs/05-riscos-e-custos.md` (Pro, ~US$25/mês, sem PITR por decisão registrada).

## 2. Conta Asaas + chave de API de sandbox (obrigatório para testar cobrança de verdade)

1. Acesse [asaas.com](https://www.asaas.com) e crie uma conta.
2. Ative o **ambiente sandbox** (Asaas oferece um ambiente de testes separado do de produção, sem mexer com dinheiro real) — normalmente em **Configurações → Integrações → API** ou num link direto para `sandbox.asaas.com`; a interface pode variar, procure por "Sandbox" ou "Ambiente de testes".
3. Gere uma **chave de API** (API Key) do ambiente sandbox.
4. Me passe essa chave (ou configure como variável de ambiente `ASAAS_API_KEY` e `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`) — com isso eu rodo `server/asaas/client.ts` contra a API real pela primeira vez e confirmo que o mapeamento de campos (`server/asaas/client.test.ts` hoje testa contra um mock baseado na documentação) bate com a resposta real.
5. Configure o webhook: em **Integrações → Webhooks** no painel Asaas, aponte para a URL que vamos expor em `app/api/webhooks/asaas` (ainda não implementada — é o próximo passo depois de validar o cliente) e defina um **token de autenticação** — é esse token que `verificarTokenWebhook` (`server/asaas/webhook.ts`) confere.

**Custo:** sandbox é gratuito; produção cobra por cobrança recebida (ver `docs/07-selecao-de-ia-e-custos.md`, tabela de preços — R$1,99 por boleto/PIX recebido).

**Nota (docs/14):** o mesmo projeto Supabase e a mesma decisão de login por magic link cobrem também o portal do prestador (eletricista, encanador, zelador etc.) — não é uma credencial adicional, é a mesma peça que falta para toda autenticação do sistema, back-office incluído (nenhuma tela tem login real ainda).

## O que eu faço assim que tiver cada uma

- **Com a connection string do Supabase:** rodo o schema, rodo `npm run test:integration` contra ela, e começo a implementação real do login (Supabase Auth) no back-office e nos portais (inquilino, investidor, prestador — RLS de todos já está pronta, só falta a autenticação de fato).
- **Com a chave sandbox do Asaas:** ligo `server/asaas/client.ts` a uma fatura real (M3), implemento a rota de webhook, e testo o ciclo completo (criar cobrança → simular pagamento no sandbox → webhook atualiza a fatura no banco) de ponta a ponta, com o mesmo rigor usado até aqui.
