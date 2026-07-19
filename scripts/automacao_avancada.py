#!/usr/bin/env python3
"""
Automação Avançada de Anexos
Sincronização Google Drive, indexação semântica, compartilhamento restrito a domínios

Uso:
  python automacao_avancada.py <diretorio_origem> [--tribunal TJPR] [--upload]

Exemplo:
  python automacao_avancada.py ./ativos_peticao --tribunal TJPR --upload
"""

import os
import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    TEM_GOOGLE_API = True
except ImportError:
    TEM_GOOGLE_API = False
    print("Aviso: Cliente Google API não instalado.")
    print("Instale com: pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client")


# Mapeamento tribunal para domínio de e-mail
DOMINIOS_TRIBUNAL = {
    'TJPR': 'tjpr.jus.br',
    'TJSC': 'tjsc.jus.br',
    'TJMT': 'tjmt.jus.br',
    'TJRO': 'tjro.jus.br',
    'TRF4': 'trf4.jus.br',
    'JFPR': 'jfpr.jus.br',
    'CNJ': 'cnj.jus.br'
}


class AutomacaoAvancadaAnexos:
    """
    Automação completa:
    1. Varrer pastas locais
    2. Estruturar metadados JSON
    3. Sincronizar com Google Drive
    4. Gerar permissões compartilhadas
    5. Exportar índice semântico para IA
    """

    ESCOPOS = ['https://www.googleapis.com/auth/drive']

    def __init__(self, diretorio_origem: str, tribunal: str = 'TJPR', arquivo_credenciais: str = 'credentials.json'):
        self.diretorio_origem = Path(diretorio_origem)
        self.tribunal = tribunal
        self.dominio_tribunal = DOMINIOS_TRIBUNAL.get(tribunal, f'{tribunal.lower()}.jus.br')
        self.arquivo_credenciais = arquivo_credenciais
        self.servico = None
        self.registro_metadados = []

        if TEM_GOOGLE_API:
            self._autenticar()

    def varrer_e_registrar(self) -> List[Dict]:
        """Varre pasta local e registra metadados"""
        if not self.diretorio_origem.exists():
            print(f"✗ Diretório não encontrado: {self.diretorio_origem}")
            return []

        anexos = []

        for idx, caminho_arquivo in enumerate(sorted(self.diretorio_origem.iterdir()), 1):
            if caminho_arquivo.is_file():
                hash_arquivo = self._calcular_sha256(caminho_arquivo)

                anexo = {
                    'numeroAnexo': f'ANEXO_{idx:02d}',
                    'nomeArquivo': caminho_arquivo.name,
                    'caminhoArquivo': str(caminho_arquivo),
                    'tamanhoArquivo': caminho_arquivo.stat().st_size,
                    'tipoArquivo': caminho_arquivo.suffix.lower(),
                    'sha256': hash_arquivo,
                    'registradoEm': datetime.now().isoformat(),
                    'idGoogleDrive': None,
                    'linkGoogleDrive': None,
                    'permissaoCompartilhamento': {
                        'papel': 'leitor',
                        'tipo': 'dominio',
                        'dominio': self.dominio_tribunal
                    },
                    'metadadosSemanticos': {
                        'tipo': self._inferir_tipo(caminho_arquivo),
                        'relevancia': 'alta',
                        'fatosCorespondentes': []
                    }
                }

                anexos.append(anexo)
                self.registro_metadados.append(anexo)
                print(f"✓ Registrado: {anexo['numeroAnexo']} - {caminho_arquivo.name}")

        return anexos

    def sincronizar_google_drive(self, nome_pasta: str = 'Lucide-Petições') -> List[Dict]:
        """Sincroniza com Google Drive e gera permissões"""
        if not self.servico:
            print("✗ Google Drive não autenticado. Pulando sincronização.")
            return self.registro_metadados

        id_pasta = self._encontrar_ou_criar_pasta(nome_pasta)
        print(f"✓ Usando pasta Google Drive: {id_pasta}")

        for anexo in self.registro_metadados:
            if not anexo['idGoogleDrive']:  # Pular se já enviado
                try:
                    caminho_arquivo = anexo['caminhoArquivo']

                    if not os.path.exists(caminho_arquivo):
                        print(f"✗ Arquivo não encontrado: {caminho_arquivo}")
                        continue

                    id_arquivo = self._enviar_arquivo(caminho_arquivo, anexo['nomeArquivo'], id_pasta)
                    anexo['idGoogleDrive'] = id_arquivo
                    anexo['linkGoogleDrive'] = f"https://drive.google.com/file/d/{id_arquivo}/view?usp=sharing"

                    # Definir permissões de compartilhamento
                    self._definir_compartilhamento_dominio(id_arquivo, anexo['permissaoCompartilhamento'])

                    print(f"✓ Sincronizado e compartilhado: {anexo['numeroAnexo']}")
                except Exception as e:
                    print(f"✗ Erro ao sincronizar {anexo['nomeArquivo']}: {str(e)}")

        return self.registro_metadados

    def exportar_indice_semantico(self, arquivo_saida: str = 'indice_semantico.json', numero_processo: str = 'A_PREENCHER') -> Dict:
        """
        Exporta índice semântico para IA do tribunal
        Formato: Compatível com Legal-BERT-PT, TF-IDF, embeddings
        """
        indice_semantico = {
            'metadadosCaso': {
                'numeroProcesso': numero_processo,
                'tribunal': self.tribunal,
                'exportadoEm': datetime.now().isoformat()
            },
            'indiceAnexos': [],
            'referenciascruzadas': {},
            'etiquetasSemanticas': []
        }

        for anexo in self.registro_metadados:
            entrada_indice = {
                'idAnexo': anexo['numeroAnexo'],
                'nomeArquivo': anexo['nomeArquivo'],
                'tipo': anexo['metadadosSemanticos']['tipo'],
                'hash': anexo['sha256'],
                'link': anexo['linkGoogleDrive'],
                'protocoloCompartilhamento': 'dominio_restrito',
                'acessivelPor': [self.dominio_tribunal, 'cnj.jus.br'],
                'conteudoExtraido': {
                    'textoCompleto': None,  # Será preenchido por OCR/processo manual
                    'entidades': [],  # Entidades nomeadas para indexação
                    'palavraschave': []  # Palavras-chave TF-IDF
                }
            }

            indice_semantico['indiceAnexos'].append(entrada_indice)

        with open(arquivo_saida, 'w', encoding='utf-8') as f:
            json.dump(indice_semantico, f, indent=2, ensure_ascii=False)

        print(f"✓ Índice semântico exportado: {arquivo_saida}")
        return indice_semantico

    def exportar_markdown_peticao(self, arquivo_saida: str = 'INDICE_ANEXOS.md') -> str:
        """
        Exporta índice em Markdown para colar na petição
        Inclui: Links, hashes, descrições, jurisprudência
        """
        markdown = """# ÍNDICE SEMÂNTICO DE ANEXOS
## Compatível com sistemas de leitura automática (IA dos Tribunais)

"""

        for anexo in self.registro_metadados:
            markdown += f"""### {anexo['numeroAnexo']}: {anexo['nomeArquivo']}

| Campo | Valor |
|-------|-------|
| Tipo | {anexo['metadadosSemanticos']['tipo']} |
| Tamanho | {anexo['tamanhoArquivo'] / 1024:.1f} KB |
| SHA-256 | `{anexo['sha256']}` |
| Acesso | [🔗 Clique aqui]({anexo['linkGoogleDrive']}) |
| Protocolo | Compartilhado com {anexo['permissaoCompartilhamento']['dominio']} |

"""

        with open(arquivo_saida, 'w', encoding='utf-8') as f:
            f.write(markdown)

        print(f"✓ Markdown para petição exportado: {arquivo_saida}")
        return markdown

    def _calcular_sha256(self, caminho_arquivo: Path) -> str:
        """Calcula SHA-256"""
        sha256 = hashlib.sha256()
        with open(caminho_arquivo, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _inferir_tipo(self, caminho_arquivo: Path) -> str:
        """Infere tipo de arquivo"""
        extensao_para_tipo = {
            '.pdf': 'documento_estruturado',
            '.doc': 'documento_estruturado',
            '.docx': 'documento_estruturado',
            '.xls': 'dados_matematicos',
            '.xlsx': 'dados_matematicos',
            '.csv': 'dados_matematicos',
            '.json': 'dados_matematicos',
            '.png': 'midia_imagem',
            '.jpg': 'midia_imagem',
            '.jpeg': 'midia_imagem',
            '.gif': 'midia_imagem',
            '.mp3': 'midia_audio',
            '.wav': 'midia_audio',
            '.m4a': 'midia_audio',
            '.mp4': 'midia_video',
            '.mov': 'midia_video',
            '.avi': 'midia_video',
        }
        return extensao_para_tipo.get(caminho_arquivo.suffix.lower(), 'desconhecido')

    def _autenticar(self):
        """Autentica com Google Drive"""
        if not TEM_GOOGLE_API:
            return

        credenciais = None

        # Verificar token em cache
        if os.path.exists('token.json'):
            credenciais = Credentials.from_authorized_user_file('token.json', self.ESCOPOS)

        # Se não há credenciais válidas, solicitar autorização do usuário
        if not credenciais or not credenciais.valid:
            if credenciais and credenciais.expired and credenciais.refresh_token:
                credenciais.refresh(Request())
            else:
                if not os.path.exists(self.arquivo_credenciais):
                    print(f"⚠️ {self.arquivo_credenciais} não encontrado - autenticação Google Drive pulada")
                    return
                fluxo = InstalledAppFlow.from_client_secrets_file(
                    self.arquivo_credenciais, self.ESCOPOS)
                credenciais = fluxo.run_local_server(port=0)

            # Salvar credenciais para uso futuro
            with open('token.json', 'w') as arquivo_token:
                arquivo_token.write(credenciais.to_json())

        self.servico = build('drive', 'v3', credentials=credenciais)
        print("✓ Autenticado com Google Drive")

    def _encontrar_ou_criar_pasta(self, nome_pasta: str) -> str:
        """Encontra ou cria pasta no Drive"""
        if not self.servico:
            return 'id_pasta_marcador'

        resultados = self.servico.files().list(
            q=f"name='{nome_pasta}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            spaces='drive',
            pageSize=1,
            fields='files(id, name)'
        ).execute()

        arquivos = resultados.get('files', [])

        if arquivos:
            return arquivos[0]['id']

        # Criar nova pasta
        metadados_arquivo = {
            'name': nome_pasta,
            'mimeType': 'application/vnd.google-apps.folder'
        }

        pasta = self.servico.files().create(body=metadados_arquivo, fields='id').execute()
        return pasta.get('id')

    def _enviar_arquivo(self, caminho_arquivo: str, nome_arquivo: str, id_pasta: str) -> str:
        """Upload para Drive"""
        if not self.servico:
            return 'id_arquivo_marcador'

        # Determinar mimetype
        tipo_mime = 'application/octet-stream'
        if nome_arquivo.endswith('.pdf'):
            tipo_mime = 'application/pdf'
        elif nome_arquivo.endswith(('.jpg', '.jpeg')):
            tipo_mime = 'image/jpeg'
        elif nome_arquivo.endswith('.png'):
            tipo_mime = 'image/png'

        media = MediaFileUpload(caminho_arquivo, mimetype=tipo_mime)

        metadados_arquivo = {
            'name': nome_arquivo,
            'parents': [id_pasta]
        }

        arquivo = self.servico.files().create(
            body=metadados_arquivo,
            media_body=media,
            fields='id'
        ).execute()

        return arquivo.get('id')

    def _definir_compartilhamento_dominio(self, id_arquivo: str, permissoes: Dict):
        """Define permissões de compartilhamento"""
        if not self.servico:
            return

        try:
            self.servico.permissions().create(
                fileId=id_arquivo,
                body={
                    'type': permissoes['tipo'],
                    'role': permissoes['papel'],
                    'domain': permissoes['dominio']
                }
            ).execute()
        except Exception as e:
            print(f"⚠️ Erro ao definir permissões de compartilhamento: {str(e)}")


def main():
    """Ponto de entrada principal"""
    import sys
    import argparse

    analisador = argparse.ArgumentParser(
        description='Automação avançada de anexos com sincronização Google Drive'
    )
    analisador.add_argument('diretorio_origem', help='Diretório de origem com anexos')
    analisador.add_argument('--tribunal', default='TJPR',
                           choices=list(DOMINIOS_TRIBUNAL.keys()),
                           help='Tribunal de destino (padrão: TJPR)')
    analisador.add_argument('--upload', action='store_true',
                           help='Enviar para Google Drive')
    analisador.add_argument('--processo', default='A_PREENCHER',
                           help='Número do processo')

    args = analisador.parse_args()

    print(f"\n📋 AUTOMAÇÃO AVANÇADA DE ANEXOS\n")
    print(f"Origem: {args.diretorio_origem}")
    print(f"Tribunal: {args.tribunal}")
    print(f"Upload: {'Sim' if args.upload else 'Não'}\n")

    # Inicializar automação
    automacao = AutomacaoAvancadaAnexos(args.diretorio_origem, args.tribunal)

    # Passo 1: Varrer e registrar
    anexos = automacao.varrer_e_registrar()

    if not anexos:
        print("✗ Nenhum arquivo encontrado")
        sys.exit(1)

    # Passo 2: Enviar para Google Drive (se solicitado)
    if args.upload:
        print(f"\n☁️ ENVIANDO PARA GOOGLE DRIVE...\n")
        anexos = automacao.sincronizar_google_drive()

    # Passo 3: Exportar índice semântico
    print(f"\n🧠 GERANDO ÍNDICE SEMÂNTICO...\n")
    indice_semantico = automacao.exportar_indice_semantico('indice_semantico.json', args.processo)

    # Passo 4: Exportar markdown
    print(f"\n📄 GERANDO MARKDOWN DE PETIÇÃO...\n")
    markdown = automacao.exportar_markdown_peticao('INDICE_ANEXOS.md')

    print(f"\n✅ AUTOMAÇÃO COMPLETA\n")
    print(f"   Arquivos registrados: {len(anexos)}")
    print(f"   Índice semântico: indice_semantico.json")
    print(f"   Markdown de petição: INDICE_ANEXOS.md\n")


if __name__ == '__main__':
    main()
