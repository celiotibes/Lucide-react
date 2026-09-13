# Benchmark de Mercado — O que Entra na Proposta e o que Fica de Fora

Análise dos sistemas citados (Superlógica, Imoview, Imobzi, Rentila, Apresenta.me, Vista, Alude), filtrando por um critério único: **isso serve ao seu cenário real** (~40 imóveis, proprietário único + sócios investidores em imóveis específicos, foco em transparência financeira e repasse — não uma imobiliária de corretagem captando clientes de terceiros)? Adotar tudo que esses sistemas fazem seria repetir o erro do material anterior (scope creep) na direção oposta — copiar features de imobiliária tradicional que não se aplicam ao seu modelo.

## Metodologia e ressalva

Esta análise parte das descrições de funcionalidades fornecidas por você (material de origem comparável a conteúdo de marketing/documentação dos fornecedores) e do meu conhecimento geral sobre esse mercado. Não testei essas plataformas diretamente nesta sessão. Onde a decisão de incorporar algo depende de um detalhe fino (ex.: exatamente como o Superlógica calcula o split), trate como direção de produto a validar, não especificação fechada.

## O que cada sistema valida ou acrescenta

### Superlógica Imobiliárias
**Valida:** o núcleo da sua arquitetura (`imovel_propriedade` + `split_pagamento` + `investidor_ledger`) está certo — é exatamente o padrão "múltiplos proprietários por imóvel, split automatizado, extrato individual" que a Superlógica usa como diferencial. Isso confirma que M3 (Faturamento) e M9 (Portal do Investidor) são corretamente os módulos de maior prioridade depois do MVP básico.
**Acrescenta:** régua de cobrança com **conciliação bancária automática** tratada como recurso de primeira classe, não um extra — reforça que M11 (Tesouraria) não deveria ficar tão tarde no roadmap quanto está (ver revisão de roadmap abaixo).

### Imoview (Universal Software)
**Acrescenta duas coisas que faltavam:**
1. **Emissão de Nota Fiscal de Serviço (NFS-e)** para a receita da própria administradora (taxa de administração, honorários) — isso é uma obrigação legal municipal quando você cobra terceiros por um serviço de gestão, e não estava modelado. Adicionado ao schema (`notas_fiscais_servico`).
2. **Vínculo de nota fiscal do prestador ao imóvel** — já tínhamos isso (`ordem_servico_custos.nota_fiscal_url`), o Imoview só confirma que é padrão de mercado, não lacuna.

**Não adoto:** a ideia de "agrupar sob uma holding" como conceito de produto separado — no seu caso isso já é resolvido por `imovel_propriedade`; criar uma entidade "holding" extra seria redundância.

### Imobzi
**Acrescenta:** o conceito de **"Extrato do Proprietário" como documento visual pronto para WhatsApp/e-mail**, não um relatório que o sócio precisa gerar sozinho. Isso muda a prioridade de M9: não basta ter o ledger consultável, precisa de um **PDF mensal automático e disparado proativamente** — adicionado ao schema (`extratos_mensais_proprietario`) e ao roadmap.
**Não adoto:** o app para corretores — não existe força de vendas terceirizada no seu modelo; isso pertence ao mundo de imobiliária que capta imóveis de terceiros para alugar/vender, que não é o seu caso.

### Rentila
**Valida:** foco em depreciação e apoio a IRPF/Carnê-Leão — já coberto por M8 (Patrimônio/Depreciação CPC 27) e M15 (Tributário/DIRPF). Nenhuma lacuna nova, mas confirma que esses dois módulos têm valor de mercado reconhecido, não são over-engineering.
**Ressalva que já está na nossa auditoria:** a proposta anterior (Gemini) criticada no doc 01 tentava ir muito além disso (cap table dinâmico); o Rentila mostra que o "padrão de mercado" para gestão de patrimônio de investidor é justamente o nível mais simples que já adotamos (ledger + depreciação + apoio a IR), não o motor societário completo. Reforça que a decisão do doc 01 (item 5) estava correta.

### Apresenta.me / Alude
**Validam:** análise de crédito rápida do inquilino (M0) e assinatura eletrônica com validade jurídica (M10) são recursos padrão de mercado, não invenção nossa — nenhuma mudança necessária, apenas confirmação de prioridade.

### Vista (Vista Office)
**Acrescenta uma lacuna real:** integração via **feed XML** com portais imobiliários (ZAP Imóveis, VivaReal, OLX) para publicar automaticamente unidades de **locação padrão** vagas — o design anterior (M12) só cobria publicação de temporada/Airbnb. Um imóvel de locação longa que fica vago também precisa aparecer nesses portais sem trabalho manual. Adicionado ao roadmap (M12) e à `anuncios.plataforma`.
**Não adoto:** CRM avançado de captação de carteira de terceiros — de novo, não é o seu modelo de negócio (você não está captando imóveis de outros proprietários para intermediar).

## Resumo: o que muda concretamente na proposta

| Origem | Item incorporado | Onde |
|---|---|---|
| Imoview | Emissão de NFS-e para receita de administração/honorários | `database/schema.sql` (nova tabela), M9 |
| Imobzi | Extrato mensal do proprietário como PDF gerado e disparado automaticamente (não só ledger consultável) | `database/schema.sql` (nova tabela), M9 |
| Vista | Publicação automática de vacância de locação padrão em portais (ZAP/VivaReal/OLX), não só Airbnb | `anuncios.plataforma`, M12 |
| Superlógica | Conciliação bancária automática é prioridade alta, não tardia | Roadmap: M11 parcialmente antecipado |

## O que foi considerado e descartado (para não reintroduzir scope creep)

- App para corretores / força de vendas externa (Imobzi, Vista): não há esse papel no seu negócio.
- CRM de captação de imóveis de terceiros para a carteira (Vista): você já é o proprietário/gestor, não está captando mandatos de terceiros no mercado aberto.
- Emissão de seguros como produto vendido pela plataforma (Imoview trata seguro como produto comercializável): no seu caso, seguro-incêndio/fiança são obrigações contratuais a controlar (já cobertas em `garantias`), não um produto a vender — não vira módulo comercial.

## Ajuste de prioridade no roadmap

A conciliação bancária automática (parte de M11) sobe de prioridade: ela deixa de ser "Fase 3" pura e passa a ter uma versão simplificada (upload de OFX + categorização assistida, sem Open Finance ainda) **dentro da Fase 0/1**, porque sem isso a "prestação de contas" ao sócio (requisito crítico #2 que você mesmo levantou) fica incompleta — receita sem despesa real conciliada não é prestação de contas, é só faturamento. Ver `04-roadmap-fases.md` atualizado.
