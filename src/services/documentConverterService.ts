// Serviço de Conversão de Documentos (PDF/DOCX/IMG → Markdown/Texto)

export class DocumentConverterService {
  // Converte arquivo para texto/markdown
  static async converterArquivo(
    file: File,
  ): Promise<{
    texto: string
    markdown: string
    formato: string
    tamanhoKB: number
  }> {
    const tipo = file.type.toLowerCase()
    const tamanhoKB = Math.round(file.size / 1024)

    if (tipo === 'application/pdf' || tipo.includes('pdf')) {
      return this.converterPDF(file)
    } else if (tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || tipo.includes('word')) {
      return this.converterDOCX(file)
    } else if (tipo.startsWith('image/')) {
      return this.converterImagem(file)
    } else if (tipo === 'text/plain') {
      return this.converterTexto(file)
    } else {
      throw new Error(`Tipo de arquivo não suportado: ${tipo}`)
    }
  }

  // Converte PDF para texto (simples - sem biblioteca externa)
  private static async converterPDF(file: File): Promise<{
    texto: string
    markdown: string
    formato: string
    tamanhoKB: number
  }> {
    try {
      // Simulação: Em produção, usaria pdf-parse ou pdfjs
      const arraybuffer = await file.arrayBuffer()
      const view = new Uint8Array(arraybuffer)

      // Detecta se é PDF válido
      const header = String.fromCharCode.apply(null, Array.from(view.slice(0, 4)) as any)
      if (!header.includes('%PDF')) {
        throw new Error('Arquivo não é um PDF válido')
      }

      // Extrai texto bruto (muito limitado sem biblioteca)
      let texto = ''
      for (let i = 0; i < view.length; i++) {
        const char = view[i]
        // Letras, números, espaço e caracteres comuns
        if ((char >= 32 && char <= 126) || char === 10 || char === 13) {
          texto += String.fromCharCode(char)
        }
      }

      // Limpa o texto
      texto = texto.replace(/\s+/g, ' ').trim()

      // Converte para markdown
      const markdown = this.normalizarParaMarkdown(texto)

      return {
        texto,
        markdown,
        formato: 'PDF',
        tamanhoKB: Math.round(file.size / 1024),
      }
    } catch (erro) {
      throw new Error(`Erro ao converter PDF: ${erro instanceof Error ? erro.message : 'Desconhecido'}`)
    }
  }

  // Converte DOCX para texto (simples - sem biblioteca externa)
  private static async converterDOCX(file: File): Promise<{
    texto: string
    markdown: string
    formato: string
    tamanhoKB: number
  }> {
    try {
      // Simulação: Em produção, usaria mammoth ou docx-parser
      const arraybuffer = await file.arrayBuffer()
      const view = new Uint8Array(arraybuffer)

      // DOCX é um ZIP, procura por texto dentro
      let texto = ''
      for (let i = 0; i < view.length; i++) {
        const char = view[i]
        if ((char >= 32 && char <= 126) || char === 10 || char === 13) {
          texto += String.fromCharCode(char)
        }
      }

      // Extrai apenas a parte entre tags XML (muito simplista)
      const matches = texto.match(/<w:t[^>]*>([^<]+)<\/w:t>/gi)
      const textoExtraido = matches
        ? matches
            .map((m) => m.replace(/<[^>]+>/g, ''))
            .join(' ')
            .replace(/\s+/g, ' ')
        : texto

      const markdown = this.normalizarParaMarkdown(textoExtraido || texto)

      return {
        texto: textoExtraido || texto,
        markdown,
        formato: 'DOCX',
        tamanhoKB: Math.round(file.size / 1024),
      }
    } catch (erro) {
      throw new Error(`Erro ao converter DOCX: ${erro instanceof Error ? erro.message : 'Desconhecido'}`)
    }
  }

  // Converte imagem para texto via OCR (simulado)
  private static async converterImagem(file: File): Promise<{
    texto: string
    markdown: string
    formato: string
    tamanhoKB: number
  }> {
    try {
      // Simulação: Em produção, usaria tesseract.js para OCR
      const reader = new FileReader()

      return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            const resultado = e.target?.result as string

            // Detecta tipo de imagem
            const tipo = resultado.split(',')[0].includes('png') ? 'PNG' : 'JPG'

            // Simulação de OCR: mensagem indicando que seria necessária biblioteca
            const texto = `[Imagem ${tipo} carregada - OCR não disponível localmente]\n\nEm produção, usaria tesseract.js para extrair texto da imagem.`

            const markdown = this.normalizarParaMarkdown(texto)

            resolve({
              texto,
              markdown,
              formato: `Imagem (${tipo})`,
              tamanhoKB: Math.round(file.size / 1024),
            })
          } catch (erro) {
            reject(erro)
          }
        }
        reader.onerror = () => reject(new Error('Erro ao ler imagem'))
        reader.readAsDataURL(file)
      })
    } catch (erro) {
      throw new Error(`Erro ao converter imagem: ${erro instanceof Error ? erro.message : 'Desconhecido'}`)
    }
  }

  // Converte texto puro
  private static async converterTexto(file: File): Promise<{
    texto: string
    markdown: string
    formato: string
    tamanhoKB: number
  }> {
    const texto = await file.text()
    const markdown = this.normalizarParaMarkdown(texto)

    return {
      texto,
      markdown,
      formato: 'Texto',
      tamanhoKB: Math.round(file.size / 1024),
    }
  }

  // Normaliza texto para markdown estruturado
  private static normalizarParaMarkdown(texto: string): string {
    let md = texto

    // Remove quebras de linha excessivas
    md = md.replace(/\n\n+/g, '\n\n')

    // Adiciona markdown headers para seções comuns
    md = md.replace(
      /^(CONTRATO|ACORDO|ADITIVO|VISTORIA|PARECER|PROPOSTA|RENOVAÇÃO|TERMO)\s*$/gm,
      '# $1',
    )

    // Adiciona markdown para datas
    md = md.replace(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g, '**$1**')

    // Adiciona markdown para valores monetários
    md = md.replace(/R\$\s*([\d.,]+)/g, '**R$ $1**')

    // Adiciona markdown para porcentagens
    md = md.replace(/(\d+(?:,\d+)?)\s*%/g, '**$1%**')

    // Limpa espaços
    md = md.trim()

    return md
  }

  // Extrai seções principais do documento
  static extrairSecoes(texto: string): Record<string, string> {
    const secoes: Record<string, string> = {}

    // Procura por padrões de seções comuns
    const padroes = {
      partes: /(?:PARTES?|CONTRATANTES?|Entre)[\s\n]+(.*?)(?=\n\n|\d{1,2}\.|Cláusula)/is,
      imovel: /(?:IMÓVEL|PROPRIEDADE|ENDEREÇO)[\s\n]+(.*?)(?=\n\n|\d{1,2}\.|Cláusula)/is,
      valores:
        /(?:VALORES?|PREÇO|ALUGUEL|ALUGUÉIS|CONTRAPRESTAÇÃO)[\s\n]+(.*?)(?=\n\n|\d{1,2}\.|Cláusula)/is,
      datas: /(?:DATAS?|PERÍODOS?|VIGÊNCIA|DURAÇÃO)[\s\n]+(.*?)(?=\n\n|\d{1,2}\.|Cláusula)/is,
      clausulas: /(?:CLÁUSULAS?|DISPOSIÇÕES?|TERMOS)[\s\n]+(.*?)(?=\n\n|FIM|ASSINATURA)/is,
    }

    for (const [chave, padrao] of Object.entries(padroes)) {
      const match = texto.match(padrao)
      if (match) {
        secoes[chave] = match[1].trim()
      }
    }

    return secoes
  }

  // Extrai valores monetários do texto
  static extrairValores(texto: string): Record<string, number> {
    const valores: Record<string, number> = {}

    // Procura por padrões de valores
    const padroes = {
      aluguel: /aluguel[^0-9]*?R\$\s*([\d.,]+)/i,
      caução: /caução[^0-9]*?R\$\s*([\d.,]+)/i,
      taxa_administracao: /taxa[\s\w]*administra[^0-9]*?R\$\s*([\d.,]+)/i,
      seguro: /seguro[^0-9]*?R\$\s*([\d.,]+)/i,
      iptu: /iptu[^0-9]*?R\$\s*([\d.,]+)/i,
    }

    for (const [chave, padrao] of Object.entries(padroes)) {
      const match = texto.match(padrao)
      if (match) {
        // Converte "1.234,56" para 1234.56
        const valor = match[1]
          .replace(/\./g, '')
          .replace(',', '.')
        valores[chave] = parseFloat(valor)
      }
    }

    return valores
  }

  // Extrai datas do texto
  static extrairDatas(texto: string): Record<string, string> {
    const datas: Record<string, string> = {}

    // Padrões de data DD/MM/YYYY ou DD-MM-YYYY
    const padraoData = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g
    const matches = [...texto.matchAll(padraoData)]

    if (matches.length > 0) {
      datas['primeira_data'] = matches[0][0]
    }
    if (matches.length > 1) {
      datas['segunda_data'] = matches[1][0]
    }

    // Procura por keywords de datas
    if (/início|começo|a partir/i.test(texto) && matches.length > 0) {
      datas['data_inicio'] = matches[0][0]
    }
    if (/término|fim|até|vencimento/i.test(texto) && matches.length > 1) {
      datas['data_fim'] = matches[1][0]
    }
    if (/renovação|reajuste/i.test(texto) && matches.length > 0) {
      datas['data_renovacao'] = matches[0][0]
    }

    return datas
  }
}
