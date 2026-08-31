# Servidor de sincronização (opcional, 100% autohospedado)

Existe para um único motivo: deixar você abrir o mesmo caso em mais de um
dispositivo (dois computadores, ou você e seu contador/advogado, cada um no
seu navegador) sem depender de nenhum serviço de nuvem de terceiro. Roda
inteiro na SUA máquina — um notebook ligado, um Raspberry Pi, um NAS — e
guarda um único arquivo: o mesmo `.sqlite` que o app já sabe exportar/
importar manualmente. Independente do `server/` (que só existe pela
integração Pluggy) — você pode usar um sem o outro.

## O que isto é (e o que não é)

- **É**: um "Dropbox de um arquivo só" com trava simples contra sobrescrita
  acidental. Cada dispositivo baixa o banco mais recente, trabalha nele
  localmente (100% como hoje), e quando quer, envia o banco inteiro de
  volta. Um contador de versão garante que, se dois dispositivos editaram
  sem sincronizar entre si, o segundo envio é recusado (erro 409) em vez de
  apagar o trabalho do primeiro silenciosamente.
- **Não é**: sincronização em tempo real, nem edição simultânea por duas
  pessoas ao mesmo tempo com merge automático — se isso acontecer, o
  segundo dispositivo a sincronizar precisa baixar a versão mais nova,
  conferir manualmente o que mudou, e então decidir como proceder (mesmo
  princípio de nunca fabricar uma reconciliação automática que o resto do
  sistema segue). Para uso pessoal ou por poucas pessoas revezando, é
  suficiente; para duas pessoas editando ao vivo ao mesmo tempo, não é.

## Rodando na sua máquina

```bash
cd sync-server
npm install
cp .env.example .env   # gere a API_KEY: openssl rand -hex 32
npm run dev
```

Sobe em `http://localhost:8788`. Os dados ficam em `sync-server/dados/`
(configurável via `DADOS_DIR` no `.env`) — dois arquivos: `banco.sqlite`
(o banco em si) e `estado.json` (contador de versão).

No app web, vá em "Sincronização" e informe a URL (`http://localhost:8788`
se for o mesmo computador, ou o IP da máquina na rede — ver abaixo — se for
outro dispositivo) e a mesma `API_KEY`.

## Acessando de outro dispositivo na mesma rede (casa/escritório)

1. Descubra o IP local da máquina que está rodando o servidor (`ipconfig`
   no Windows, `ifconfig`/`ip a` no Mac/Linux — algo como `192.168.0.42`).
2. No `.env`, ajuste `ALLOWED_ORIGIN` se o app web também for acessado por
   IP em vez de `localhost` (ex: `http://192.168.0.42:5173`).
3. No outro dispositivo, aponte a tela "Sincronização" para
   `http://192.168.0.42:8788`.

Isso não sai da sua rede local — nenhum dado passa por internet nesse
cenário.

## Acessando de fora da sua rede (ex: seu advogado, em outro escritório)

Sem um serviço de nuvem, a única forma de alcançar sua máquina de fora da
rede local é expor a porta 8788 publicamente (via encaminhamento de porta
no roteador) — **não recomendado**: exporia um servidor na sua casa
diretamente à internet. As alternativas de menor risco, em ordem de
preferência:

1. **VPN mesh autohospedável** (ex: Tailscale/Headscale, WireGuard) — cria
   uma rede privada entre seus dispositivos e os de quem você autorizar,
   sem expor nada publicamente; o servidor de sincronização continua
   pensando que está na rede local. Tailscale tem um plano gratuito
   generoso para uso pessoal (o plano de controle é deles, mas o tráfego
   de dados é direto entre os dispositivos — bem menos "nuvem" que hospedar
   este servidor num provedor).
2. **Hospedar este mesmo `sync-server/` num provedor pago** (Render,
   Railway, uma VPS) — o código já está pronto para isso (mesmo padrão de
   `API_KEY` do `server/`), mas aí você está de volta a depender de um
   serviço de nuvem — o oposto do que este servidor existe para evitar.
   Só vale se acesso remoto for mais importante que "zero nuvem" para você.
3. Continuar usando exportar/importar manual do `.sqlite` (já existe no
   app, sem nenhum servidor) quando o acesso remoto for raro.

## Rodando isso permanentemente (24/7) sem depender do seu notebook ligado

Um Raspberry Pi (a partir de ~R$300) ou um NAS doméstico (Synology,
QNAP — muitos já rodam Node) resolve isso: instala o `sync-server/` nele,
deixa ligado, e todos os seus dispositivos sincronizam contra ele mesmo com
o notebook desligado. Ainda assim zero nuvem — o hardware é seu, fica na
sua casa.

## Backup dos dados sincronizados

`sync-server/dados/banco.sqlite` é só mais um arquivo `.sqlite` — faça
backup dele como faria de qualquer arquivo importante (cópia em outro
disco, no serviço de backup que você já usa). O app web também continua
com seu próprio botão de "Exportar backup" independente disso.

## Segurança

- `.env` nunca é commitado.
- Toda rota exige a `API_KEY` própria deste servidor — trate como senha.
- O envio (`POST /api/sync/banco`) usa concorrência otimista (parâmetro
  `versaoBase`): tentar enviar sem antes ter baixado a versão mais recente
  é recusado com 409, nunca sobrescreve silenciosamente.
