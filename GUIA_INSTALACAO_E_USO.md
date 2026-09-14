# CRMT Histórico Contábil & Financeiro — guia de instalação e uso

Este guia parte do zero: como colocar o sistema para rodar no seu computador
e como usá-lo no dia a dia. Não presume nenhuma experiência com programação.

> **Resumo em uma frase:** você instala um programa (Node.js), baixa esta
> pasta, roda um comando, e o sistema abre no seu navegador — como um site,
> mas rodando 100% no seu computador, sem internet, sem servidor de
> terceiros.

---

## 1. O que você precisa antes de começar

| Item | Por quê | Onde conseguir |
|---|---|---|
| **Node.js** (versão 20.19 ou mais recente, ou 22.12+) | É o "motor" que roda o sistema no seu computador | [nodejs.org](https://nodejs.org) — baixe a versão **LTS** |
| **Um navegador atualizado** | É onde o sistema abre e roda | Chrome ou Edge (melhor suporte a WebAssembly/IndexedDB, que o sistema usa) |
| **~500 MB de espaço em disco** | Dependências baixadas na instalação | — |
| Internet **só na instalação** | Depois de instalado, o sistema funciona offline | Exceções: buscar índices do BACEN e baixar o pacote de português do OCR na primeira vez (ver Limitações no README) |

Você **não precisa** saber programar, usar linha de comando além de copiar e
colar os comandos abaixo, nem pagar nada.

---

## 2. Instalar o Node.js (só uma vez)

1. Acesse [nodejs.org](https://nodejs.org).
2. Baixe o instalador **LTS** (recomendado, a versão mais estável) para o
   seu sistema — Windows, Mac ou Linux.
3. Execute o instalador e siga o padrão (clicar "Avançar/Next" até o fim).
4. Para confirmar que funcionou, abra o terminal:
   - **Windows**: tecla `Windows` → digite `cmd` → Enter.
   - **Mac**: `Cmd + Espaço` → digite `terminal` → Enter.
   - **Linux**: abra o terminal do seu ambiente normalmente.
5. Digite `node --version` e aperte Enter. Se aparecer algo como `v22.x.x`
   ou `v20.19.x` (ou mais recente), está pronto.

---

## 3. Baixar o sistema

Se você recebeu esta pasta por download/pen drive, pule para o Passo 4.

Se for baixar do GitHub:
1. Acesse a página do repositório no GitHub.
2. Botão verde **Code** → **Download ZIP**.
3. Extraia o ZIP em uma pasta de sua preferência (ex: `Documentos\sistema-contabil`).

*(Se você já usa Git, `git clone` funciona igual — mas não é necessário.)*

---

## 4. Instalar as dependências e abrir o sistema

### Opção fácil (Windows/Mac) — clique duplo

Este pacote inclui dois atalhos prontos na raiz da pasta:

- **Windows**: dê duplo clique em `iniciar-windows.bat`.
- **Mac**: dê duplo clique em `iniciar-mac-linux.command` (na primeira vez,
  o macOS pode bloquear por segurança — clique com o botão direito nele →
  **Abrir** → confirme "Abrir mesmo assim").
- **Linux**: abra um terminal na pasta e rode `./iniciar-mac-linux.command`.

Esses atalhos fazem tudo sozinhos: instalam as dependências na primeira vez
(demora alguns minutos, só acontece uma vez) e depois abrem o sistema
automaticamente no navegador. Nas próximas vezes, é só clicar de novo — a
instalação não se repete.

### Opção manual (qualquer sistema)

Se preferir fazer via terminal:

```bash
cd caminho/da/pasta/do/sistema
npm install
npm run dev
```

- `npm install` baixa as dependências — só precisa rodar **uma vez** (ou de
  novo se o sistema for atualizado no futuro). Demora alguns minutos.
- `npm run dev` liga o sistema. O terminal vai mostrar algo como:
  ```
  ➜  Local:   http://localhost:5173/
  ```
  Abra esse endereço no navegador. Se a porta `5173` estiver ocupada, o Vite
  escolhe outra automaticamente e mostra qual no terminal.

**Para desligar o sistema**: volte no terminal (ou na janela que abriu com o
atalho) e aperte `Ctrl + C`. Fechar só a aba do navegador não desliga nada,
mas também não é necessário desligar — pode deixar rodando em segundo plano.

### Modo produção (opcional)

Os atalhos acima rodam em **modo desenvolvimento** — perfeito para o uso do
dia a dia. Existe também um modo **produção**, que gera antes um pacote
otimizado (arquivos minificados, carregamento mais rápido) e só depois abre
o sistema — a mesma forma como o sistema rodaria se fosse publicado num
site de verdade, mas continuando 100% local. A diferença prática no uso é
pequena; vale a pena quando quiser a experiência de carregamento mais
rápida, ou antes de uma apresentação/demonstração importante.

- **Windows**: duplo clique em `instalar-producao-windows.bat`.
- **Mac**: duplo clique em `instalar-producao-mac-linux.command` (mesma
  liberação de segurança da seção acima, se pedida).
- **Linux**: `./instalar-producao-mac-linux.command` no terminal.

Esse atalho instala as dependências (só na primeira vez), gera o pacote de
produção (`npm run build` — leva alguns segundos, e falha alto, sem abrir
nada, se houver algum erro de código) e depois serve esse pacote pronto,
abrindo o navegador em `http://localhost:4173` (porta diferente da 5173 do
modo desenvolvimento, para os dois poderem rodar ao mesmo tempo se
precisar). Para desligar, o procedimento é o mesmo: `Ctrl + C` ou fechar a
janela.

---

## 5. Primeiro uso dentro do sistema

1. **Explore primeiro com dados de demonstração.** Na tela inicial, clique
   em **"Carregar dados de demonstração"** — isso popula o sistema com um
   cenário fictício completo (imóveis, contratos, extratos, inadimplência)
   para você conhecer todas as telas sem risco de misturar com dados reais.
2. **Quando for usar dados reais**, comece pela aba **Imóveis**: cadastre
   cada imóvel seu (apelido, tipo, cidade, endereço, se é financiado, se é
   uso pessoal). Isso vem antes de importar extratos, porque as transações
   precisam de um imóvel para se vincular.
3. Cadastre em **Cadastros**: contas bancárias, contratos de locação,
   prestadores de serviço, financiamentos.
4. Vá em **Importar documentos** e arraste seus extratos (`.ofx`, `.csv`,
   PDF) ou fotos de comprovante/boleto. O sistema processa tudo no seu
   navegador — nada sai do computador.
5. Revise a fila de pendências em **Transações** — cada lançamento precisa
   de categoria e imóvel (ou rateio, se a despesa for coletiva).
6. Acompanhe o **Painel** (Dashboard) para ver DRE, inadimplência e os
   demais relatórios se atualizando conforme você cadastra.

> Se em algum momento quiser recomeçar do zero com dados reais depois de
> ter explorado com a demonstração, **não existe um botão de "limpar tudo"
> deliberado** — a forma mais segura é fechar a aba, limpar os dados do site
> no navegador (ver seção 6) e abrir de novo, o que recria um banco vazio.

---

## 6. Onde seus dados ficam guardados — leia com atenção

Os dados **não vão para nenhum servidor**. Eles ficam salvos dentro do
próprio navegador, numa tecnologia chamada IndexedDB, associada a:
- este computador específico,
- este navegador específico (Chrome e Firefox guardam dados separadamente,
  mesmo na mesma máquina),
- e este perfil/usuário do navegador.

**Isso tem uma consequência importante**: se você limpar o cache/dados de
navegação do navegador, trocar de computador, ou desinstalar o navegador,
**os dados salvos ali se perdem** — não há uma cópia em nuvem por padrão
(esse é o ponto do sistema: privacidade dos seus dados financeiros).

### Por isso, faça backup regularmente

No cabeçalho do sistema existe **Exportar backup** — baixa um arquivo
`.sqlite` com tudo, mais um código (hash SHA-256) que prova que aquele
arquivo não foi alterado depois. Guarde esse arquivo em outro lugar (pen
drive, nuvem pessoal, e-mail para você mesmo).

Um aviso aparece no cabeçalho quando há alteração feita depois do último
backup exportado — leve-o a sério.

Para recuperar depois: **Importar backup**, selecione o arquivo `.sqlite`
salvo.

---

## 7. Usando no dia a dia (depois da primeira vez)

Não é preciso repetir a instalação. Toda vez que quiser usar:

- **Windows/Mac**: clique de novo no atalho (`iniciar-windows.bat` /
  `iniciar-mac-linux.command`).
- **Manual**: abra o terminal na pasta e rode `npm run dev`.

Seus dados continuam salvos no navegador entre uma sessão e outra — não é
preciso importar backup toda vez, só se você trocar de computador/navegador
ou limpar os dados por engano.

---

## 8. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `'npm' não é reconhecido...` (Windows) ou `command not found: npm` (Mac/Linux) | Node.js não instalado, ou terminal aberto antes da instalação terminar | Reinstale o Node.js e abra um terminal **novo** |
| Tela branca ao abrir `localhost:5173` | Navegador sem suporte completo a WebAssembly, ou versão do Node desatualizada | Use Chrome ou Edge atualizados; confirme `node --version` ≥ 20.19 |
| `npm install` trava ou dá erro de rede | Sem internet, ou firewall corporativo bloqueando o registro do npm | Tente outra rede, ou rode novamente mais tarde |
| Porta 5173 "already in use" | Já existe outra instância rodando | Feche a janela/terminal anterior, ou simplesmente use a nova porta que o Vite escolher sozinho |
| macOS bloqueia o `.command` | Gatekeeper do macOS por padrão | Botão direito no arquivo → **Abrir** → confirmar "Abrir mesmo assim" (só precisa uma vez) |
| Dados sumiram | Cache do navegador foi limpo, ou abriu num navegador/perfil diferente do de sempre | Restaure pelo backup `.sqlite` mais recente (seção 6) — daí a importância de exportar regularmente |

---

## 9. Se o sistema for atualizado no futuro

Se você (ou quem desenvolve) baixar uma versão mais nova do código:

```bash
npm install     # pega dependências novas, se houver
npm run dev     # roda normalmente
```

Seus dados **não são afetados** por atualizar o código — eles continuam no
IndexedDB do navegador, separados dos arquivos do programa. O sistema
inclusive migra automaticamente colunas/tabelas novas no seu banco salvo
quando necessário (ver "Limitações conhecidas" no `README.md` principal).

---

Para a lista completa de funcionalidades, limitações conhecidas e detalhes
técnicos de cada módulo, veja o `README.md` na raiz do projeto.
