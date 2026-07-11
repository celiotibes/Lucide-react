import { describe, expect, it } from 'vitest';
import { escaparHtml, mesclarTemplate, paragrafosParaHtml } from './mesclarTemplate';

describe('mesclarTemplate', () => {
  it('substitui variável simples escapando HTML', () => {
    const resultado = mesclarTemplate('<p>Locatário: {{nome}}</p>', { nome: 'João <script>' });
    expect(resultado).toBe('<p>Locatário: João &lt;script&gt;</p>');
  });

  it('substitui variável tripla sem escapar (uso interno, dado já sanitizado)', () => {
    const resultado = mesclarTemplate('<div>{{{blocoHtml}}}</div>', { blocoHtml: '<b>ok</b>' });
    expect(resultado).toBe('<div><b>ok</b></div>');
  });

  it('renderiza bloco #each com múltiplas linhas', () => {
    const template = '<ul>{{#each mobilia}}<li>{{descricao}} (R$ {{valor}})</li>{{/each}}</ul>';
    const resultado = mesclarTemplate(template, {
      mobilia: [
        { descricao: 'Geladeira Frost Free', valor: 2690 },
        { descricao: 'Cama Box Solteiro', valor: 790 },
      ],
    });
    expect(resultado).toBe('<ul><li>Geladeira Frost Free (R$ 2690)</li><li>Cama Box Solteiro (R$ 790)</li></ul>');
  });

  it('bloco #each vazio quando a lista não existe ou está vazia', () => {
    expect(mesclarTemplate('<ul>{{#each mobilia}}<li>{{descricao}}</li>{{/each}}</ul>', {})).toBe('<ul></ul>');
    expect(mesclarTemplate('<ul>{{#each mobilia}}<li>{{descricao}}</li>{{/each}}</ul>', { mobilia: [] })).toBe('<ul></ul>');
  });

  it('escapa aspas e caracteres especiais dentro do #each (injeção de HTML pelo formulário)', () => {
    const resultado = mesclarTemplate('{{#each locatarios}}<td>{{nome}}</td>{{/each}}', {
      locatarios: [{ nome: '"><img src=x onerror=alert(1)>' }],
    });
    expect(resultado).not.toContain('<img');
    expect(resultado).toContain('&lt;img');
  });

  it('variável ausente vira string vazia, não "undefined" literal', () => {
    expect(mesclarTemplate('{{inexistente}}', {})).toBe('');
  });
});

describe('escaparHtml', () => {
  it('escapa os cinco caracteres perigosos', () => {
    expect(escaparHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
});

describe('paragrafosParaHtml', () => {
  it('quebra por linha em branco e escapa cada parágrafo', () => {
    const resultado = paragrafosParaHtml('Primeiro pedido.\n\nSegundo pedido com <tag>.');
    expect(resultado).toBe('<p>Primeiro pedido.</p>\n<p>Segundo pedido com &lt;tag&gt;.</p>');
  });

  it('texto vazio ou só espaços vira string vazia', () => {
    expect(paragrafosParaHtml('')).toBe('');
    expect(paragrafosParaHtml('   ')).toBe('');
    expect(paragrafosParaHtml(null)).toBe('');
    expect(paragrafosParaHtml(undefined)).toBe('');
  });
});
