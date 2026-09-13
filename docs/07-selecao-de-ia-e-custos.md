# Seleção de Modelos de IA (Gemini, Claude, Ollama, Grok) e Revisão de Custos

Pesquisa de preços reais (julho/2026), não estimativa de memória, seguida de análise socrática tarefa a tarefa: para cada demanda de IA do sistema, pergunto "por que este provedor e não outro" até sobrar uma resposta defensável. Fecha com a correção de dois pontos da estimativa de custo anterior (`05-riscos-e-custos.md`) que a pesquisa revelou estarem errados.

## Achado principal (antes de qualquer tabela): o custo de IA não é o seu problema

Fiz a conta com o volume real do seu portfólio. ~40 imóveis, leitura de medidor mensal em boa parte deles (~40-70 leituras/mês), mais notas fiscais de prestadores (~20-30/mês), mais alguns documentos jurídicos por mês (~20), mais triagem de mensagens de SAC (algumas centenas/mês). Rodando os preços reais (tabela abaixo) contra esse volume, o custo total de chamadas de IA fica **abaixo de R$ 50/mês em todas as fases** — é a linha mais barata do orçamento inteiro, muito atrás de Supabase, Asaas e WhatsApp.

**Isso muda a pergunta que você fez.** Construir um "roteador inteligente" que escolhe dinamicamente entre 4 provedores para espremer frações de centavo por chamada é engenharia desproporcional ao problema — é o mesmo erro de over-engineering que já apontei no documento 01, agora aplicado à camada de IA em vez de à camada societária. A resposta certa é: **decisão fixa e simples por tipo de tarefa, documentada e codificada como regra (não um algoritmo de leilão em tempo real), revisitada só se o volume crescer 50-100x.**

Onde a escolha de provedor **realmente importa** não é custo — é **confiabilidade** (erro de OCR vira cobrança errada) e **privacidade/LGPD** (ver achado crítico abaixo). É nesses dois eixos que a análise socrática abaixo se concentra.

## Achado crítico de LGPD: nunca usar a camada gratuita da API do Gemini com dado pessoal

Verifiquei a política de dados de cada provedor porque o sistema vai passar foto de medidor (identifica o imóvel/inquilino), extrato bancário pessoal e documentos com CPF por essas APIs.

- **Gemini API — camada gratuita (Google AI Studio sem faturamento):** Google usa o conteúdo enviado para melhorar seus produtos, e revisores humanos podem ver o conteúdo. **Isso é incompatível com enviar foto de medidor de um imóvel identificável ou dado financeiro de inquilino/investidor sem base legal e consentimento específico — na prática, incompatível com o uso no sistema.**
- **Gemini API — camada paga (com faturamento ativo, mesma API):** Google não usa os prompts/respostas para treinar modelos. Preço, como visto abaixo, é irrisório no seu volume — **não há motivo para usar a camada gratuita e assumir esse risco**.
- **Claude API (Anthropic):** não treina com dados da API por padrão, em nenhum tier, com log retido por 7 dias e opção de zero data retention em plano enterprise. Postura mais segura por padrão, mesmo sem faturamento pago ativo (mas ainda cobra por uso, obviamente).

**Decisão:** toda chamada de IA do sistema usa **API paga com faturamento ativo** (Gemini ou Claude), nunca a chave gratuita do AI Studio. Isso é uma regra técnica, não só uma recomendação — o código do gateway de IA (seção final deste doc) bloqueia isso automaticamente quando a tarefa envolve dado pessoal.

## Preços verificados (julho/2026)

| Provedor / Modelo | Input (US$/1M tokens) | Output (US$/1M tokens) | Observação |
|---|---|---|---|
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | Multimodal (texto+imagem); camada paga não treina com seus dados |
| Gemini 2.5 Flash | $0.30 | $2.50 | Mais capaz que Flash-Lite; não necessário para OCR estruturado simples |
| Claude Haiku 4.5 | $1.00 | $5.00 | Nunca treina com dados da API, em nenhum tier |
| Claude Sonnet 4.6 | $3.00 | $15.00 | Melhor para texto longo/jurídico em português |
| Grok 4.1 Fast (xAI) | $0.20 | $0.50 | Só texto; competitivo, mas ecossistema menos maduro para extração estruturada em PT-BR |
| Grok 2 Vision (xAI) | $2.00 | $10.00 | Visão — **caro** frente a Gemini Flash-Lite para OCR |
| Ollama (modelos locais) | $0 por chamada | $0 por chamada | Custo é o hardware/servidor que roda o modelo, não a chamada |

Fontes: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing), [xAI Grok API pricing](https://x.ai/api), [Gemini API data policy (paga vs. gratuita)](https://ai.google.dev/gemini-api/docs/pricing), [Anthropic API data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention).

## Análise socrática tarefa a tarefa

### Leitura de medidor de energia (OCR de foto)
- *Por que não a opção mais barata pura (Flash-Lite gratuito)?* Porque "gratuito" aqui significa Google treinando modelo com foto de imóvel identificável — risco de LGPD descartado acima.
- *Por que não Ollama local (grátis de verdade)?* Testei o argumento: modelos de visão locais (Llama 3.2 Vision, Qwen3-VL, MiniCPM-V) existem e rodam offline, mas (a) sua acurácia em OCR de dígitos de medidor fotografado por um prestador de campo, com luz variável, é **reconhecidamente inferior** aos modelos comerciais — e isso é exatamente o tipo de erro que vira cobrança errada e disputa em Juizado Especial (auditoria item 7); (b) rodar um modelo de visão local decente exige uma máquina com GPU — um servidor com GPU na nuvem custa **mais por mês** do que simplesmente pagar Gemini Flash-Lite no seu volume (a conta abaixo mostra ~R$ 0,01-0,05 por leitura). Ollama só faria sentido aqui se você já tivesse hardware ocioso com GPU — não é o caso.
- **Decisão:** Gemini 2.5 Flash-Lite, camada paga, com Claude Haiku 4.5 como fallback se a chamada falhar ou a confiança for baixa. Confirmação humana obrigatória continua valendo (já estabelecido na auditoria) — a IA aqui só acelera, nunca decide sozinha.
- **Custo real:** ~1.500 tokens de entrada + 200 de saída por leitura ≈ US$ 0,0002/leitura. Em 70 leituras/mês: **≈ US$ 0,015/mês**.

### OCR de nota fiscal / cupom de prestador
- Mesma lógica da leitura de medidor (imagem, estruturado, baixo risco por chamada, mas erro vira problema contábil). Mesma decisão: Gemini Flash-Lite pago, fallback Claude Haiku.

### Redação de documento jurídico (notificação extrajudicial, aditivo, termo de confissão de dívida)
- *Por que não o mais barato?* Volume é baixo (~20 documentos/mês) e o custo de um erro é alto (cláusula mal redigida em documento com efeito jurídico). Aqui a variável que importa é qualidade de redação em registro jurídico formal em português, não preço.
- *Por que Claude Sonnet e não Gemini Flash?* Modelos maiores/mais caros tendem a seguir instruções condicionais complexas de template jurídico (esta cláusula só aparece se X) com menos erro do que os modelos "lite". Como o volume é baixo, a diferença de custo é irrelevante (poucos centavos por documento) frente ao risco de um erro.
- **Decisão:** Claude Sonnet 4.6, sem fallback automático — revisão humana e, quando aplicável, jurídica é obrigatória antes de assinatura, então não há necessidade de um "plano B" automatizado aqui.
- **Custo real:** ~2.000 tokens entrada + 1.500 saída ≈ US$ 0,028/documento. Em 20/mês: **≈ US$ 0,57/mês**.

### Triagem de SAC/WhatsApp (classificar urgência e categoria de um chamado)
- *Por que não Grok 4.1 Fast, que é o mais barato de todos para texto puro?* É genuinamente competitivo em preço. Mas adicionar um **quarto provedor** de IA à arquitetura por uma economia de frações de centavo (volume baixo, ver conta abaixo) não paga o custo de integração/manutenção de mais uma API, mais uma chave, mais um painel de billing para monitorar. Fica marcado como opção a reconsiderar **somente se** o volume de mensagens passar de milhares por dia.
- **Decisão:** Gemini 2.5 Flash-Lite pago (mesmo provedor já usado para OCR, menos superfícies a manter), fallback Claude Haiku 4.5.
- **Custo real:** ~500 mensagens/mês * (300 tokens entrada + 50 saída) ≈ **US$ 0,025/mês**.

### Classificação assistida de extrato bancário histórico (Módulo 16 — reconstituição contábil)
- *Essa tarefa não deveria ir para um modelo local, já que envolve anos de dado financeiro pessoal sensível (CPF, movimentações da conta salário)?* Essa foi minha primeira hipótese — testei-a e ela não se sustenta: (a) a Claude API nunca treina com dados em nenhum tier, com retenção de log de só 7 dias — já é uma postura de privacidade forte sem precisar de infraestrutura própria; (b) rodar um modelo local de qualidade suficiente para classificar texto em português com nuance (distinguir "Siape" de receita de aluguel disfarçada) ainda exige um mínimo de hardware, e o volume aqui (milhares de linhas, mas um processo único de reconstituição, não recorrente mensal) não justifica montar e manter infraestrutura de inferência própria para um projeto pontual.
- **Decisão:** Claude Haiku 4.5 (mais barato que Sonnet, mais confiável que Flash-Lite para classificação com nuance textual em português) para o processo de reconstituição — sempre em modo *staging*, nunca postando direto na DRE oficial (regra já estabelecida na auditoria item 8).
- **Ressalva sobre Ollama:** mantenho a opção documentada no código (não removida), mas como **fallback opcional configurável apenas se você já possuir hardware ocioso** (ex.: um Mac/PC parado em casa) — nesse caso específico o custo marginal é mesmo zero e a opção volta a fazer sentido. Sem hardware próprio, não compensa.

### Credit scoring do inquilino (Módulo 0)
- *Isso não deveria usar um LLM para "ler" o perfil do candidato e decidir?* **Não.** Esta é a correção mais importante desta rodada. Um modelo de crédito preditivo é um problema de classificação estatística sobre dados estruturados (renda, score de mercado, relação aluguel/renda, histórico) — usar um LLM aqui trocaria um modelo auditável, determinístico e replicável por uma "caixa-preta" que pode alucinar, é caro de explicar numa eventual disputa (o candidato reprovado tem direito a entender o critério, e "o modelo de linguagem achou que sim" não é uma explicação defensável), e levanta risco de discriminação indireta sob a ótica do Código de Defesa do Consumidor e da LGPD (decisão automatizada precisa ser explicável, Art. 20 da LGPD).
- **Decisão:** nenhum provedor de IA generativa. Regressão logística simples ou um conjunto de regras de pontuação com pesos explícitos, versionado como código comum, sem chamada de API alguma. O gateway de IA implementado abaixo **recusa em tempo de execução** qualquer tentativa de rotear esta tarefa para um provedor de IA — a regra vira código, não só documentação.

## Correções na estimativa de custo anterior (`05-riscos-e-custos.md`)

A pesquisa revelou dois erros de estimativa que preciso corrigir:

1. **Point-in-Time Recovery do Supabase custa US$ 100/mês adicionais** por janela de 7 dias no plano Pro — não vem incluído no US$ 25/mês como eu havia presumido. Dado o porte da operação, a decisão correta é: **plano Pro (US$ 25) com backup diário automático (incluído) + rotina trimestral de restauração testada, sem contratar PITR**. Perder até 24h de dados é um risco aceitável aqui (as cobranças ficam rastreáveis pelos webhooks do Asaas e pelos extratos bancários, então são reconstruíveis mesmo num pior cenário) — pagar US$ 100/mês extra por granularidade de recuperação ao minuto não se justifica no seu porte. Revisitar se o volume de transações crescer muito.
2. **Vercel Hobby (gratuito) não pode ser usado legalmente** — é um plano explicitamente não-comercial, e a CRMT é uma operação que gera receita. Isso forçaria o plano Pro da Vercel (US$ 20/mês por usuário). Alternativa mais barata e que **também simplifica a arquitetura**: hospedar o Next.js **na mesma VPS que já hospeda o n8n**, usando Coolify (open source, dá a mesma experiência de deploy via git da Vercel) — uma VPS de ~R$ 40-70/mês (Hetzner/Contabo) cobre os dois, eliminando um fornecedor inteiro em vez de adicionar um.
3. **WhatsApp Business API oficial**: no seu volume (algumas centenas de mensagens/mês), um provedor com cobrança por mensagem (Twilio, Bird/Gupshup pay-as-you-go) sai mais barato que uma licença fixa mensal (ex.: 360dialog a partir de €49/mês fixos) — o ponto de equilíbrio entre os dois modelos fica em torno de 10 mil mensagens/mês, muito acima do seu volume atual. Usar o modelo por mensagem até bater nesse volume.

## Tabela de custo mensal revisada (substitui a tabela do doc 05)

| Item | Fase 0 | Fase 1-2 | Fase 3+ |
|---|---|---|---|
| VPS única (Next.js + n8n via Coolify) | R$ 40-70 | R$ 40-70 | R$ 80-150 |
| Supabase Pro (backup diário, sem PITR) | R$ 140 | R$ 140 | R$ 140-800 (conforme uso) |
| Asaas (boleto R$1,99 + PIX R$1,99 por cobrança, ~40/mês) | R$ 80-100 | R$ 80-100 | R$ 100-150 |
| IA (Gemini + Claude, camada paga, todas as tarefas) | R$ 10-30 | R$ 20-50 | R$ 40-100 |
| Assinatura eletrônica (Autentique) | — | R$ 50-85 | R$ 85 |
| WhatsApp oficial (BSP por mensagem) | — | R$ 35-90 | R$ 90-250 |
| Open Finance (Pluggy/Belvo) | — | — | R$ 150-500 |
| Domínio | R$ 3 | R$ 3 | R$ 3 |
| **Total estimado** | **R$ 270-345** | **R$ 370-540** | **R$ 690-2040** |

A ordem de grandeza da estimativa original (doc 05) se confirma; os dois erros pontuais (PITR, Vercel) estão corrigidos, e o custo de IA — a pergunta original desta rodada — **é confirmado como irrelevante no orçamento total** (menos de 5% do custo em qualquer fase).

## O que foi implementado em código a partir desta análise

`server/ai-gateway/` — módulo TypeScript com testes (`npm test`) que codifica as decisões acima como regra executável, não só documentação:
- Tabela de roteamento fixa por tipo de tarefa (Gemini Flash-Lite / Claude Haiku / Claude Sonnet conforme a análise acima).
- Bloqueio em tempo de execução de qualquer configuração que aponte para camada gratuita quando a tarefa envolve dado pessoal.
- Bloqueio em tempo de execução de tentativa de rotear *credit scoring* para qualquer provedor de IA generativa.
- Suporte a Ollama como opção explícita e opcional (não default) para a tarefa de reconstituição histórica, condicionado a uma flag de hardware disponível.

Ver `server/ai-gateway/README.md` para detalhes de uso e como rodar os testes.
