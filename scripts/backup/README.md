# Backup externo (cópia redundante fora do Supabase)

O Supabase é o fornecedor principal. Esta pasta cuida da cópia **fora** dele: se a conta do
Supabase for suspensa por qualquer motivo, o caso não pode ficar sem dado. Todo o envio passa
por um binário externo, o [`rclone`](https://rclone.org) — os scripts aqui não sabem para onde
o backup vai, só o nome do "remote" configurado.

## Por que rclone

O dono ainda não tinha decidido entre Backblaze B2, S3, Google Drive e afins quando este
pacote foi escrito. `rclone` fala a mesma interface de linha de comando com mais de 70
fornecedores (Backblaze B2, S3 e compatíveis, Google Drive, Dropbox, Azure, etc.) — trocar de
fornecedor no futuro é reconfigurar um "remote" com `rclone config`, sem tocar em
`enviar-backup.ts` nem `verificar-remoto.ts`. Não foi adicionada nenhuma dependência de npm
para isso: os scripts chamam o binário `rclone` via `child_process`, do mesmo jeito que
chamariam `git` ou `psql`.

**Destino atual: Google Drive** (decisão do dono, "por enquanto" — daí o cuidado de manter
tudo agnóstico de fornecedor no código; só o passo a passo abaixo é específico do Drive).

> As instruções de `rclone config` abaixo foram conferidas contra a documentação atual do
> rclone (via Context7, refletindo `docs/content/drive.md` do repositório `rclone/rclone`) em
> 25/09/2026. Comandos e nomes de flag podem mudar em versões futuras do rclone — se algo na
> tela não bater com o que está aqui, confie no que o `rclone config` mostrar.

## 1. Instalar o rclone

```bash
# Ubuntu/Debian, se o pacote do repositório estiver disponível
sudo apt-get update && sudo apt-get install -y rclone

# Script oficial de instalação (Linux/macOS), sempre a versão mais recente
sudo -v && curl https://rclone.org/install.sh | sudo bash

# macOS via Homebrew
brew install rclone

# Download direto: https://rclone.org/downloads/
```

Se o `rclone` não estiver no PATH, os dois scripts desta pasta recusam rodar e imprimem estas
mesmas instruções — não falham de forma obscura, não tentam simular o envio.

## 2. Configurar o remote do Google Drive

**Antes de tudo: crie seu próprio `client_id`.** O `client_id` compartilhado que o rclone usa
por padrão para o Google Drive **está sendo descontinuado ao longo de 2026** — a própria
configuração interativa avisa isso e pergunta se você quer continuar mesmo assim (responda
`n`). Criar o seu evita que os envios simplesmente parem de funcionar sem aviso:

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou use um
   existente) e ative a **Google Drive API**.
2. Configure a tela de consentimento OAuth (tipo "Externo" serve; adicione seu e-mail como
   usuário de teste se o app não for verificado pelo Google).
3. Crie uma credencial OAuth do tipo **"Aplicativo para computador" (Desktop app)** e anote o
   `client_id` e o `client_secret`.

Guia oficial: <https://rclone.org/drive/#making-your-own-client-id>

Depois, rode:

```bash
rclone config
```

E siga a sequência (o que aparece na tela, resumido):

```
n) New remote
name> gdrive                      # o nome que os scripts vão usar em --remote
Storage> drive                    # ou digite o número correspondente a "Google Drive"
client_id> <seu client_id>        # do passo acima — NÃO deixe em branco
client_secret> <seu client_secret>

Scope that rclone should use when requesting access from drive.
 1 / Full access all files, excluding Application Data Folder.  \ "drive"
 3 / Access to files created by rclone only ...                  \ "drive.file"
scope> 3                          # ver a recomendação abaixo — RECOMENDADO: drive.file

service_account_file>             # deixe em branco (não estamos usando conta de serviço)

Continue using the shared client_id anyway?
y/n> n                            # confirma que você vai usar o client_id próprio

Use web browser to automatically authenticate rclone with remote?
y/n> y                            # se a máquina tem navegador; ver nota abaixo se não tiver

Configure this as a Shared Drive (Team Drive)?
y/n> n                            # a menos que o backup deva ir para um Drive compartilhado

y) Yes this is OK
```

### Qual scope usar: `drive.file`, recomendado

O prompt de configuração oferece cinco escopos. Para este caso de uso — um backup pericial,
onde vazamento do token de acesso é um risco sério — a recomendação é **`drive.file`** (opção
3), não o `drive` completo (opção 1):

- `drive` (completo) dá ao rclone acesso a **todo** o Google Drive da conta, não só à pasta de
  backup. Se o token vazar (arquivo `rclone.conf`, variável de ambiente, log), o alcance do
  vazamento é o Drive inteiro.
- `drive.file` limita o rclone a enxergar **apenas os arquivos que ele mesmo criou** por essa
  conexão. Um token vazado sob este escopo só expõe os próprios backups, nada mais na conta.

**Único cuidado que este escopo exige**: `drive.file` só enxerga o que o rclone criou. Não
aponte o remote para uma pasta que você já criou manualmente pela interface do Drive
(`root_folder_id` de uma pasta pré-existente) — o rclone não vai enxergar nem conseguir
escrever nela sob este escopo. Deixe o remote sem `root_folder_id` (padrão) e deixe os
próprios scripts criarem a pasta (`backups-contabilidade/diarios`, etc.) no primeiro envio —
eles já fazem isso automaticamente. Depois de criada por eles, você pode encontrá-la e
compartilhá-la pela interface do Drive normalmente; compartilhar não muda o que o rclone
enxerga.

Se algo não funcionar sob `drive.file` (por exemplo, você precisa que outra ferramenta também
gerencie esses arquivos), reconfigure o remote com escopo `drive` — é só rodar
`rclone config reconnect gdrive:` e escolher a opção 1.

### Máquina sem navegador (servidor onde o cron vai rodar)

Se a máquina que vai rodar o cron não tem navegador, responda `n` em "Use web browser..." e
siga as instruções que o `rclone config` mostra (rodar `rclone authorize "drive"` numa máquina
com navegador e colar o resultado de volta), ou use um túnel SSH
(`ssh -L localhost:53682:localhost:53682 usuario@servidor`) e responda `y` normalmente. Ver
<https://rclone.org/remote_setup/>.

### Teste

```bash
rclone lsd gdrive:
```

Se listar (mesmo vazio, sem erro), o remote está funcionando.

## 3. O que os scripts fazem

### `enviar-backup.ts` — verifica e envia, com retenção

```bash
npm run backup:enviar -- <backup.sqlite | pasta-com-backups> --remote gdrive
```

1. **Verifica o backup local antes de tocar no rclone** — reusa `verificarBackup()` de
   `src/domain/backup/verificarBackup.ts` (a mesma função que `scripts/verificar-backup.ts`
   usa): restaura o `.sqlite` de verdade e confere as invariantes contábeis (período fecha,
   caixa bate com o extrato, cofre de evidências íntegro, contas do razão existem). **Se
   reprovar, o script para aqui — nada é enviado.** Subir um backup ruim é pior do que não
   subir nada: cria a falsa impressão de que existe cópia redundante.
2. Envia o arquivo para até três séries independentes no remote — `diarios/`, `semanais/`,
   `mensais/` — dependendo do dia (ver política de retenção abaixo).
3. Aplica a retenção: apaga, em cada série enviada, os arquivos mais velhos que o prazo
   daquela série.

Se `<backup.sqlite | pasta-com-backups>` for uma pasta, o script pega o `.sqlite` mais
recente dentro dela — útil se o export do app cair sempre no mesmo diretório.

### `verificar-remoto.ts` — prova que a cópia no destino serve

```bash
npm run backup:verificar-remoto -- --remote gdrive
```

Baixa o backup **mais recente que está no destino** (não o arquivo local que foi enviado) e
roda a mesma verificação de restauração nele. É o passo que normalmente ninguém faz: um envio
que "deu certo" (rclone terminou sem erro) não prova que o fornecedor guardou os bytes certos
— upload truncado por queda de conexão, corrupção do lado do fornecedor, tudo isso é
indistinguível de um backup bom até a hora do aperto. Rodar isto periodicamente (recomendação:
semanal, ver crontab abaixo) é o que efetivamente comprova que a cópia serve.

## 4. Política de retenção

Três séries independentes, cada envio manda uma cópia para as que se aplicam:

| Série      | Quando envia              | Retenção padrão      | Por quê |
|------------|----------------------------|------------------------|---------|
| `diarios`  | toda execução               | 14 dias                 | cobre "percebi um problema esta semana", não é recuperação de longo prazo |
| `semanais` | domingos (configurável)     | 90 dias (~3 meses)      | cobre o intervalo entre "ninguém olhou por um tempo" e "já é caso arquivado" |
| `mensais`  | dia 1 do mês (configurável) | 3650 dias (10 anos)     | teto de prescrição geral do art. 205 do Código Civil — não é o prazo de toda ação sobre locação (vários são mais curtos), mas serve como teto seguro por padrão, já que o custo de guardar snapshots mensais de um banco deste porte (algumas centenas de KB a poucos MB) é desprezível perto do risco de precisar e não ter |

Cada série é uma cópia separada (não uma "promoção" do diário para o semanal): mais simples de
auditar, ao custo de enviar o mesmo arquivo até três vezes no mesmo dia — raro, só quando
domingo e dia 1 coincidem, e irrelevante em custo para um arquivo deste tamanho.

Tudo isso é configurável por flag:

```bash
npm run backup:enviar -- backup.sqlite --remote gdrive \
  --reter-diarios-dias 14 --reter-semanais-dias 90 --reter-mensais-dias 3650 \
  --dia-semanal 7 --dia-mensal 1
```

`--reter-mensais-dias 0` desliga a poda da série mensal ("nunca apagar") — para quem preferir
não decidir um prazo.

Se o cron não rodar num domingo ou dia 1 (máquina desligada, falha de rede), aquela semana/mês
fica sem cópia na série correspondente. Para cobrir manualmente:

```bash
npm run backup:enviar -- backup.sqlite --remote gdrive --forcar semanais,mensais
```

### Atenção: lixeira do Google Drive e cota

Por padrão, o rclone **manda para a lixeira** os arquivos que apaga no Google Drive
(`--drive-use-trash`, ligado por padrão), em vez de apagar em definitivo. Isso significa duas
coisas que o dono precisa saber:

1. **É uma rede de segurança**: se a política de retenção tiver um bug, ou um arquivo for
   apagado por engano, ele ainda está recuperável na lixeira do Drive por um tempo (o Google
   expira itens da lixeira automaticamente após 30 dias).
2. **Mas continua contando na cota** até ser removido da lixeira (automaticamente após 30 dias,
   ou manualmente). Um `du` que pareça baixo pode não refletir o que a cota do Drive mostra.

Este pacote **não muda esse padrão** — a rede de segurança vale mais do que economizar cota
para um banco deste tamanho — mas se a cota apertar: esvazie a lixeira periodicamente
(`rclone cleanup gdrive:`) ou, se preferir exclusão definitiva imediata desde já, reconfigure o
remote com `use_trash = false` (ciente de que aí a retenção passa a ser irreversível no
momento em que apaga).

## 5. Cron

```cron
# Envio diário às 3h da manhã (hora local do servidor) — verifica, envia, aplica retenção
0 3 * * * cd /caminho/do/projeto && /usr/bin/npm run backup:enviar -- /caminho/para/backups/ultimo.sqlite --remote gdrive >> /var/log/backup-contabil-envio.log 2>&1

# Verificação de restauração do que está no Drive — semanal, domingo às 4h (depois do envio)
0 4 * * 0 cd /caminho/do/projeto && /usr/bin/npm run backup:verificar-remoto -- --remote gdrive >> /var/log/backup-contabil-verificacao.log 2>&1
```

Ajuste o caminho do `.sqlite` de origem para onde o export do app efetivamente fica salvo
nesta máquina (fora do escopo deste pacote — os scripts aqui partem de um `.sqlite` que já
existe em disco).

## 6. O que fazer quando falha

Os códigos de saída existem para isso — um cron silencioso sobre um backup ruim é o jeito mais
comum de perder dado com "backup configurado":

- **Saída 1 do `enviar-backup`** — o backup local mais recente **foi reprovado** na
  verificação. Não é falha do script de envio, é achado dele: alguma coisa está errada no
  banco/export local. Rode `npm run verificar-backup -- <arquivo>` para ver exatamente qual
  checagem falhou, e trate como urgente — **não existe uma cópia externa nova até isto ser
  corrigido**.
- **Saída 1 do `verificar-remoto`** — pior caso: o arquivo mais recente **que está no Drive**
  não restaura ou não fecha, mesmo que o envio tenha "dado certo" na hora. Trate como se não
  houvesse backup externo até investigar (rede na hora do envio, corrupção do lado do
  fornecedor) e reenviar um backup local bom.
- **Saída 2** — falha operacional: rclone ausente, remote mal configurado, rede fora do ar,
  cota do Google excedida, permissão. O log do cron (stderr, redirecionado acima) tem a
  mensagem exata do rclone. O backup local em si pode estar bom — é a tentativa de
  enviá-lo/verificá-lo que não completou.

Configure o cron para notificar em qualquer saída diferente de zero (`MAILTO=` no crontab, ou
um agregador de logs que alerte em erro) — sem isso, uma falha silenciosa equivale a não ter
backup.

## 7. O que foi testado, e como

Este ambiente de desenvolvimento não tinha `rclone` disponível via `apt`/download direto
(bloqueado pela política de rede daqui). Os dois scripts foram exercitados de ponta a ponta
com um `rclone` real (compilado localmente só para este teste) e um remote `type = local`
(um dos tipos que o `rclone config` aceita — grava num diretório, o que serve exatamente para
provar o fluxo de envio/retenção/verificação sem depender de nuvem):

- backup bom → verificado e enviado às três séries, retenção não apagou nada ainda no prazo;
- backup ruim (arquivo que não é SQLite) → reprovado, **nada** enviado ao remote, saída 1;
- retenção → arquivo com mais de 14 dias apagado, arquivos recentes mantidos;
- `verificar-remoto` → baixou o mais recente da série e confirmou que restaura (saída 0); e,
  num segundo teste, com um arquivo corrompido injetado no destino, acusou corretamente que a
  cópia não presta (saída 1);
- rclone ausente do PATH → mensagem de instalação clara, saída 2, sem tentar simular o envio.

**O que isto NÃO testa**: a conexão real com o Google Drive (OAuth, cota da API, comportamento
real da lixeira). Isso só é exercitado quando o dono configurar o remote `drive` de verdade e
rodar `npm run backup:enviar` uma vez manualmente para conferir.
