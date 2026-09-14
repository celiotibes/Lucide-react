import { describe, expect, it } from "vitest";
import { extrairCamposDeTexto } from "./extrairCampos";

describe("extrairCamposDeTexto — nome da contraparte e tipo (achado de uso real)", () => {
  it("extrai nome da contraparte por rótulo comum (CEDENTE/BENEFICIÁRIO/RAZÃO SOCIAL)", () => {
    const texto = `
      BOLETO DE COBRANÇA
      CEDENTE: LIFE SPACE ESTACIONAMENTOS LTDA
      CNPJ: 18.071.719/0001-89
      Valor: R$ 242,15
      Vencimento: 07/09/2026
    `;
    const campos = extrairCamposDeTexto(texto);
    expect(campos.nomeContraparte).toBe("LIFE SPACE ESTACIONAMENTOS LTDA");
    expect(campos.cnpjCpf).toBe("18.071.719/0001-89");
  });

  it("sem rótulo conhecido, extrai o nome do texto antes do CNPJ na mesma linha", () => {
    const texto = "LIFE SPACE ESTACIONAMENTOS LTDA   CNPJ: 18.071.719/0001-89\nValor: R$ 100,00";
    const campos = extrairCamposDeTexto(texto);
    expect(campos.nomeContraparte).toBe("LIFE SPACE ESTACIONAMENTOS LTDA");
  });

  it("sem nenhum sinal reconhecível de nome, fica undefined (nunca inventa um fornecedor)", () => {
    const texto = "Documento qualquer sem nome de empresa nem CNPJ.\nValor: R$ 50,00\n10/01/2026";
    const campos = extrairCamposDeTexto(texto);
    expect(campos.nomeContraparte).toBeUndefined();
  });

  it("classifica 'boleto' pela linha digitável (sinal forte e específico)", () => {
    const texto = "Linha digitável: 34191.79001 01043.510047 91020.150008 1 95410000024200\nValor: R$ 242,00";
    const campos = extrairCamposDeTexto(texto);
    expect(campos.tipo).toBe("boleto");
  });

  it("classifica 'contrato' quando LOCATÁRIO e LOCADOR aparecem juntos", () => {
    const texto = "CONTRATO DE LOCAÇÃO RESIDENCIAL\nLOCADOR: Célio\nLOCATÁRIO: Thiago\nValor: R$ 1.289,00";
    const campos = extrairCamposDeTexto(texto);
    expect(campos.tipo).toBe("contrato");
  });

  it("classifica 'recibo' quando a palavra aparece no início do texto", () => {
    const texto = "RECIBO\nRecebi de Célio a quantia de R$ 300,00 referente a serviço de pintura.";
    const campos = extrairCamposDeTexto(texto);
    expect(campos.tipo).toBe("recibo");
  });

  it("sem nenhum sinal claro de tipo, fica undefined (a tela mantém 'outro', nunca um palpite sem base)", () => {
    const texto = "Documento genérico sem palavra-chave nenhuma.\nValor: R$ 50,00\n10/01/2026";
    const campos = extrairCamposDeTexto(texto);
    expect(campos.tipo).toBeUndefined();
  });

  // O caminho de XML de nota fiscal (pareceSerXmlNota/extrairCamposXmlNota, em parseNFe.ts)
  // usa DOMParser, indisponível no ambiente "node" desta suíte (vitest.config.ts) — cobri-lo
  // exigiria jsdom/happy-dom só para este arquivo. Fica como débito de teste pré-existente
  // (parseNFe.ts nunca teve teste próprio), fora do escopo desta correção pontual.
});
