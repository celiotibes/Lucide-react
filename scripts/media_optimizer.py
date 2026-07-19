#!/usr/bin/env python3
"""
Media Optimizer for Computer Vision (CNNs)
Otimiza imagens para leitura automática de tribunais (YOLO, ResNet, etc.)

Usage:
  python media_optimizer.py <source_directory> [--output <output_dir>]

Example:
  python media_optimizer.py ./peticao_images --output ./optimized
"""

import os
import json
import hashlib
from pathlib import Path
from typing import Dict, List
from datetime import datetime

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("Warning: Pillow not installed. Install with: pip install Pillow")

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False
    print("Warning: pytesseract not installed. Install with: pip install pytesseract")
    print("Also requires Tesseract OCR binary: https://github.com/UB-Mannheim/tesseract/wiki")


class MediaOptimizer:
    """Otimiza imagens para visão computacional (CNNs) com OCR, hash, e compressão"""

    IDEAL_DIMENSIONS = {
        'horizontal': (1200, 675),
        'vertical': (800, 1000)
    }
    MIN_DPI = 150
    MAX_FILE_SIZE = 500 * 1024  # 500KB

    def __init__(self, source_dir: str, output_dir: str = None):
        self.source_dir = Path(source_dir)
        self.output_dir = Path(output_dir) if output_dir else self.source_dir / 'optimized'
        self.output_dir.mkdir(exist_ok=True)
        self.optimized_assets = []

    def optimize_image(self, image_path: str) -> Dict:
        """
        Otimiza imagem para CNNs:
        1. Redimensiona para dimensões ideais
        2. Aplica OCR para extrair texto
        3. Calcula SHA-256 para autenticidade
        4. Comprime mantendo qualidade
        """
        if not HAS_PIL:
            print(f"✗ PIL not available. Skipping {image_path}")
            return None

        img = Image.open(image_path)
        original_size = os.path.getsize(image_path)

        # Step 1: Determine orientation
        is_horizontal = img.width > img.height
        target_size = self.IDEAL_DIMENSIONS['horizontal'] if is_horizontal \
                     else self.IDEAL_DIMENSIONS['vertical']

        # Step 2: Resize
        img_resized = img.resize(target_size, Image.Resampling.LANCZOS)

        # Step 3: Apply OCR
        ocr_text = ""
        if HAS_TESSERACT:
            try:
                ocr_text = pytesseract.image_to_string(img_resized, lang='por')
            except Exception as e:
                print(f"  ⚠️ OCR failed for {Path(image_path).name}: {str(e)}")
                ocr_text = "[OCR failed]"
        else:
            ocr_text = "[OCR not available]"

        # Step 4: Calculate hash
        img_bytes = img_resized.tobytes()
        sha256_hash = hashlib.sha256(img_bytes).hexdigest()

        # Step 5: Compress
        output_path = self._get_output_path(image_path)
        img_resized.save(output_path, quality=85, optimize=True)

        new_size = os.path.getsize(output_path)

        asset = {
            'original_filename': Path(image_path).name,
            'optimized_filename': Path(output_path).name,
            'dimensions': f"{target_size[0]}x{target_size[1]}",
            'original_size_kb': round(original_size / 1024, 2),
            'optimized_size_kb': round(new_size / 1024, 2),
            'compression_ratio': round((1 - new_size / original_size) * 100, 1) if original_size > 0 else 0,
            'ocr_text': ocr_text.strip()[:200],  # First 200 chars
            'sha256': sha256_hash,
            'ready_for_cnn': new_size <= self.MAX_FILE_SIZE,
            'metadata': {
                'capturedDate': self._extract_exif_date(image_path),
                'location': self._extract_exif_location(image_path),
                'authenticityHash': sha256_hash
            }
        }

        self.optimized_assets.append(asset)
        return asset

    def batch_optimize(self, image_extensions: List[str] = None) -> List[Dict]:
        """Otimiza todas as imagens em um diretório"""
        if image_extensions is None:
            image_extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff']

        results = []
        for ext in image_extensions:
            for image_path in self.source_dir.glob(f'*{ext}'):
                try:
                    result = self.optimize_image(str(image_path))
                    if result:
                        results.append(result)
                        print(f"✓ Optimized: {image_path.name} → {result['dimensions']}")
                except Exception as e:
                    print(f"✗ Error optimizing {image_path.name}: {str(e)}")

        return results

    def generate_metadata_json(self, output_file: str = 'media_metadata.json') -> Dict:
        """Exporta metadata para incluir em petição"""
        metadata = {
            'totalAssets': len(self.optimized_assets),
            'totalCompressionSavings': sum(
                a['original_size_kb'] - a['optimized_size_kb']
                for a in self.optimized_assets
            ),
            'allReadyForCnn': all(a['ready_for_cnn'] for a in self.optimized_assets),
            'assets': self.optimized_assets
        }

        output_path = self.output_dir / output_file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        print(f"✓ Metadata exported to {output_path}")
        return metadata

    def generate_html_gallery(self, output_file: str = 'media_gallery.html') -> str:
        """Gera galeria HTML para inclusão em petição"""
        html = """<div class="media-gallery">
    <h2>Mídias Otimizadas para Análise Automática (IA dos Tribunais)</h2>
"""

        for idx, asset in enumerate(self.optimized_assets, 1):
            html += f"""
    <div class="media-card" style="border: 1px solid #ccc; padding: 12px; margin-bottom: 16px;">
        <h3>ANEXO_{idx:02d}: {asset['original_filename']}</h3>
        <p><strong>Dimensões:</strong> {asset['dimensions']} |
           <strong>Tamanho:</strong> {asset['optimized_size_kb']}KB
           (comprimido {asset['compression_ratio']}%) |
           <strong>Pronto para CNN:</strong> {'✓ Sim' if asset['ready_for_cnn'] else '✗ Não'}</p>
        <p><strong>Texto Extraído (OCR):</strong> {asset['ocr_text']}</p>
        <p><strong>Verificação SHA-256:</strong> {asset['sha256'][:16]}...</p>
        <p><a href="{asset['optimized_filename']}" target="_blank">[Clique para ver imagem full]</a></p>
    </div>
"""

        html += "\n</div>"

        output_path = self.output_dir / output_file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)

        print(f"✓ HTML gallery exported to {output_path}")
        return html

    def _get_output_path(self, input_path: str) -> str:
        """Gera caminho de saída para imagem otimizada"""
        path = Path(input_path)
        return str(self.output_dir / f"optimized_{path.stem}.png")

    def _extract_exif_date(self, image_path: str):
        """Extrai data EXIF (se disponível)"""
        if not HAS_PIL:
            return None
        try:
            img = Image.open(image_path)
            exif = img.getexif()
            return exif.get(36867, None)  # DateTimeOriginal
        except:
            return None

    def _extract_exif_location(self, image_path: str):
        """Extrai localização GPS EXIF (se disponível)"""
        if not HAS_PIL:
            return None
        try:
            img = Image.open(image_path)
            exif = img.getexif()
            return exif.get(34853, None)  # GPSInfo
        except:
            return None


def main():
    """Main entry point"""
    import sys
    import argparse

    parser = argparse.ArgumentParser(
        description='Optimize media files for judicial AI (CNNs, OCR)'
    )
    parser.add_argument('source_dir', help='Source directory with images')
    parser.add_argument('--output', default=None, help='Output directory (default: source_dir/optimized)')
    parser.add_argument('--no-ocr', action='store_true', help='Skip OCR processing')

    args = parser.parse_args()

    print(f"\n📷 MEDIA OPTIMIZATION FOR CNNs\n")
    print(f"Source: {args.source_dir}")
    print(f"Output: {args.output or args.source_dir}/optimized\n")

    optimizer = MediaOptimizer(args.source_dir, args.output)

    # Optimize images
    results = optimizer.batch_optimize()

    if not results:
        print("✗ No images found or optimization failed")
        sys.exit(1)

    # Generate metadata
    metadata = optimizer.generate_metadata_json('media_metadata.json')

    # Generate HTML gallery
    optimizer.generate_html_gallery('media_gallery.html')

    # Summary
    print(f"\n✅ OPTIMIZATION COMPLETE")
    print(f"   Total assets: {metadata['totalAssets']}")
    print(f"   Total compression savings: {metadata['totalCompressionSavings']:.1f} KB")
    print(f"   All ready for CNN: {metadata['allReadyForCnn']}\n")


if __name__ == '__main__':
    main()
