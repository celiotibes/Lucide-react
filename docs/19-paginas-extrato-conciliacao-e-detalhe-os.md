# Três Telas que Faltavam para o Backend Já Pronto

Terceira rodada de auditoria pedida explicitamente ("verifique se falta algo que eu consiga fazer sozinho" — sem depender de credencial ou decisão de negócio). O achado desta vez não foi no schema, foi na interface: o back-office tinha só 5 telas (imóveis, contratos, faturas, ordens de serviço, relatórios), enquanto o backend das últimas rodadas (extrato do proprietário, conciliação bancária, chamados com andamento) já estava pronto e testado sem nenhuma forma de ver ou usar pelo navegador.

## `app/extratos`

Lista `extratos_mensais_proprietario` (por imóvel e consolidado da carteira), mesmo padrão read-only de `app/faturas`. Sem envio real por WhatsApp/e-mail ainda (docs/18), a coluna "Envio" mostra "não enviado" com destaque visual em vez de fingir uma data.

## `app/conciliacao-bancaria`

Primeira tela do back-office com uma ação de escrita fora dos formulários de cadastro (`app/imoveis/novo`, `app/contratos/novo`). Lista `transacoes_bancarias` com `status = 'sugerido'` e dois botões por linha — Aprovar (com seletor de categoria financeira) e Ignorar — cada um chamando uma Server Action que atualiza o banco e revalida a página. `aprovado_por` fica em branco de propósito: não existe sessão de usuário autenticado ainda (mesma situação de toda tela do sistema), então gravar um autor seria inventar dado que a ação não teve.

Verificado com um navegador de verdade (Chromium headless, Playwright instalado temporariamente só para este teste manual e removido depois — não é dependência do projeto): clique em "Aprovar" grava `status = 'aprovado'`, `categoria_final` e `aprovado_em` no Postgres real, e a transação desaparece da lista de pendentes no próximo carregamento.

## `app/ordens-servico/[id]`

Detalhe de um chamado/OS: ficha com protocolo, natureza, status, SLA (com destaque de vencido), anexos, avaliação, e a linha do tempo completa de `ordem_servico_andamentos` — cada etapa com quem registrou, quando, descrição e fotos. A lista (`app/ordens-servico`) ganhou link do protocolo para esta tela nova.

## Verificação

232 testes (117 unitários + 115 de integração, 3 execuções consecutivas limpas), build/lint/typecheck limpos. As três telas novas testadas contra Postgres real com dado de fumaça via `curl` e, para a ação de aprovar (a única com efeito colateral que um `curl` simples não consegue disparar corretamente — Server Actions do Next.js não são um POST de formulário comum), com um navegador headless de verdade confirmando o clique gravando no banco.
