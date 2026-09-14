/** Cria um gerador de fitid sintético para formatos sem ID de transação real do banco
 * (CSV, PDF) — sem um contador de ocorrência, duas transações genuinamente distintas com a
 * mesma data+valor+descrição (ex: dois PIX idênticos de aluguel recebidos do mesmo inquilino
 * no mesmo dia) colidiriam no mesmo fitid, e a segunda seria descartada pelo INSERT OR IGNORE
 * como se fosse duplicata da primeira — mesmo numa única importação de um único arquivo real,
 * perdendo dado de verdade em silêncio (achado de auditoria adversarial). Reimportar o MESMO
 * arquivo continua sendo deduplicado corretamente: a mesma sequência de linhas produz a mesma
 * sequência de contadores, então cada transação recebe o mesmo fitid de novo. Um gerador novo
 * por chamada de parser (não compartilhado entre arquivos) — a UNIQUE é por conta_id, então
 * mesma chave+ocorrência vindo de arquivos diferentes na mesma conta ainda dedup corretamente
 * se forem de fato a mesma transação reimportada. */
export function criarGeradorFitidSintetico() {
  const contagem = new Map<string, number>();
  return (data: string, valor: number, descricao: string): string => {
    const chave = `${data}|${valor}|${descricao}`;
    const ocorrencia = (contagem.get(chave) ?? 0) + 1;
    contagem.set(chave, ocorrencia);
    return `${chave}|${ocorrencia}`;
  };
}
