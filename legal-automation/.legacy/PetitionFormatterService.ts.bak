import { logger } from '@utils/logger';
import { Petition } from '@/types';

export interface TribunalFormat {
  contentType: 'rtf' | 'pdf' | 'xml' | 'json' | 'text';
  requiresHeader: boolean;
  maxAttachments: number;
  maxAttachmentSize: number;
  requiredMetadata: string[];
  dateFormat: string;
  signatureFormat: 'cms' | 'xades' | 'pades';
  encoding: string;
}

export interface ProcessedAttachment {
  filename: string;
  size: number;
  mimeType: string;
  base64?: string;
  path?: string;
}

export interface FormattedPetition {
  tribunal: string;
  content: string;
  contentType: string;
  attachments: ProcessedAttachment[];
  metadata: Record<string, any>;
  dateFormat: string;
  signatureFormat: string;
  encoding: string;
  originalPetition: Petition;
}

const TRIBUNAL_FORMATS: Record<string, TribunalFormat> = {
  tjsc: {
    contentType: 'rtf',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  tjpr: {
    contentType: 'xml',
    requiresHeader: true,
    maxAttachments: 15,
    maxAttachmentSize: 100 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue', 'prioridade'],
    dateFormat: 'YYYY-MM-DD',
    signatureFormat: 'xades',
    encoding: 'utf-8',
  },
  tjal: {
    contentType: 'pdf',
    requiresHeader: false,
    maxAttachments: 8,
    maxAttachmentSize: 25 * 1024 * 1024,
    requiredMetadata: ['oab'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  tjsp: {
    contentType: 'pdf',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  tjrs: {
    contentType: 'pdf',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  tjmg: {
    contentType: 'pdf',
    requiresHeader: true,
    maxAttachments: 12,
    maxAttachmentSize: 60 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  trf4: {
    contentType: 'xml',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'YYYY-MM-DD',
    signatureFormat: 'xades',
    encoding: 'utf-8',
  },
  jfpr: {
    contentType: 'pdf',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  just: {
    contentType: 'pdf',
    requiresHeader: false,
    maxAttachments: 8,
    maxAttachmentSize: 40 * 1024 * 1024,
    requiredMetadata: [],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  tjmt: {
    contentType: 'pdf',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  tjro: {
    contentType: 'pdf',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
  jfsc: {
    contentType: 'pdf',
    requiresHeader: true,
    maxAttachments: 10,
    maxAttachmentSize: 50 * 1024 * 1024,
    requiredMetadata: ['oab', 'causaValue'],
    dateFormat: 'DD/MM/YYYY',
    signatureFormat: 'pades',
    encoding: 'utf-8',
  },
};

export class PetitionFormatterService {
  async formatPetition(petition: Petition, tribunal: string): Promise<FormattedPetition> {
    const format = TRIBUNAL_FORMATS[tribunal];

    if (!format) {
      throw new Error(`Tribunal ${tribunal} não tem formato definido`);
    }

    logger.debug(`Formatando petição para ${tribunal}`);

    // 1. Convert content to required format
    const formattedContent = await this.convertToFormat(petition.content, format.contentType);

    // 2. Add header if required
    let finalContent = formattedContent;
    if (format.requiresHeader) {
      finalContent = this.addHeader(finalContent, petition, tribunal, format.dateFormat);
    }

    // 3. Validate attachments
    const validatedAttachments = await this.validateAndProcessAttachments(
      petition.attachments || [],
      format,
    );

    // 4. Prepare metadata
    const metadata = this.prepareMetadata(petition, format);

    logger.debug(
      `Formatação concluída - Content Type: ${format.contentType}, Anexos: ${validatedAttachments.length}`,
    );

    return {
      tribunal,
      content: finalContent,
      contentType: format.contentType,
      attachments: validatedAttachments,
      metadata,
      dateFormat: format.dateFormat,
      signatureFormat: format.signatureFormat,
      encoding: format.encoding,
      originalPetition: petition,
    };
  }

  private async convertToFormat(content: string, targetFormat: string): Promise<string> {
    // Simple conversion logic - in production, use pandoc or similar
    switch (targetFormat) {
      case 'rtf':
        return this.convertToRTF(content);
      case 'xml':
        return this.convertToXML(content);
      case 'json':
        return this.convertToJSON(content);
      case 'text':
        return content;
      case 'pdf':
      default:
        return content;
    }
  }

  private convertToRTF(content: string): string {
    // RTF header + escaped content
    const escapedContent = content
      .replace(/\\/g, '\\\\')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\n/g, '\\par\n');

    return `{\\rtf1\\ansi\\ansicpg1252\\deff0
{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}
{\\colortbl;\\red0\\green0\\blue0;}
\\margl1440\\margr1440\\marg d1440\\marg b1440
\\f0\\fs20
${escapedContent}
}`;
  }

  private convertToXML(content: string): string {
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    return `<?xml version="1.0" encoding="UTF-8"?>
<petition>
  <content><![CDATA[${content}]]></content>
</petition>`;
  }

  private convertToJSON(content: string): string {
    return JSON.stringify(
      {
        type: 'petition',
        content,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  private addHeader(
    content: string,
    petition: Petition,
    tribunal: string,
    dateFormat: string,
  ): string {
    const formatDate = (date: Date | undefined) => {
      if (!date) return '';
      if (dateFormat === 'YYYY-MM-DD') {
        return date.toISOString().split('T')[0];
      }
      return date.toLocaleDateString('pt-BR');
    };

    const header = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRIBUNAL: ${tribunal.toUpperCase()}
DATA: ${formatDate(new Date())}
ADVOGADO: ${petition.lawyerName || 'N/A'}
OAB: ${petition.oabNumber || 'N/A'}
PROCESSO: ${petition.processNumber || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${petition.title ? `TÍTULO: ${petition.title}\n\n` : ''}
${petition.subject ? `ASSUNTO: ${petition.subject}\n\n` : ''}
`;

    return header + content;
  }

  private async validateAndProcessAttachments(
    attachments: any[],
    format: TribunalFormat,
  ): Promise<ProcessedAttachment[]> {
    if (attachments.length > format.maxAttachments) {
      throw new Error(
        `Máximo de ${format.maxAttachments} anexos permitidos para ${format} (encontrados: ${attachments.length})`,
      );
    }

    const processed: ProcessedAttachment[] = [];

    for (const att of attachments) {
      const size = att.size || 0;

      if (size > format.maxAttachmentSize) {
        throw new Error(
          `Anexo "${att.filename}" excede o tamanho máximo de ${format.maxAttachmentSize / 1024 / 1024}MB (tamanho: ${(size / 1024 / 1024).toFixed(2)}MB)`,
        );
      }

      processed.push({
        filename: att.filename || att.originalname || 'attachment',
        size,
        mimeType: att.mimeType || att.mimetype || 'application/octet-stream',
        base64: att.base64,
        path: att.path,
      });
    }

    logger.debug(`${processed.length} anexos processados e validados`);

    return processed;
  }

  private prepareMetadata(petition: Petition, format: TribunalFormat): Record<string, any> {
    const metadata: Record<string, any> = {
      processNumber: petition.processNumber,
      lawyerName: petition.lawyerName,
      oabNumber: petition.oabNumber,
      timestamp: new Date().toISOString(),
      tribunal: petition.tribunal,
    };

    for (const field of format.requiredMetadata) {
      if (field === 'causaValue' && petition.causeValue) {
        metadata.causeValue = petition.causeValue;
      } else if (field === 'prioridade' && (petition as any).priority) {
        metadata.priority = (petition as any).priority;
      } else if (field === 'oab' && petition.oabNumber) {
        metadata.oab = petition.oabNumber;
      }
    }

    return metadata;
  }
}

export const petitionFormatter = new PetitionFormatterService();
