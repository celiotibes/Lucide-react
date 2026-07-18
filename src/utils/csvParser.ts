// RFC 4180-compliant CSV parser for robust field parsing
export interface ParseOptions {
  delimiter?: string
  quote?: string
  escape?: string
}

export function parseCSV(
  text: string,
  options: ParseOptions = {},
): string[][] {
  const delimiter = options.delimiter ?? ','
  const quote = options.quote ?? '"'
  const escape = options.escape ?? '"'

  const rows: string[][] = []
  let currentField = ''
  let insideQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (insideQuotes) {
      if (char === quote) {
        if (nextChar === escape) {
          // Escaped quote - add single quote and skip next char
          currentField += quote
          i += 2
        } else {
          // End of quoted field
          insideQuotes = false
          i++
        }
      } else {
        // Inside quotes - add any character
        currentField += char
        i++
      }
    } else {
      if (char === quote) {
        // Start of quoted field
        insideQuotes = true
        i++
      } else if (char === delimiter) {
        // End of field
        rows[rows.length - 1]?.push(currentField.trim())
        currentField = ''
        i++
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        // End of row
        if (currentField || rows[rows.length - 1]?.length > 0) {
          rows[rows.length - 1]?.push(currentField.trim())
          currentField = ''
        }
        rows.push([])
        if (char === '\r') i += 2
        else i++
      } else if (char === '\r') {
        // Handle standalone \r
        if (currentField || rows[rows.length - 1]?.length > 0) {
          rows[rows.length - 1]?.push(currentField.trim())
          currentField = ''
        }
        rows.push([])
        i++
      } else {
        // Regular character
        currentField += char
        i++
      }
    }
  }

  // Add final field and row
  if (currentField || rows[rows.length - 1]?.length > 0) {
    if (!rows.length) rows.push([])
    rows[rows.length - 1]?.push(currentField.trim())
  }

  // Remove empty rows
  return rows.filter((row) => row.length > 0 && row.some((field) => field.length > 0))
}

// Detect delimiter from file sample
export function detectDelimiter(text: string, sample = 5): string {
  const lines = text.split('\n').slice(0, sample)
  const delimiters = [',', ';', '\t', '|']

  let bestDelimiter = ','
  let maxDelimiterCount = 0

  for (const delimiter of delimiters) {
    let totalDelimiters = 0
    for (const line of lines) {
      const count = (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
      totalDelimiters += count
    }

    if (totalDelimiters > maxDelimiterCount) {
      maxDelimiterCount = totalDelimiters
      bestDelimiter = delimiter
    }
  }

  return bestDelimiter
}
