#!/usr/bin/env python3
"""
Otimizador de Mídia para Visão Computacional (CNNs)
Otimiza imagens para leitura automática de tribunais (YOLO, ResNet, etc.)

Uso:
  python otimizador_midia.py <diretorio_origem> [--saida <diretorio_saida>]

Exemplo:
  python otimizador_midia.py ./imagens_peticao --saida ./otimizadas
"""

import os
import json
import hashlib
from pathlib import Path
from typing import Dict, List
from datetime import datetime

try:
    from PIL import Image
    TEM_PIL = True
except ImportError:
    TEM_PIL = False
    print("Aviso: Pillow não instalado. Instale com: pip install Pillow")

try:
    import pytesseract
    TEM_TESSERACT = True
except ImportError:
    TEM_TESSERACT = False
    print("Aviso: pytesseract não instalado. Instale com: pip install pytesseract")
    print("Também requer binário Tesseract OCR: https://github.com/UB-Mannheim/tesseract/wiki")


class OtimizadorMidia:
    """Otimiza imagens para visão computacional (CNNs) com OCR, hash, e compressão"""

    DIMENSOES_IDEAIS = {
        'horizontal': (1200, 675),
        'vertical': (800, 1000)
    }
    DPI_MINIMO = 150
    TAMANHO_MAX_ARQUIVO = 500 * 1024  # 500KB

    def __init__(self, diretorio_origem: str, diretorio_saida: str = None):
        self.diretorio_origem = Path(diretorio_origem)
        self.diretorio_saida = Path(diretorio_saida) if diretorio_saida else self.diretorio_origem / 'otimizadas'
        self.diretorio_saida.mkdir(exist_ok=True)
        self.ativos_otimizados = []

    def otimizar_imagem(self, caminho_imagem: str) -> Dict:
        """
        Otimiza imagem para CNNs:
        1. Redimensiona para dimensões ideais
        2. Aplica OCR para extrair texto
        3. Calcula SHA-256 para autenticidade
        4. Comprime mantendo qualidade
        """
        if not TEM_PIL:
            print(f"✗ PIL não disponível. Pulando {caminho_imagem}")
            return None

        img = Image.open(caminho_imagem)
        tamanho_original = os.path.getsize(caminho_imagem)

        # Passo 1: Determinar orientação
        eh_horizontal = img.width > img.height
        tamanho_alvo = self.DIMENSOES_IDEAIS['horizontal'] if eh_horizontal \
                     else self.DIMENSOES_IDEAIS['vertical']

        # Passo 2: Redimensionar
        img_redimensionada = img.resize(tamanho_alvo, Image.Resampling.LANCZOS)

        # Passo 3: Aplicar OCR
        texto_ocr = ""
        if TEM_TESSERACT:
            try:
                texto_ocr = pytesseract.image_to_string(img_redimensionada, lang='por')
            except Exception as e:
                print(f"  ⚠️ OCR falhou para {Path(caminho_imagem).name}: {str(e)}")
                texto_ocr = "[OCR falhou]"
        else:
            texto_ocr = "[OCR não disponível]"

        # Passo 4: Calcular hash
        bytes_img = img_redimensionada.tobytes()
        hash_sha256 = hashlib.sha256(bytes_img).hexdigest()

        # Passo 5: Comprimir
        caminho_saida = self._obter_caminho_saida(caminho_imagem)
        img_redimensionada.save(caminho_saida, quality=85, optimize=True)

        tamanho_novo = os.path.getsize(caminho_saida)

        ativo = {
            'nomeArquivoOriginal': Path(caminho_imagem).name,
            'nomeArquivoOtimizado': Path(caminho_saida).name,
            'dimensoes': f"{tamanho_alvo[0]}x{tamanho_alvo[1]}",
            'tamanhoOrigemKb': round(tamanho_original / 1024, 2),
            'tamanhoOtimizadoKb': round(tamanho_novo / 1024, 2),
            'percentualCompressao': round((1 - tamanho_novo / tamanho_original) * 100, 1) if tamanho_original > 0 else 0,
            'textoOcr': texto_ocr.strip()[:200],  # Primeiros 200 caracteres
            'sha256': hash_sha256,
            'prontoParaCnn': tamanho_novo <= self.TAMANHO_MAX_ARQUIVO,
            'metadados': {
                'dataCaptura': self._extrair_data_exif(caminho_imagem),
                'localizacao': self._extrair_localizacao_exif(caminho_imagem),
                'hashAutenticidade': hash_sha256
            }
        }

        self.ativos_otimizados.append(ativo)
        return ativo

    def otimizar_lote(self, extensoes_imagem: List[str] = None) -> List[Dict]:
        """Otimiza todas as imagens em um diretório"""
        if extensoes_imagem is None:
            extensoes_imagem = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff']

        resultados = []
        for ext in extensoes_imagem:
            for caminho_imagem in self.diretorio_origem.glob(f'*{ext}'):
                try:
                    resultado = self.otimizar_imagem(str(caminho_imagem))
                    if resultado:
                        resultados.append(resultado)
                        print(f"✓ Otimizado: {caminho_imagem.name} → {resultado['dimensoes']}")
                except Exception as e:
                    print(f"✗ Erro ao otimizar {caminho_imagem.name}: {str(e)}")

        return resultados

    def gerar_metadados_json(self, arquivo_saida: str = 'metadados_midia.json') -> Dict:
        """Exporta metadados para incluir em petição"""
        metadados = {
            'totalAtivos': len(self.ativos_otimizados),
            'economiaCompressaoTotal': sum(
                a['tamanhoOrigemKb'] - a['tamanhoOtimizadoKb']
                for a in self.ativos_otimizados
            ),
            'todosProntosParaCnn': all(a['prontoParaCnn'] for a in self.ativos_otimizados),
            'ativos': self.ativos_otimizados
        }

        caminho_saida = self.diretorio_saida / arquivo_saida
        with open(caminho_saida, 'w', encoding='utf-8') as f:
            json.dump(metadados, f, indent=2, ensure_ascii=False)

        print(f"✓ Metadados exportados para {caminho_saida}")
        return metadados

    def gerar_galeria_html(self, arquivo_saida: str = 'galeria_midia.html') -> str:
        """Gera galeria HTML para inclusão em petição"""
        html = """<div class="galeria-midia">
    <h2>Mídias Otimizadas para Análise Automática (IA dos Tribunais)</h2>
"""

        for idx, ativo in enumerate(self.ativos_otimizados, 1):
            html += f"""
    <div class="card-midia" style="border: 1px solid #ccc; padding: 12px; margin-bottom: 16px;">
        <h3>ANEXO_{idx:02d}: {ativo['nomeArquivoOriginal']}</h3>
        <p><strong>Dimensões:</strong> {ativo['dimensoes']} |
           <strong>Tamanho:</strong> {ativo['tamanhoOtimizadoKb']}KB
           (comprimido {ativo['percentualCompressao']}%) |
           <strong>Pronto para CNN:</strong> {'✓ Sim' if ativo['prontoParaCnn'] else '✗ Não'}</p>
        <p><strong>Texto Extraído (OCR):</strong> {ativo['textoOcr']}</p>
        <p><strong>Verificação SHA-256:</strong> {ativo['sha256'][:16]}...</p>
        <p><a href="{ativo['nomeArquivoOtimizado']}" target="_blank">[Clique para ver imagem em tamanho real]</a></p>
    </div>
"""

        html += "\n</div>"

        caminho_saida = self.diretorio_saida / arquivo_saida
        with open(caminho_saida, 'w', encoding='utf-8') as f:
            f.write(html)

        print(f"✓ Galeria HTML exportada para {caminho_saida}")
        return html

    def _obter_caminho_saida(self, caminho_entrada: str) -> str:
        """Gera caminho de saída para imagem otimizada"""
        caminho = Path(caminho_entrada)
        return str(self.diretorio_saida / f"otimizado_{caminho.stem}.png")

    def _extrair_data_exif(self, caminho_imagem: str):
        """Extrai data EXIF (se disponível)"""
        if not TEM_PIL:
            return None
        try:
            img = Image.open(caminho_imagem)
            exif = img.getexif()
            return exif.get(36867, None)  # DateTimeOriginal
        except:
            return None

    def _extrair_localizacao_exif(self, caminho_imagem: str):
        """Extrai localização GPS EXIF (se disponível)"""
        if not TEM_PIL:
            return None
        try:
            img = Image.open(caminho_imagem)
            exif = img.getexif()
            return exif.get(34853, None)  # GPSInfo
        except:
            return None


def main():
    """Ponto de entrada principal"""
    import sys
    import argparse

    analisador = argparse.ArgumentParser(
        description='Otimizar arquivos de mídia para IA judicial (CNNs, OCR)'
    )
    analisador.add_argument('diretorio_origem', help='Diretório de origem com imagens')
    analisador.add_argument('--saida', default=None, help='Diretório de saída (padrão: diretorio_origem/otimizadas)')
    analisador.add_argument('--sem-ocr', action='store_true', help='Pular processamento OCR')

    args = analisador.parse_args()

    print(f"\n📷 OTIMIZAÇÃO DE MÍDIA PARA CNNs\n")
    print(f"Origem: {args.diretorio_origem}")
    print(f"Saída: {args.saida or args.diretorio_origem}/otimizadas\n")

    otimizador = OtimizadorMidia(args.diretorio_origem, args.saida)

    # Otimizar imagens
    resultados = otimizador.otimizar_lote()

    if not resultados:
        print("✗ Nenhuma imagem encontrada ou otimização falhou")
        sys.exit(1)

    # Gerar metadados
    metadados = otimizador.gerar_metadados_json('metadados_midia.json')

    # Gerar galeria HTML
    otimizador.gerar_galeria_html('galeria_midia.html')

    # Resumo
    print(f"\n✅ OTIMIZAÇÃO COMPLETA")
    print(f"   Total de ativos: {metadados['totalAtivos']}")
    print(f"   Economia de compressão total: {metadados['totalCompressionSavings']:.1f} KB")
    print(f"   Todos prontos para CNN: {metadados['todosProntosParaCnn']}\n")


if __name__ == '__main__':
    main()
