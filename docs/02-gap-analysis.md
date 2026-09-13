# Gap Analysis — Itens Ausentes na Proposta Anterior

Itens que nenhuma das 8 rodadas cobriu, organizados por área. Cada um tem impacto real (jurídico, financeiro ou operacional) se ficar de fora do sistema final.

## Jurídico / Lei do Inquilinato (8.245/91)

1. **Seguro-incêndio obrigatório (Art. 22, VII).** O locador é obrigado a entregar o imóvel com seguro contra fogo, e o custo pode ser repassado ao locatário se previsto em contrato. Não existe tabela para isso na proposta anterior. Precisa de vigência, apólice, alerta de renovação — igual ao seguro-fiança que já foi lembrado.
2. **Direito de preferência do locatário (Art. 27-34).** Se algum imóvel for colocado à venda, o locatário atual tem preferência legal de compra e deve ser notificado formalmente. Nenhuma tabela ou fluxo cobre isso.
3. **Ação de despejo — modelagem própria, não "genérico judicial".** O módulo jurídico da proposta trata tudo como "judicialização" numa lacuna. Despejo por falta de pagamento tem rito e prazos próprios (purgação da mora, liminar em despejo por falta de pagamento com garantia, etc.) — precisa de status de processo específico, não um campo livre.
4. **Nível de assinatura eletrônica por tipo de documento.** A proposta trata ZapSign/Clicksign como universalmente válido para tudo, inclusive "confissão de dívida". Assinatura eletrônica simples é válida para a maioria dos contratos civis, mas o nível de robustez probatória exigido cresce para termos de confissão de dívida e distratos com valores altos. Isso precisa de validação jurídica pontual por tipo de documento, não uma resposta única de engenharia.

## Temporada / Airbnb — praticamente ausente

5. **Channel manager / sincronização de calendário.** Maior risco operacional de temporada com múltiplos canais é overbooking. Nenhum mecanismo foi proposto.
6. **ISS sobre hospedagem.** Curitiba e Florianópolis podem exigir ISS sobre atividade de hospedagem/temporada dependendo de enquadramento (CNAE, natureza do imóvel, se é operação com características de meio de hospedagem). Precisa de avaliação tributária municipal específica por cidade — não foi mencionado uma vez sequer.
7. **Convenção de condomínio.** Vários condomínios em Florianópolis restringem ou proíbem locação por temporada em suas convenções, e isso já gerou disputas judiciais no estado. Precisa de um campo por `residencial`/`imovel` indicando se locação por temporada é permitida pela convenção, com data de verificação.
8. **Chargeback e disputa de hóspede.** Plataformas como Airbnb têm fluxo de disputa/reembolso que impacta o caixa depois do check-out. Não modelado.
9. **SLA de limpeza entre check-out e check-in (turnover).** Cristiano tem tabela de valores por horário, mas não há um sistema de agenda que bloqueie o intervalo mínimo entre reservas para garantir tempo de limpeza — sem isso, overbooking de limpeza é tão provável quanto overbooking de hóspede.

## Municipal / Tributário local

10. **IPTU por imóvel com parcelamento e alertas de vencimento** — surpreendentemente ausente dado quanto a proposta falou de outros tributos. Precisa de tabela própria com vencimentos e opção de parcelamento anual vs cota única (desconto).
11. **Taxas municipais específicas** (coleta de lixo quando cobrada separada, licenças, alvará se houver atividade de hospedagem).
12. **Regularização/habite-se e prazo de vistorias do Corpo de Bombeiros** para prédios com unidades múltiplas (relevante para os residenciais de 21 e 6 kitnets).

## Seguros e gestão de risco (além do seguro-fiança/incêndio)

13. **Seguro de responsabilidade civil para operação de temporada** (danos a terceiros durante hospedagem).
14. **Seguro do patrimônio (conteúdo/comodato) contra roubo/dano**, separado do seguro-incêndio do imóvel.

## Segurança da informação e continuidade

15. **Backup e Disaster Recovery.** Nenhuma rodada tratou disso. Point-in-time recovery no Supabase só existe em plano pago; sem isso, um erro de operação (DELETE errado) pode ser irrecuperável. Precisa de política explícita de backup e teste de restauração.
16. **Separação de ambientes (staging/produção).** Testar régua de cobrança automatizada direto em produção contra inquilinos reais é inaceitável — precisa de ambiente de homologação com dados fictícios antes de qualquer deploy que toque cobrança.
17. **Log de auditoria imutável de verdade.** A proposta menciona "imutabilidade" para fechamento de DRE retroativa, mas não estende isso a nenhuma outra tabela sensível (splits de pagamento, alterações de contrato). Precisa de um padrão único de audit log (quem mudou o quê, quando) cobrindo todas as tabelas financeiras/contratuais.
18. **Controle de acesso e RLS realmente desenhado por papel**, não apenas mencionado. A proposta fala em "isolamento rigoroso" mas nunca definiu a matriz de papéis x tabelas. Isso está resolvido no `database/schema.sql` (seção de papéis e políticas).
19. **LGPD — mais do que anonimização após 5 anos.** Faltam: base legal para cada tratamento de dado (execução de contrato vs legítimo interesse), fluxo de atendimento a titular (solicitação de acesso/exclusão dentro do prazo legal), e inventário de dados sensíveis (é uma exigência de fato, não só a rotina de anonimização tardia já prevista).

## Operacional

20. **Gestão de fornecedores recorrentes com contrato** (não só "despesa recorrente"): concessionária de água, internet, softwares — com data de renovação/reajuste e cláusulas de multa por rescisão, para não descobrir reajuste abusivo só quando a fatura chega (a proposta já cobre a *detecção* de anomalia, mas não a *gestão do contrato em si*).
21. **Inventário de chaves/acessos físicos** por imóvel — quem tem cópia, quando foi trocada a fechadura, relevante tanto para segurança quanto para vistoria de saída.
22. **Gestão de vacância com meta de dias parada** por imóvel/residencial, não só alerta — falta um indicador comparável (benchmark) de "tempo médio de vacância aceitável" por tipo de unidade/cidade para o alerta ter significado (D+30 é alarmante para uma kitnet, pode ser normal para sala comercial).

## Qualidade de software / operação do próprio sistema

23. **Testes automatizados** para o motor financeiro (cálculo de juros/multa/split/rateio) — é a parte do sistema mais sensível a bug silencioso e nenhuma rodada mencionou estratégia de teste.
24. **Estimativa de custo mensal real da stack** (ver doc 05) — tratado como se fosse tudo grátis.
25. **Plano de saída/portabilidade de dados** — se algum dia trocar de fornecedor de algum serviço (Asaas, Supabase), precisa de rotina de exportação, não dependência total de um fornecedor sem plano B.
26. **Acessibilidade básica** do portal do inquilino/investidor (parte do público-alvo pode não ser tecnicamente sofisticado) — formulários simples, WhatsApp como canal primário de notificação (não só e-mail), suporte a leitura por celular em conexão fraca.

## Priorização

Nem tudo acima entra no MVP. O doc `04-roadmap-fases.md` aloca cada item numerado a uma fase; os itens 15-19 (segurança/continuidade) são pré-requisito de qualquer fase que toque dados reais de inquilinos, portanto entram já na Fase 0.
