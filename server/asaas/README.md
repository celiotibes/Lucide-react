# Cliente Asaas

Integração com a API do Asaas (boleto/PIX) — `docs/03-arquitetura-e-stack.md`.

## `client.ts`
`AsaasClient` com `criarCobranca` e `consultarCobranca`. `fetchImpl` é injetável para teste (nenhum teste bate na rede de verdade).

**Limitação honesta:** implementado a partir da documentação pública da API do Asaas, nunca executado contra o sandbox real deles — não há chave de API neste ambiente. Os 5 testes provam que a forma da requisição (endpoint, headers, corpo) e da resposta batem com o que a documentação descreve. Isso **não substitui** um teste real contra o sandbox do Asaas antes de ir para produção — quando houver uma chave de sandbox, o próximo passo é rodar `criarCobranca` de verdade e conferir o retorno real, exatamente como fizemos com Postgres local para o resto do sistema.

## `webhook.ts`
`interpretarWebhook` normaliza o payload de webhook do Asaas em 4 casos (`pagamento_confirmado`, `pagamento_atrasado`, `pagamento_estornado`, `ignorado`) e `verificarTokenWebhook` confere o header `asaas-access-token` contra o token configurado no painel — sem isso, qualquer um que descobrisse a URL do endpoint poderia forjar "pagamento confirmado" para uma fatura nunca paga.

Como isto processa dado que chega de fora (a rede, não um teste controlado), os 15 testes incluem uma seção de payloads adversariais: objeto que não é objeto, campos ausentes, tipo errado, evento futuro desconhecido da API do Asaas. Nenhum desses cenários deveria derrubar o processamento com uma exceção não tratada — ou vira `WebhookInvalidoError` explícito, ou vira `{ tipo: 'ignorado' }` para eventos que não reconhecemos (tolerância a evolução da API sem quebrar).

## O que falta para produção

- Chave de API de sandbox do Asaas para o teste real de ponta a ponta.
- Rota de webhook em `app/api/webhooks/asaas/route.ts` (Next.js Route Handler) chamando `verificarTokenWebhook` + `interpretarWebhook` e atualizando `cobrancas_asaas`/`faturas` no banco — ainda não implementada; o módulo atual é só a lógica de interpretação, testável isoladamente.
- Emissão de cobrança a partir de uma fatura real (ler `faturas`, montar `CriarCobrancaInput`, chamar `criarCobranca`, gravar o `id` retornado em `cobrancas_asaas`) — trabalho de M3, ainda não implementado.
