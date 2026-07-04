#!/usr/bin/env python3
"""
Advanced Annex Automation
Google Drive sync, semantic indexing, tribunal domain-restricted sharing

Usage:
  python advanced_automation.py <source_directory> [--tribunal TJPR] [--upload]

Example:
  python advanced_automation.py ./peticao_assets --tribunal TJPR --upload
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
    HAS_GOOGLE_API = True
except ImportError:
    HAS_GOOGLE_API = False
    print("Warning: Google API client not installed.")
    print("Install with: pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client")


# Mapping tribunal to domain email
TRIBUNAL_DOMAINS = {
    'TJPR': 'tjpr.jus.br',
    'TJSC': 'tjsc.jus.br',
    'TJMT': 'tjmt.jus.br',
    'TJRO': 'tjro.jus.br',
    'TRF4': 'trf4.jus.br',
    'JFPR': 'jfpr.jus.br',
    'CNJ': 'cnj.jus.br'
}


class AdvancedAnnexAutomation:
    """
    Automação avançada:
    1. Varrer pastas locais
    2. Estruturar metadata JSON
    3. Sincronizar com Google Drive
    4. Gerar permissões compartilhadas por domínio
    5. Exportar índice semântico para IA
    """

    SCOPES = ['https://www.googleapis.com/auth/drive']

    def __init__(self, source_dir: str, tribunal: str = 'TJPR', credentials_file: str = 'credentials.json'):
        self.source_dir = Path(source_dir)
        self.tribunal = tribunal
        self.tribunal_domain = TRIBUNAL_DOMAINS.get(tribunal, f'{tribunal.lower()}.jus.br')
        self.credentials_file = credentials_file
        self.service = None
        self.metadata_registry = []

        if HAS_GOOGLE_API:
            self._authenticate()

    def scan_and_register(self) -> List[Dict]:
        """Varre pasta local e registra metadata"""
        if not self.source_dir.exists():
            print(f"✗ Directory not found: {self.source_dir}")
            return []

        annexes = []

        for idx, file_path in enumerate(sorted(self.source_dir.iterdir()), 1):
            if file_path.is_file():
                file_hash = self._calculate_sha256(file_path)

                annex = {
                    'annexNumber': f'ANEXO_{idx:02d}',
                    'filename': file_path.name,
                    'filepath': str(file_path),
                    'fileSize': file_path.stat().st_size,
                    'fileType': file_path.suffix.lower(),
                    'sha256': file_hash,
                    'registeredAt': datetime.now().isoformat(),
                    'googleDriveId': None,
                    'googleDriveLink': None,
                    'sharingPermissions': {
                        'role': 'reader',
                        'type': 'domain',
                        'domain': self.tribunal_domain
                    },
                    'semanticMetadata': {
                        'type': self._infer_type(file_path),
                        'relevance': 'high',
                        'correspondentFacts': []
                    }
                }

                annexes.append(annex)
                self.metadata_registry.append(annex)
                print(f"✓ Registered: {annex['annexNumber']} - {file_path.name}")

        return annexes

    def sync_with_google_drive(self, folder_name: str = 'Lucide-Petições') -> List[Dict]:
        """Sincroniza com Google Drive e gera permissões"""
        if not self.service:
            print("✗ Google Drive not authenticated. Skipping sync.")
            return self.metadata_registry

        folder_id = self._find_or_create_folder(folder_name)
        print(f"✓ Using Google Drive folder: {folder_id}")

        for annex in self.metadata_registry:
            if not annex['googleDriveId']:  # Skip if already uploaded
                try:
                    file_path = annex['filepath']

                    if not os.path.exists(file_path):
                        print(f"✗ File not found: {file_path}")
                        continue

                    file_id = self._upload_file(file_path, annex['filename'], folder_id)
                    annex['googleDriveId'] = file_id
                    annex['googleDriveLink'] = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"

                    # Set sharing permissions
                    self._set_domain_sharing(file_id, annex['sharingPermissions'])

                    print(f"✓ Synced & shared: {annex['annexNumber']}")
                except Exception as e:
                    print(f"✗ Error syncing {annex['filename']}: {str(e)}")

        return self.metadata_registry

    def export_semantic_index(self, output_file: str = 'semantic_index.json', processo_number: str = 'TO_BE_FILLED') -> Dict:
        """
        Exporta índice semântico para IA do tribunal
        Formato: Compatível com Legal-BERT-PT, TF-IDF, embeddings
        """
        semantic_index = {
            'caseMetadata': {
                'processoNumber': processo_number,
                'tribunal': self.tribunal,
                'exportedAt': datetime.now().isoformat()
            },
            'annexesIndex': [],
            'crossReferences': {},
            'semanticTags': []
        }

        for annex in self.metadata_registry:
            index_entry = {
                'annexId': annex['annexNumber'],
                'filename': annex['filename'],
                'type': annex['semanticMetadata']['type'],
                'hash': annex['sha256'],
                'link': annex['googleDriveLink'],
                'sharingProtocol': 'domain_restricted',
                'accessibleBy': [self.tribunal_domain, 'cnj.jus.br'],
                'extractedContent': {
                    'fulltext': None,  # Will be filled by OCR/manual process
                    'entities': [],  # Named entities for indexing
                    'keywords': []  # TF-IDF keywords
                }
            }

            semantic_index['annexesIndex'].append(index_entry)

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(semantic_index, f, indent=2, ensure_ascii=False)

        print(f"✓ Semantic index exported: {output_file}")
        return semantic_index

    def export_markdown_for_petition(self, output_file: str = 'ANEXOS_INDEX.md') -> str:
        """
        Exporta índice em Markdown para colar na petição
        Inclui: Links, hashes, descrições, jurisprudência
        """
        markdown = """# ÍNDICE SEMÂNTICO DE ANEXOS
## Compatível com sistemas de leitura automática (IA dos Tribunais)

"""

        for annex in self.metadata_registry:
            markdown += f"""### {annex['annexNumber']}: {annex['filename']}

| Campo | Valor |
|-------|-------|
| Tipo | {annex['semanticMetadata']['type']} |
| Tamanho | {annex['fileSize'] / 1024:.1f} KB |
| SHA-256 | `{annex['sha256']}` |
| Acesso | [🔗 Clique aqui]({annex['googleDriveLink']}) |
| Protocolo | Compartilhado com {annex['sharingPermissions']['domain']} |

"""

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(markdown)

        print(f"✓ Petition markdown exported: {output_file}")
        return markdown

    def _calculate_sha256(self, filepath: Path) -> str:
        """Calcula SHA-256"""
        sha256 = hashlib.sha256()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _infer_type(self, filepath: Path) -> str:
        """Infere tipo de arquivo"""
        ext_to_type = {
            '.pdf': 'document_structured',
            '.doc': 'document_structured',
            '.docx': 'document_structured',
            '.xls': 'data_mathematical',
            '.xlsx': 'data_mathematical',
            '.csv': 'data_mathematical',
            '.json': 'data_mathematical',
            '.png': 'media_image',
            '.jpg': 'media_image',
            '.jpeg': 'media_image',
            '.gif': 'media_image',
            '.mp3': 'media_audio',
            '.wav': 'media_audio',
            '.m4a': 'media_audio',
            '.mp4': 'media_video',
            '.mov': 'media_video',
            '.avi': 'media_video',
        }
        return ext_to_type.get(filepath.suffix.lower(), 'unknown')

    def _authenticate(self):
        """Autentica com Google Drive"""
        if not HAS_GOOGLE_API:
            return

        creds = None

        # Check for cached token
        if os.path.exists('token.json'):
            creds = Credentials.from_authorized_user_file('token.json', self.SCOPES)

        # If no valid credentials, request user authorization
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(self.credentials_file):
                    print(f"⚠️ {self.credentials_file} not found - Google Drive auth skipped")
                    return
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_file, self.SCOPES)
                creds = flow.run_local_server(port=0)

            # Save credentials for future use
            with open('token.json', 'w') as token:
                token.write(creds.to_json())

        self.service = build('drive', 'v3', credentials=creds)
        print("✓ Authenticated with Google Drive")

    def _find_or_create_folder(self, folder_name: str) -> str:
        """Encontra ou cria pasta no Drive"""
        if not self.service:
            return 'placeholder_folder_id'

        results = self.service.files().list(
            q=f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            spaces='drive',
            pageSize=1,
            fields='files(id, name)'
        ).execute()

        files = results.get('files', [])

        if files:
            return files[0]['id']

        # Create new folder
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }

        folder = self.service.files().create(body=file_metadata, fields='id').execute()
        return folder.get('id')

    def _upload_file(self, filepath: str, filename: str, folder_id: str) -> str:
        """Upload para Drive"""
        if not self.service:
            return 'placeholder_file_id'

        # Determine mimetype
        mime_type = 'application/octet-stream'
        if filename.endswith('.pdf'):
            mime_type = 'application/pdf'
        elif filename.endswith(('.jpg', '.jpeg')):
            mime_type = 'image/jpeg'
        elif filename.endswith('.png'):
            mime_type = 'image/png'

        media = MediaFileUpload(filepath, mimetype=mime_type)

        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }

        file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()

        return file.get('id')

    def _set_domain_sharing(self, file_id: str, permissions: Dict):
        """Define permissões de compartilhamento"""
        if not self.service:
            return

        try:
            self.service.permissions().create(
                fileId=file_id,
                body={
                    'type': permissions['type'],
                    'role': permissions['role'],
                    'domain': permissions['domain']
                }
            ).execute()
        except Exception as e:
            print(f"⚠️ Error setting sharing permissions: {str(e)}")


def main():
    """Main entry point"""
    import sys
    import argparse

    parser = argparse.ArgumentParser(
        description='Advanced annex automation with Google Drive sync'
    )
    parser.add_argument('source_dir', help='Source directory with annexes')
    parser.add_argument('--tribunal', default='TJPR',
                       choices=list(TRIBUNAL_DOMAINS.keys()),
                       help='Target tribunal (default: TJPR)')
    parser.add_argument('--upload', action='store_true',
                       help='Upload to Google Drive')
    parser.add_argument('--processo', default='TO_BE_FILLED',
                       help='Processo number')

    args = parser.parse_args()

    print(f"\n📋 ADVANCED ANNEX AUTOMATION\n")
    print(f"Source: {args.source_dir}")
    print(f"Tribunal: {args.tribunal}")
    print(f"Upload: {'Yes' if args.upload else 'No'}\n")

    # Initialize automation
    automation = AdvancedAnnexAutomation(args.source_dir, args.tribunal)

    # Step 1: Scan and register
    annexes = automation.scan_and_register()

    if not annexes:
        print("✗ No files found")
        sys.exit(1)

    # Step 2: Upload to Google Drive (if requested)
    if args.upload:
        print(f"\n☁️ UPLOADING TO GOOGLE DRIVE...\n")
        annexes = automation.sync_with_google_drive()

    # Step 3: Export semantic index
    print(f"\n🧠 GENERATING SEMANTIC INDEX...\n")
    semantic_index = automation.export_semantic_index('semantic_index.json', args.processo)

    # Step 4: Export markdown
    print(f"\n📄 GENERATING PETITION MARKDOWN...\n")
    markdown = automation.export_markdown_for_petition('ANEXOS_INDEX.md')

    print(f"\n✅ AUTOMATION COMPLETE\n")
    print(f"   Files registered: {len(annexes)}")
    print(f"   Semantic index: semantic_index.json")
    print(f"   Petition markdown: ANEXOS_INDEX.md\n")


if __name__ == '__main__':
    main()
