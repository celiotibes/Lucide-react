#!/usr/bin/env python3
"""
Script de Instalação em Produção — Kitnets UFSC v2.0

Uso:
    python3 instalar-producao.py

Descrição:
    Automatiza a configuração do sistema completo de marketing & leads
    para produção. Valida configurações, cria arquivos personalizados,
    e fornece instruções step-by-step.
"""

import os
import sys
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple
import shutil

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

SCRIPT_DIR = Path(__file__).parent
CONFIG_FILE = SCRIPT_DIR / "producao.config"
LOG_FILE = SCRIPT_DIR / "instalacao.log"

# Cores ANSI
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    BOLD = '\033[1m'
    END = '\033[0m'

# ============================================================================
# LOGGING
# ============================================================================

def log(message: str):
    """Log com timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    msg = f"[{ts}] {message}"
    print(f"{Colors.BLUE}{msg}{Colors.END}")
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")

def success(message: str):
    """Mensagem de sucesso."""
    msg = f"✅ {message}"
    print(f"{Colors.GREEN}{msg}{Colors.END}")
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")

def error(message: str, exit_code: int = 1):
    """Mensagem de erro e sair."""
    msg = f"❌ ERRO: {message}"
    print(f"{Colors.RED}{msg}{Colors.END}")
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")
    sys.exit(exit_code)

def warning(message: str):
    """Mensagem de aviso."""
    msg = f"⚠️  {message}"
    print(f"{Colors.YELLOW}{msg}{Colors.END}")
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")

def separator():
    """Linha separadora."""
    line = "━" * 60
    print(f"{Colors.BLUE}{line}{Colors.END}")

# ============================================================================
# VALIDAÇÕES
# ============================================================================

def validar_email(email: str) -> bool:
    """Valida formato de email."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validar_whatsapp(numero: str) -> bool:
    """Valida número WhatsApp (10-15 dígitos)."""
    pattern = r'^\d{10,15}$'
    return re.match(pattern, numero) is not None

def validar_sheet_id(sheet_id: str) -> bool:
    """Valida formato de Google Sheet ID."""
    return len(sheet_id) > 20 and '-' in sheet_id or len(sheet_id) > 40

def validar_sla_minutos(sla: int) -> bool:
    """Valida valor de SLA (1-60 minutos)."""
    return 1 <= sla <= 60

# ============================================================================
# COLETA DE CONFIGURAÇÃO
# ============================================================================

def coletar_configuracao() -> dict:
    """Coleta configuração do usuário com validações."""
    log("Coletando configuração...")

    print("")
    print(f"{Colors.BOLD}{Colors.BLUE}📋 CONFIGURAÇÃO DO SISTEMA{Colors.END}")
    print("Forneça as seguintes informações:\n")

    # Email
    while True:
        email = input(f"{Colors.BOLD}📧 Seu email (para alertas):{Colors.END} ").strip()
        if validar_email(email):
            break
        error("Email inválido. Use formato: nome@dominio.com", exit_code=0)
        print()

    # WhatsApp
    while True:
        whatsapp = input(f"{Colors.BOLD}📱 Seu WhatsApp (código país + número):{Colors.END} ").strip()
        if validar_whatsapp(whatsapp):
            break
        error("WhatsApp inválido. Use 10-15 dígitos, ex: 5548999887766", exit_code=0)
        print()

    # Planilha Central ID
    while True:
        sheet_id = input(f"{Colors.BOLD}🆔 ID da Planilha Central:{Colors.END} ").strip()
        if validar_sheet_id(sheet_id):
            break
        error("ID inválido. Copie de https://docs.google.com/spreadsheets/d/[ID]/...", exit_code=0)
        print()

    # SLA Minutos
    while True:
        try:
            sla = int(input(f"{Colors.BOLD}⏱️  SLA em minutos (padrão: 10):{Colors.END} ").strip() or "10")
            if validar_sla_minutos(sla):
                break
            error(f"SLA deve estar entre 1-60 minutos", exit_code=0)
            print()
        except ValueError:
            error("Digite um número válido", exit_code=0)
            print()

    # Propriedades
    props_input = input(f"{Colors.BOLD}🏢 Nomes das propriedades (separadas por vírgula):{Colors.END} ").strip()
    propriedades = [p.strip() for p in props_input.split(",")] if props_input else [
        "Pottker 25",
        "Milton Sullivan 142",
        "Ana Maria Nunes 214"
    ]

    # URLs
    landing_url = input(f"{Colors.BOLD}🔗 URL da landing page (vazio = localhost:8080):{Colors.END} ").strip() or "http://localhost:8080"
    dashboard_url = input(f"{Colors.BOLD}📊 URL do dashboard (vazio = localhost:8081):{Colors.END} ").strip() or "http://localhost:8081"

    config = {
        "OPERATOR_EMAIL": email,
        "WHATSAPP_NUMBER": whatsapp,
        "PLANILHA_CENTRAL_ID": sheet_id,
        "SLA_MINUTOS": sla,
        "PROPRIEDADES": propriedades,
        "LANDING_URL": landing_url,
        "DASHBOARD_URL": dashboard_url,
        "INSTALACAO_DATA": datetime.now().isoformat(),
        "INSTALACAO_STATUS": "em_progresso"
    }

    success("Configuração coletada com sucesso")
    return config

# ============================================================================
# SALVAR CONFIGURAÇÃO
# ============================================================================

def salvar_configuracao(config: dict):
    """Salva configuração em arquivo JSON e shell format."""
    log("Salvando configuração...")

    # Salvar como JSON
    with open(CONFIG_FILE.with_suffix('.json'), 'w') as f:
        json.dump(config, f, indent=2)

    # Salvar como shell format
    with open(CONFIG_FILE, 'w') as f:
        f.write(f"# Configuração de Produção — Kitnets UFSC\n")
        f.write(f"# Gerado em: {config['INSTALACAO_DATA']}\n\n")

        for key, value in config.items():
            if key == "PROPRIEDADES":
                props_str = " ".join([f'"{p}"' for p in value])
                f.write(f"{key}=({props_str})\n")
            elif isinstance(value, str):
                f.write(f'{key}="{value}"\n')
            else:
                f.write(f'{key}={value}\n')

    success(f"Configuração salva: {CONFIG_FILE}")

# ============================================================================
# GERAR APPSSCRIPT CUSTOMIZADO
# ============================================================================

def gerar_appsscript_customizado(config: dict):
    """Gera AppsScript com variáveis customizadas."""
    log("Gerando AppsScript customizado...")

    template_file = SCRIPT_DIR / "scripts" / "AppsScript.gs"
    output_file = SCRIPT_DIR / "AppsScript-customizado.gs"

    if not template_file.exists():
        error(f"Template não encontrado: {template_file}")

    # Ler template
    with open(template_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Substituir variáveis
    replacements = {
        r'OPERATOR_EMAIL = "[^"]*"': f'OPERATOR_EMAIL = "{config["OPERATOR_EMAIL"]}"',
        r'PLANILHA_CENTRAL_ID = "[^"]*"': f'PLANILHA_CENTRAL_ID = "{config["PLANILHA_CENTRAL_ID"]}"',
        r'SLA_MINUTOS = \d+': f'SLA_MINUTOS = {config["SLA_MINUTOS"]}'
    }

    for pattern, replacement in replacements.items():
        content = re.sub(pattern, replacement, content)

    # Salvar customizado
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)

    success(f"AppsScript customizado gerado: {output_file}")
    log("⚠️  Copie este arquivo para Google Apps Script editor")

# ============================================================================
# ATUALIZAR HTML FILES
# ============================================================================

def atualizar_html_files(config: dict):
    """Atualiza landing page e dashboard com configurações."""
    log("Atualizando arquivos HTML...")

    # Landing Page
    landing_file = SCRIPT_DIR / "landing" / "index.html"
    if landing_file.exists():
        # Backup
        backup = landing_file.with_suffix('.html.bak')
        shutil.copy(landing_file, backup)

        # Atualizar
        with open(landing_file, 'r', encoding='utf-8') as f:
            content = f.read()

        old_number = r'wa\.me/\d+'
        content = re.sub(old_number, f'wa.me/{config["WHATSAPP_NUMBER"]}', content)

        with open(landing_file, 'w', encoding='utf-8') as f:
            f.write(content)

        success(f"Landing page atualizada")

    # Dashboard
    dashboard_file = SCRIPT_DIR / "dashboard" / "painel.html"
    if dashboard_file.exists():
        # Backup
        backup = dashboard_file.with_suffix('.html.bak')
        shutil.copy(dashboard_file, backup)

        # Atualizar
        with open(dashboard_file, 'r', encoding='utf-8') as f:
            content = f.read()

        old_id = "1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ"
        content = content.replace(old_id, config["PLANILHA_CENTRAL_ID"])

        with open(dashboard_file, 'w', encoding='utf-8') as f:
            f.write(content)

        success(f"Dashboard atualizado")

# ============================================================================
# GERAR INSTRUÇÕES
# ============================================================================

def gerar_instrucoes(config: dict):
    """Gera arquivo de instruções personalizadas."""
    log("Gerando instruções personalizadas...")

    instr_file = SCRIPT_DIR / "INSTRUCOES-PERSONALIZADAS.md"

    conteudo = f"""# 📋 Instruções Personalizadas — Instalação de Produção

**Gerado em**: {config['INSTALACAO_DATA']}
**Operador**: {config['OPERATOR_EMAIL']}
**WhatsApp**: {config['WHATSAPP_NUMBER']}

---

## ✅ Checklist Rápido (15 minutos)

### 1. Google Apps Script (5 min)
1. Abra sua planilha Google (Leads)
2. Vá para: **Extensões > Apps Script**
3. Delete código existente
4. Copie **AppsScript-customizado.gs** (100%)
5. Clique **Salvar**

### 2. Gatilhos (5 min)
1. No Apps Script, clique ícone **⏰ Acionadores** (esquerda)
2. Clique **+ Adicionar acionador** e configure:

| Função | Tipo | Frequência |
|--------|------|-----------|
| checkSLA | Time-driven | Every 5 minutes |
| checkFollowUps | Time-driven | Every 1 hour |
| checkReviewRequests | Time-driven | Every day at midnight |
| onEditLeadsSheet | On edit | On edit |

### 3. IMPORTRANGE (3 min)
1. Abra sua planilha, aba **Painel**
2. Clique na célula com erro (#REF!)
3. Clique **Permitir acesso**
4. Autorizar quando Google pedir
5. Dados devem aparecer em 5-10 segundos

### 4. Deploy (2 min)
```bash
bash deploy-producao.sh
```
Escolha: Vercel (1), Netlify (2), ou Local (3)

---

## 📊 Métricas Pré-Configuradas

**Email para Alertas**: {config['OPERATOR_EMAIL']}
**SLA Limit**: {config['SLA_MINUTOS']} minutos
**WhatsApp Contact**: {config['WHATSAPP_NUMBER']}

---

## 🧪 Teste Rápido (5 min)

1. Adicione lead com Status = "Novo"
2. Aguarde {config['SLA_MINUTOS']} minutos
3. Receba email de SLA alert
4. Clique link WhatsApp → Envie mensagem
5. Volte à planilha, altere Status para "Fechado"
6. Receba email de sincronização reversa
7. ✅ Sistema pronto!

---

## 📞 Suporte

- Docs: README.md
- Setup: SETUP.md
- Auditoria: AUDITORIA.md
- Checklist Completo: CHECKLIST-INSTALACAO.md

"""

    with open(instr_file, 'w', encoding='utf-8') as f:
        f.write(conteudo)

    success(f"Instruções personalizadas criadas: {instr_file}")

# ============================================================================
# RELATÓRIO FINAL
# ============================================================================

def gerar_relatorio(config: dict):
    """Gera relatório final de instalação."""
    log("Gerando relatório final...")

    report_file = SCRIPT_DIR / f"RELATORIO-{datetime.now().strftime('%Y%m%d-%H%M%S')}.txt"

    relatorio = f"""
╔════════════════════════════════════════════════════════════════╗
║      RELATÓRIO DE INSTALAÇÃO — Kitnets UFSC v2.0              ║
╚════════════════════════════════════════════════════════════════╝

DATA/HORA: {config['INSTALACAO_DATA']}
STATUS: ✅ CONFIGURAÇÃO AUTOMATIZADA CONCLUÍDA

┌─ INFORMAÇÕES DE CONTATO ─────────────────────────────────────┐
│ Email do Operador: {config['OPERATOR_EMAIL']}
│ WhatsApp: {config['WHATSAPP_NUMBER']}
│ Planilha Central: {config['PLANILHA_CENTRAL_ID']}
└──────────────────────────────────────────────────────────────┘

┌─ CONFIGURAÇÕES ──────────────────────────────────────────────┐
│ SLA Minutos: {config['SLA_MINUTOS']}
│ Landing URL: {config['LANDING_URL']}
│ Dashboard URL: {config['DASHBOARD_URL']}
│ Propriedades: {', '.join(config['PROPRIEDADES'])}
└──────────────────────────────────────────────────────────────┘

┌─ ARQUIVOS GERADOS ───────────────────────────────────────────┐
│ ✅ producao.config (shell)
│ ✅ producao.config.json (JSON)
│ ✅ AppsScript-customizado.gs (pronto para copiar-colar)
│ ✅ landing/index.html (atualizado com WhatsApp)
│ ✅ dashboard/painel.html (atualizado com Sheet ID)
│ ✅ deploy-producao.sh (script de deployment)
│ ✅ INSTRUCOES-PERSONALIZADAS.md (seu guia rápido)
│ ✅ CHECKLIST-INSTALACAO.md (checklist completo)
└──────────────────────────────────────────────────────────────┘

┌─ PRÓXIMAS AÇÕES (ORDEM IMPORTANTE) ──────────────────────────┐
│
│ 1️⃣  APPS SCRIPT (5 min):
│     Extensões > Apps Script
│     Copiar: AppsScript-customizado.gs
│
│ 2️⃣  GATILHOS (5 min):
│     Apps Script > ⏰ Acionadores
│     Adicione 4 gatilhos (ver INSTRUCOES-PERSONALIZADAS.md)
│
│ 3️⃣  IMPORTRANGE (3 min):
│     Aba Painel > Clique erro > Permitir acesso
│
│ 4️⃣  DEPLOYMENT (2 min):
│     bash deploy-producao.sh
│     Escolha plataforma (Vercel/Netlify/Local)
│
│ 5️⃣  TESTES (5 min):
│     Siga: INSTRUCOES-PERSONALIZADAS.md (Teste Rápido)
│
└──────────────────────────────────────────────────────────────┘

┌─ DOCUMENTAÇÃO ───────────────────────────────────────────────┐
│ 📖 README.md - Referência completa
│ 🚀 SETUP.md - Instalação passo-a-passo (90 min)
│ ✅ AUDITORIA.md - Auditoria técnica
│ 📋 CHECKLIST-INSTALACAO.md - Checklist fase-by-fase
│ 🎯 INSTRUCOES-PERSONALIZADAS.md - Seu guia rápido
└──────────────────────────────────────────────────────────────┘

╔════════════════════════════════════════════════════════════════╗
║  PRÓXIMO PASSO: Leia INSTRUCOES-PERSONALIZADAS.md (2 min)    ║
║  Depois siga o checklist rápido (15 min até estar ao vivo)   ║
╚════════════════════════════════════════════════════════════════╝
"""

    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(relatorio)

    print(relatorio)
    success(f"Relatório salvo: {report_file}")

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Função principal."""
    os.system('clear') if os.name == 'posix' else os.system('cls')

    print(f"{Colors.BOLD}{Colors.BLUE}")
    print("╔════════════════════════════════════════════════════════╗")
    print("║  INSTALADOR DE PRODUÇÃO — Kitnets UFSC v2.0           ║")
    print("╚════════════════════════════════════════════════════════╝")
    print(f"{Colors.END}")
    print()

    try:
        separator()
        config = coletar_configuracao()
        separator()

        separator()
        salvar_configuracao(config)
        separator()

        separator()
        gerar_appsscript_customizado(config)
        separator()

        separator()
        atualizar_html_files(config)
        separator()

        separator()
        gerar_instrucoes(config)
        separator()

        separator()
        gerar_relatorio(config)
        separator()

        print()
        print(f"{Colors.GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━{Colors.END}")
        print(f"{Colors.GREEN}{Colors.BOLD}✅ INSTALAÇÃO AUTOMATIZADA CONCLUÍDA!{Colors.END}")
        print()
        print(f"📋 Leia próximo: {Colors.BOLD}INSTRUCOES-PERSONALIZADAS.md{Colors.END}")
        print(f"⏱️  Tempo até ao vivo: ~15 minutos")
        print(f"📊 Log: {LOG_FILE}")
        print()
        print(f"{Colors.GREEN}Sucesso! 🚀{Colors.END}")

    except KeyboardInterrupt:
        print()
        error("Instalação cancelada pelo usuário", exit_code=0)
    except Exception as e:
        error(f"Erro inesperado: {e}")

# ============================================================================
# EXECUTAR
# ============================================================================

if __name__ == "__main__":
    main()
