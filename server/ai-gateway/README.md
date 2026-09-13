# AI Gateway

Camada fina de decisão de qual provedor de IA usar para cada tarefa do sistema. Não é um roteador dinâmico/leilão em tempo real — é uma tabela de decisão fixa, codificada a partir da análise em `docs/07-selecao-de-ia-e-custos.md`. Isso é deliberado: no volume atual do sistema (~40 imóveis), o custo de inferência é irrelevante (menos de R$ 50/mês em qualquer fase), então otimizar automaticamente por preço em tempo real seria complexidade sem benefício. O que importa aqui é **confiabilidade** e **conformidade com LGPD**, e é isso que o código força.

## O que este módulo garante, em tempo de execução (não só em documentação)

1. **Nunca usa a camada gratuita de uma API de IA quando a tarefa envolve dado pessoal.** A camada gratuita do Gemini treina modelos com o conteúdo enviado; enviar foto de medidor de um imóvel habitado ou extrato bancário pessoal por ela seria uma violação de base legal de LGPD. `selecionarProvedor` lança erro se a política encontrar uma configuração de camada gratuita para uma tarefa marcada com `contemDadosPessoais: true`.
2. **Nunca roteia *credit scoring* para um modelo de linguagem.** Essa é uma decisão estatística auditável (regressão logística/regras de pontuação), não uma tarefa de geração de texto — usar um LLM aqui trocaria uma decisão explicável por uma caixa-preta, o que é incompatível com o direito a explicação de decisão automatizada (Art. 20, LGPD). Chamar `selecionarProvedor({ task: 'credit_scoring', ... })` lança erro sempre.
3. **Ollama local só é usado quando `hardwareOllamaDisponivel: true` é passado explicitamente** — nunca é o default, porque rodar um modelo local decente exige hardware que, se precisar ser alugado na nuvem, custa mais do que simplesmente chamar a API paga no volume atual.

## Uso

```ts
import { selecionarProvedor } from './policy';

const decisao = selecionarProvedor({
  task: 'leitura_medidor_energia',
  contemDadosPessoais: true, // foto de medidor identifica o imóvel/inquilino
});

// decisao.primary => { provider: 'gemini', model: 'gemini-2.5-flash-lite', tierGratuita: false }
// decisao.fallback => { provider: 'claude', model: 'claude-haiku-4-5', tierGratuita: false }
// decisao.motivo => string explicando a escolha, para log/auditoria
```

Este módulo não implementa chamadas HTTP para todos os provedores — só para os que já têm uso real. `GeminiProvider` e `OllamaProvider` continuam pendentes (ficam para quando a Fase 1 de M7 — Energia entrar em desenvolvimento). `ClaudeProvider` (`providers/claudeProvider.ts`) já é real: usa `@anthropic-ai/sdk` com `output_config.format` (json_schema) para extração estruturada de dados de contrato (tarefa `extracao_dados_contrato`, Fase 4 do M-imobiliária — ver `server/documentos/extrairDadosContrato.ts`). Como em todo o resto do gateway, o resultado é sempre uma proposta: quem chama `extrairDadosEstruturados` é responsável por tratar o retorno como sujeito a validação humana, nunca gravar direto.

## Rodando os testes

```
npm install
npm test
```

Os testes (`policy.test.ts`) cobrem: a decisão correta por tipo de tarefa, o bloqueio de camada gratuita com dado pessoal, o bloqueio de *credit scoring*, e o comportamento com/sem hardware Ollama disponível.
