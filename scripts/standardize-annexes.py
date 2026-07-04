#!/usr/bin/env python3
"""
Legal Annexes Standardization Script
Integrates with Google Drive API for petitions in Lucide-react

Usage:
  python standardize-annexes.py <source_directory> [--upload]

Example:
  python standardize-annexes.py ./peticao_assets --upload
"""

import os
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime

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


class AnnexStandardizer:
    """Standardize legal annexes and generate links for judicial documents."""

    SCOPES = ['https://www.googleapis.com/auth/drive']

    def __init__(self, credentials_file: str = 'credentials.json'):
        self.credentials_file = credentials_file
        self.service = None
        if HAS_GOOGLE_API:
            self.authenticate()

    def authenticate(self):
        """Authenticate with Google Drive API"""
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
                    print(f"Error: {self.credentials_file} not found")
                    return
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_file, self.SCOPES)
                creds = flow.run_local_server(port=0)

            # Save credentials for future use
            with open('token.json', 'w') as token:
                token.write(creds.to_json())

        self.service = build('drive', 'v3', credentials=creds)
        print("✓ Authenticated with Google Drive")

    def standardize_local_files(
        self, source_dir: str, output_json: str = 'annexes.json'
    ) -> Dict[str, Any]:
        """
        Standardize files in local directory and generate metadata.
        Pattern: ANEXO_01_OriginalFileName.pdf
        """
        annexes = []
        source_path = Path(source_dir)

        if not source_path.exists():
            print(f"✗ Directory not found: {source_dir}")
            return {'status': 'error', 'annexes': []}

        # Sort files alphabetically for consistent numbering
        files = sorted([f for f in source_path.iterdir() if f.is_file()])

        for idx, file_path in enumerate(files, start=1):
            original_name = file_path.name
            extension = file_path.suffix

            # Generate standardized name
            sanitized_name = original_name.replace(' ', '_').replace('-', '_')
            standardized_name = f"ANEXO_{idx:02d}_{sanitized_name}"
            new_file_path = source_path / standardized_name

            # Rename file
            if file_path != new_file_path:
                file_path.rename(new_file_path)

            # Calculate SHA-256 hash
            file_hash = self._calculate_sha256(new_file_path)

            # Build annex metadata
            annex_data = {
                'annexNumber': f'ANEXO_{idx:02d}',
                'originalName': original_name,
                'standardizedName': standardized_name,
                'filePath': str(new_file_path),
                'fileSize': new_file_path.stat().st_size,
                'fileType': extension.lower(),
                'sha256Hash': file_hash,
                'processedAt': datetime.now().isoformat(),
                'googleDriveLink': None,
                'eprocessEventLink': None,
            }

            annexes.append(annex_data)
            print(f"✓ Standardized: {original_name} → {standardized_name}")

        # Save metadata to JSON
        output = {
            'status': 'success',
            'processingTime': datetime.now().isoformat(),
            'totalAnnexes': len(annexes),
            'annexes': annexes,
        }

        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        print(f"\n✓ Saved metadata to {output_json}")
        return output

    def upload_to_google_drive(
        self, annexes_json: str, folder_name: str = 'Lucide-Petições'
    ) -> Dict[str, Any]:
        """Upload standardized annexes to Google Drive and generate shareable links."""
        if not self.service:
            print("✗ Not authenticated with Google Drive. Skipping upload.")
            # Load and return existing data
            with open(annexes_json, 'r', encoding='utf-8') as f:
                return json.load(f)

        # Load annex metadata
        with open(annexes_json, 'r', encoding='utf-8') as f:
            data = json.load(f)

        annexes = data['annexes']

        # Create or find folder in Google Drive
        folder_id = self._find_or_create_folder(folder_name)
        print(f"✓ Using Google Drive folder: {folder_id}")

        # Upload each file
        for annex in annexes:
            file_path = annex['filePath']
            standardized_name = annex['standardizedName']

            if not os.path.exists(file_path):
                print(f"✗ File not found: {file_path}")
                continue

            # Upload
            file_id = self._upload_file(file_path, standardized_name, folder_id)

            if file_id:
                # Generate shareable link
                share_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
                annex['googleDriveLink'] = share_link
                print(f"✓ Uploaded & linked: {standardized_name}")

        # Save updated metadata
        data['uploadStatus'] = 'completed'
        data['googleDriveFolderId'] = folder_id

        with open(annexes_json, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        return data

    def generate_matrix_html(self, annexes_json: str) -> str:
        """Generate HTML table for Proof Correlation Matrix."""
        with open(annexes_json, 'r', encoding='utf-8') as f:
            data = json.load(f)

        annexes = data['annexes']

        html = """<table>
    <thead>
        <tr>
            <th>Fato Alegado</th>
            <th>Prova Documental</th>
            <th>Anexo</th>
            <th>Link Rápido</th>
        </tr>
    </thead>
    <tbody>
"""

        for annex in annexes:
            link = annex['googleDriveLink'] or '#'
            link_text = f"<a href='{link}' target='_blank'>[Clicar para abrir]</a>"

            html += f"""        <tr>
            <td>[Fato relacionado a {annex['annexNumber']}]</td>
            <td>{annex['fileType'].upper()} - {annex['originalName'][:50]}</td>
            <td>{annex['annexNumber']}</td>
            <td>{link_text}</td>
        </tr>
"""

        html += """    </tbody>
</table>"""

        return html

    def export_to_json(self, annexes_json: str) -> Dict[str, Any]:
        """Export metadata as JSON for React component."""
        with open(annexes_json, 'r', encoding='utf-8') as f:
            return json.load(f)

    # Private helpers
    def _calculate_sha256(self, file_path: str) -> str:
        """Calculate SHA-256 hash of a file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for byte_block in iter(lambda: f.read(4096), b''):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def _find_or_create_folder(self, folder_name: str) -> str:
        """Find or create a folder in Google Drive"""
        if not self.service:
            return 'placeholder_folder_id'

        # Search for existing folder
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

    def _upload_file(self, file_path: str, file_name: str, parent_id: str) -> str:
        """Upload a file to Google Drive"""
        if not self.service:
            return 'placeholder_file_id'

        file_metadata = {
            'name': file_name,
            'parents': [parent_id]
        }

        media = MediaFileUpload(file_path, mimetype='application/pdf')

        file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()

        return file.get('id')


def main():
    """Main entry point"""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python standardize-annexes.py <source_directory> [--upload]")
        print("\nExample:")
        print("  python standardize-annexes.py ./peticao_assets --upload")
        sys.exit(1)

    source_dir = sys.argv[1]
    should_upload = '--upload' in sys.argv

    print(f"\n📋 STANDARDIZING FILES FROM: {source_dir}\n")

    # Initialize standardizer
    standardizer = AnnexStandardizer()

    # Step 1: Standardize local files
    result = standardizer.standardize_local_files(source_dir)

    # Step 2: Upload to Google Drive (if requested)
    if should_upload and result['status'] == 'success':
        print(f"\n☁️ UPLOADING TO GOOGLE DRIVE...\n")
        result = standardizer.upload_to_google_drive('annexes.json')

    # Step 3: Generate HTML table
    print(f"\n📊 GENERATING PROOF MATRIX HTML...\n")
    html_table = standardizer.generate_matrix_html('annexes.json')
    with open('proof_matrix.html', 'w', encoding='utf-8') as f:
        f.write(html_table)
    print("✓ Generated: proof_matrix.html")

    print(f"\n✅ Complete! Metadata saved to annexes.json\n")


if __name__ == '__main__':
    main()
