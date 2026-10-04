import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmDialog } from "./ConfirmDialog";

const props = { title: "Excluir?", message: "Não pode ser desfeito.", onConfirm: () => {}, onCancel: () => {} };

describe("ConfirmDialog", () => {
  it("fechado não renderiza nada", () => {
    expect(renderToStaticMarkup(createElement(ConfirmDialog, { ...props, isOpen: false }))).toBe("");
  });

  it("aberto expõe alertdialog modal rotulado, com título, mensagem e botões", () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, { ...props, isOpen: true, isDanger: true, confirmText: "Excluir" }));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    const labelledby = /aria-labelledby="([^"]+)"/.exec(html)![1];
    const describedby = /aria-describedby="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`id="${labelledby}"`);
    expect(html).toContain(`id="${describedby}"`);
    expect(html).toContain("Excluir?");
    expect(html).toContain("Não pode ser desfeito.");
    expect(html).toContain("Cancelar");
    expect(html).toContain("Excluir</button>");
  });

  it("ids estáveis entre renderizações", () => {
    const a = renderToStaticMarkup(createElement(ConfirmDialog, { ...props, isOpen: true }));
    const b = renderToStaticMarkup(createElement(ConfirmDialog, { ...props, isOpen: true }));
    expect(/aria-labelledby="([^"]+)"/.exec(a)![1]).toBe(/aria-labelledby="([^"]+)"/.exec(b)![1]);
  });
});
