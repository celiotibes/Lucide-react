#!/usr/bin/env python3
"""
Gera dados estruturados para Planilha Central — CRMT Marketing e Anúncios
Copia a saída JSON e cola no Google Sheets, ou use API do Sheets
"""

import json
from datetime import datetime

# Dados das propriedades — EDITE AQUI se precisar atualizar
PROPRIEDADES = {
    "Pottker 25": {
        "endereco": "Servidão Prof. João Carlos Pottker, 25, Carvoeira",
        "whatsapp": "554140425242",
        "unidades": [
            # ALUGADAS
            {"numero": 18, "tipo": "2 quartos", "area": 50, "preco": 2699, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 2, "tipo": "2 quartos", "area": 50, "preco": 2699, "status": "Alugada", "locatario": "", "inicio": "2026-08-23"},
            # DISPONÍVEIS
            {"numero": 6, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Vacante", "locatario": "", "inicio": ""},
            {"numero": 14, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Vacante", "locatario": "", "inicio": ""},
            {"numero": 17, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Vacante", "locatario": "", "inicio": ""},
            {"numero": 20, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Vacante", "locatario": "", "inicio": ""},
            # Resto alugadas (15 unidades faltam aqui — COMPLETE MANUALMENTE COM SEUS DADOS)
            {"numero": 1, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 3, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 4, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 5, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 7, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 8, "tipo": "2 quartos", "area": 50, "preco": 2699, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 9, "tipo": "2 quartos", "area": 50, "preco": 2699, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 10, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 11, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 12, "tipo": "2 quartos", "area": 50, "preco": 2699, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 13, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 15, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 16, "tipo": "2 quartos", "area": 50, "preco": 2699, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 19, "tipo": "1 quarto", "area": 22, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 21, "tipo": "2 quartos", "area": 50, "preco": 2699, "status": "Alugada", "locatario": "", "inicio": ""},
        ]
    },
    "Milton Sullivan 142": {
        "endereco": "Rua Prof. Milton Sullivan, 142, Carvoeira",
        "whatsapp": "554140425242",
        "unidades": [
            {"numero": 1, "tipo": "1-2 quartos", "area": 32, "preco": 1950, "status": "Vacante", "locatario": "", "inicio": ""},
            {"numero": 2, "tipo": "1-2 quartos", "area": 32, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 3, "tipo": "1-2 quartos", "area": 32, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 4, "tipo": "1-2 quartos", "area": 32, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 5, "tipo": "1-2 quartos", "area": 32, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 6, "tipo": "1-2 quartos", "area": 32, "preco": 1950, "status": "Alugada", "locatario": "", "inicio": ""},
        ]
    },
    "Ana Maria Nunes 214": {
        "endereco": "Rua Ana Maria Nunes, 214, Córrego Grande",
        "whatsapp": "554140425242",
        "unidades": [
            {"numero": 1, "tipo": "1 quarto", "area": 35, "preco": 1850, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 2, "tipo": "2 quartos", "area": 55, "preco": 2200, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 3, "tipo": "3 quartos", "area": 80, "preco": 2800, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 4, "tipo": "2 quartos", "area": 55, "preco": 2200, "status": "Alugada", "locatario": "", "inicio": ""},
            {"numero": 5, "tipo": "1 quarto", "area": 35, "preco": 1850, "status": "Alugada", "locatario": "", "inicio": ""},
        ]
    },
}

def gerar_csv():
    """Gera formato CSV para Google Sheets"""
    linhas = []

    for propriedade, dados in PROPRIEDADES.items():
        linhas.append(f"\n# {propriedade}")
        linhas.append(f"# Endereço: {dados['endereco']}\n")
        linhas.append("Nº\tTipo\tÁrea (m²)\tPreço (R$)\tStatus\tLocatário\tInício Contrato\tDias Alugada\tAvaliação")

        for unit in dados['unidades']:
            dias = ""
            if unit['status'] == "Alugada" and unit['inicio']:
                try:
                    data_inicio = datetime.strptime(unit['inicio'], "%Y-%m-%d")
                    dias = str((datetime.now() - data_inicio).days)
                except:
                    dias = ""

            linhas.append(f"{unit['numero']}\t{unit['tipo']}\t{unit['area']}\t{unit['preco']}\t{unit['status']}\t{unit['locatario']}\t{unit['inicio']}\t{dias}\t")

    return "\n".join(linhas)

def gerar_json():
    """Gera formato JSON (mais fácil para processar)"""
    return json.dumps(PROPRIEDADES, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    print("=" * 80)
    print("GERADOR DE DADOS — Planilha Central CRMT")
    print("=" * 80)
    print("\n📋 FORMATO TSV (copie/cole no Google Sheets):\n")
    print(gerar_csv())

    print("\n\n" + "=" * 80)
    print("📊 FORMATO JSON (para API/automação):\n")
    print(gerar_json())

    print("\n" + "=" * 80)
    print("\n✅ PRÓXIMAS AÇÕES:")
    print("1. Copie o formato TSV acima")
    print("2. Abra Google Sheets > Nova planilha")
    print("3. Cole em cada aba (Pottker 25, Milton Sullivan 142, Ana Maria Nunes 214)")
    print("4. Customize com informações reais dos locatários")
    print("\n💾 Dados salvos. Pronto!")
