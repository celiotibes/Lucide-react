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

Este módulo **não implementa as chamadas HTTP reais** aos provedores (não há chaves de API neste repositório). A implementação dos adapters (`GeminiProvider`, `ClaudeProvider`, `OllamaProvider`) que efetivamente chamam cada API fica para quando a Fase 1 (M7 — Energia) entrar em desenvolvimento; o contrato de cada adapter deve ser definido nessa hora a partir do SDK oficial de cada provedor, não adivinhado aqui sem uso real.

## Rodando os testes

```
npm install
npm test
```

Os testes (`policy.test.ts`) cobrem: a decisão correta por tipo de tarefa, o bloqueio de camada gratuita com dado pessoal, o bloqueio de *credit scoring*, e o comportamento com/sem hardware Ollama disponível.
