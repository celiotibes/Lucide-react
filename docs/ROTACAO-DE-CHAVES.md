# Rotação de chaves da criptografia de campo

Procedimento operacional para trocar a chave usada por `field-level-encryption`
(ChaCha20-Poly1305) sem indisponibilidade e sem perder a leitura de dados antigos.

Este documento descreve um mecanismo técnico. Ele não afirma, nem substitui,
análise de conformidade jurídica (LGPD ou outra norma).

## Como funciona

- Cada valor cifrado carrega o identificador da chave (`kid`). Em coluna de texto o
  formato é `fle:<kid>:<iv>:<tag>:<conteudo>` (hex). Objetos `DadosCriptografados`
  ganham o campo opcional `kid`.
- Cifra-se sempre com a chave **ativa**. Decifra-se com a chave do `kid` do envelope.
- Dado legado, sem `kid` (JSON `{iv, conteudo, tag, versao: 1}`), é tratado como
  `kid` `1` (chave legada). Muda-se esse kid, se necessário, com `FIELD_ENCRYPTION_LEGACY_KID`.
- `kid` desconhecido: erro explícito (`ErroChaveDesconhecida`), sem fallback para outra
  chave. Mensagens de erro e logs não contêm chave nem texto em claro.

## Configuração (variáveis de ambiente)

| Variável | Conteúdo |
|---|---|
| `FIELD_ENCRYPTION_KEYS` | JSON `{"1":"<base64>","2":"<base64>"}` ou lista `1:<base64>,2:<base64>`. Cada chave tem 32 bytes (base64 ou 64 hex). |
| `FIELD_ENCRYPTION_ACTIVE_KID` | kid usado para cifrar. Obrigatório quando `FIELD_ENCRYPTION_KEYS` está definida. |
| `FIELD_ENCRYPTION_KEY` | Modo legado de chave única (hex ou base64). Vira o kid `1` e é ativa se for a única. Se coexistir com `FIELD_ENCRYPTION_KEYS` e o kid `1` não estiver listado, entra como `1`. |
| `FIELD_ENCRYPTION_LEGACY_KID` | Opcional. kid para dados sem versão (padrão `1`). |

Quem lê as variáveis: `carregarChaveiro()` em `server/src/domain/encryption/chaveiro.ts`.

## Procedimento

1. **Gerar a chave nova** fora do banco e fora do repositório:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   Guarde-a no cofre de segredos antes de qualquer outro passo.
2. **Publicar as duas chaves, ainda com a antiga ativa.** Em `FIELD_ENCRYPTION_KEYS`
   inclua a nova (ex.: kid `2`) e mantenha `FIELD_ENCRYPTION_ACTIVE_KID=1`. Implante e
   confirme que todas as instâncias leem a configuração (leitura de dados antigos e novos funciona).
3. **Ativar a nova.** Mude `FIELD_ENCRYPTION_ACTIVE_KID=2` e reimplante. A partir daqui
   toda escrita usa a chave 2; leituras de dados com kid 1 continuam funcionando.
4. **Ensaiar.** Faça backup (`docs/BACKUP.md`) e rode com `--dry-run`:
   `tsx server/src/scripts/rotacionar-chaves.ts --tabela=clientes:cpf,email --dry-run`
   Nada é gravado; o relatório mostra quantos valores seriam reescritos e eventuais falhas.
5. **Reencriptar.** Repita sem `--dry-run`. Opções: `--lote=<n>` (padrão 500),
   `--db=<caminho>`, várias `--tabela=<t>:<colunas>`. O processo é idempotente e
   retomável: cada lote é uma transação, só o que não está na chave ativa é reescrito, e
   uma interrupção pode ser seguida de nova execução. Pode rodar com a aplicação no ar
   (a gravação é condicional ao valor lido; se outro processo alterar o valor no meio,
   conta como `conflitos` e é pego na execução seguinte).
6. **Verificar zero pendentes.** Rode de novo (de preferência com `--dry-run`) até o relatório
   mostrar `reescritos=0 falhas=0 conflitos=0 pendentes=0` em **todas** as tabelas e colunas
   cifradas do sistema. O script sai com código 1 enquanto houver pendências.
7. **Aposentar a chave antiga somente depois disso**, e depois de a janela de retenção dos
   backups anteriores à rotação ter sido decidida (ver abaixo). Remova o kid `1` de
   `FIELD_ENCRYPTION_KEYS`, reimplante e confirme que a aplicação lê os dados normalmente.
   Não destrua a chave antiga enquanto existir backup que dependa dela.

Reversão: antes do passo 7, basta voltar `FIELD_ENCRYPTION_ACTIVE_KID` ao kid anterior e
reencriptar; as duas chaves continuam lendo tudo.

## Guarda das chaves

- Chaves ficam em cofre de segredos/KMS ou variáveis de ambiente do provedor, nunca no
  banco, no repositório, em logs ou no mesmo local dos backups do banco.
- Quem acessa o backup do banco não deve, por isso, ganhar acesso às chaves.
- Mantenha cópia da chave de cada kid ainda necessário (inclusive para restaurar backups
  antigos) em local seguro e separado, com controle de acesso e registro de quem a lê.
- Restaurar um backup anterior à rotação exige a chave antiga correspondente.

## O que NÃO está coberto

- Não há KMS/HSM integrado: as chaves vêm do ambiente e ficam em memória do processo.
- Não faz rotação automática nem agendada; o procedimento é manual.
- Reencriptação cobre apenas as tabelas/colunas informadas ao script (SQLite, texto).
  Não descobre sozinho quais colunas são cifradas; a lista deve ser mantida pelo operador.
- Valores que não são envelopes (texto puro, nulos, vazios) não são tocados nem cifrados;
  aparecem em `naoCifrados`.
- Backups, exportações e cópias já feitas continuam cifrados com a chave antiga.
- Chave comprometida: a rotação protege dados daqui para frente e reencripta os atuais,
  mas não desfaz acesso já obtido com a chave vazada.
- Não cobre outros segredos (sessão, tokens de integração, CSRF) nem cifra em trânsito.
- Os campos de `criptografarObjeto`/`descriptografarObjeto` (API de chave explícita) não
  usam o chaveiro; a integração de chamadores com `criptografarVersionado` é passo à parte.
- Nenhuma afirmação de conformidade legal ou regulatória decorre deste mecanismo.
