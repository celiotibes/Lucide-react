# CRMT Histórico Contábil & Financeiro — reconstituição contábil (locação de imóveis, pessoa física)

Scaffold do pipeline descrito no dossiê técnico anexo à conversa: transforma
extratos bancários dispersos, boletos e comprovantes PIX em livro-razão,
DRE e trilha de auditoria para uso pericial (avaliação de capacidade
contributiva sob quebra de sigilo).

Este é um **esqueleto de arquitetura**, não um produto pronto — nenhum dado
real foi processado. As chamadas de IA em `src/categorize/router.py` são
apenas a especificação de roteamento (qual provedor usar em cada etapa);
implemente `Provedor.chamar` para cada backend antes de rodar em produção.

## Pipeline

```
extratos OFX/CSV + boletos/recibos (foto/PDF) + contratos + financiamentos
        │
        ▼
1. src/ingest/parse_ofx.py      → tabela `transacoes` (idempotente por fitid)
2. OCR de boletos/recibos       → (fora do escopo deste scaffold; ver router.py: Tarefa.EXTRACAO_OCR)
3. src/categorize/rules.py      → categorização determinística por regra (data/regras_categorizacao.csv)
4. src/categorize/router.py     → o que sobra vai para IA (Tarefa.CATEGORIZACAO_LOTE / EXCECAO_AMBIGUA)
5. src/reconcile/contratos.py   → casa recebimentos com os ~40 contratos de locação, gera exceções
6. src/reports/dre.py           → DRE mensal/anual, geral ou por imóvel
```

## Banco de dados

```
sqlite3 dados.db < schema.sql
```

Ver `schema.sql` para o modelo completo (contas, imóveis, contratos,
financiamentos, obras, prestadores, plano de contas, rateios) e
`plano_de_contas.md` para os códigos sugeridos.

## Uso básico

```python
import sqlite3
from src.ingest.parse_ofx import ler_ofx, importar
from src.categorize.rules import carregar_regras, aplicar_regras
from src.reconcile.contratos import gerar_competencias, conciliar
from src.reports.dre import gerar_dre, formatar_texto
from datetime import date

conexao = sqlite3.connect("dados.db")

transacoes = ler_ofx("extratos/banco_x_2023.ofx")
importar(conexao, conta_id=1, transacoes=transacoes)

regras = carregar_regras("data/regras_categorizacao.csv")
aplicar_regras(conexao, regras)

competencias = gerar_competencias(conexao, hoje=date.today())
excecoes = conciliar(conexao, competencias)  # revisar manualmente cada uma

linhas = gerar_dre(conexao, "2023-01-01", "2023-12-31")
print(formatar_texto(linhas))
```

## Próximos passos reais (fora do escopo de código)

1. Reunir os 3 anos de extrato das 6 contas em OFX (peça ao banco; CSV é
   fallback pior porque não tem `fitid` nativo).
2. Digitalizar boletos e comprovantes acumulados e linkar cada um em
   `transacoes.documento_fonte`.
3. Cadastrar os ~40 contratos em `contratos_locacao` com valor e vigência
   reais antes de rodar a conciliação.
4. Levar o DRE consolidado ao seu contador para fechamento formal
   (Domínio/Makro) e, na sequência, ao perito/software de cálculo judicial.

Ver o dossiê técnico (artefato publicado na conversa) para a análise
completa de ferramentas comerciais avaliadas, riscos de coerência e o
roteiro fase a fase de 15+ semanas.
