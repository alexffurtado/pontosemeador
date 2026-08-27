'use strict';

// Gerador de PDF minimalista, escrito apenas com recursos nativos do Node.js
// (sem bibliotecas externas). Suporta texto (fonte padrao Helvetica / Helvetica-Bold),
// retangulos preenchidos e linhas — o suficiente para montar relatorios tabulares.

const VERDE_ESCURO = [0.11, 0.29, 0.2]; // aprox #1b4a33
const VERDE_CLARO = [0.86, 0.94, 0.89]; // aprox #dbf0e2
const CINZA_LINHA = [0.9, 0.9, 0.9];
const PRETO = [0, 0, 0];

function sanitizeLatin1(str) {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    out += code <= 255 ? ch : '?';
  }
  return out;
}

function escapePdfText(str) {
  return sanitizeLatin1(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Largura aproximada de texto (heuristica, suficiente para truncar em colunas de tabela).
function approxTextWidth(str, fontSize, bold) {
  return String(str).length * fontSize * (bold ? 0.58 : 0.5);
}

function truncateToWidth(str, maxWidth, fontSize, bold) {
  str = String(str == null ? '' : str);
  if (approxTextWidth(str, fontSize, bold) <= maxWidth) return str;
  let result = str;
  while (result.length > 1 && approxTextWidth(result + '...', fontSize, bold) > maxWidth) {
    result = result.slice(0, -1);
  }
  return result.length < str.length ? result + '...' : result;
}

class PdfBuilder {
  constructor({ landscape = false, title = 'Relatorio' } = {}) {
    this.pageWidth = landscape ? 841.89 : 595.28;
    this.pageHeight = landscape ? 595.28 : 841.89;
    this.margin = 36;
    this.title = title;
    this.objects = [];
    this.pageContentNumbers = [];
    this.pageObjectNumbers = [];
    this.fontRegularNum = this._addObject(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    );
    this.fontBoldNum = this._addObject(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    );
    this._currentStream = null;
    this.pageCount = 0;
  }

  _addObject(body) {
    this.objects.push(body);
    return this.objects.length;
  }

  newPage() {
    this._flushPage();
    this._currentStream = [];
    this.pageCount += 1;
    this.y = this.pageHeight - this.margin;
    return this.pageCount;
  }

  _flushPage() {
    if (this._currentStream === null) return;
    const content = this._currentStream.join('\n');
    const contentNum = this._addObject(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    const pageNum = this._addObject(
      `<< /Type /Page /Parent PAGES_REF /Resources << /Font << /F1 ${this.fontRegularNum} 0 R /F2 ${this.fontBoldNum} 0 R >> >> /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${contentNum} 0 R >>`
    );
    this.pageObjectNumbers.push(pageNum);
    this._currentStream = null;
  }

  text(x, y, str, { size = 10, bold = false, color = PRETO } = {}) {
    const font = bold ? 'F2' : 'F1';
    const [r, g, b] = color;
    this._currentStream.push(
      `${r} ${g} ${b} rg\nBT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(str)}) Tj ET`
    );
  }

  rect(x, y, w, h, color) {
    const [r, g, b] = color;
    this._currentStream.push(`${r} ${g} ${b} rg\n${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  line(x1, y1, x2, y2, color = CINZA_LINHA, width = 0.5) {
    const [r, g, b] = color;
    this._currentStream.push(
      `${r} ${g} ${b} RG\n${width} w\n${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  }

  ensureSpace(neededHeight, redrawHeader) {
    if (this.y - neededHeight < this.margin + 20) {
      this.newPage();
      if (redrawHeader) redrawHeader();
    }
  }

  finish() {
    this._flushPage();
    const pagesNum = this._addObject(
      `<< /Type /Pages /Kids [${this.pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${this.pageObjectNumbers.length} >>`
    );
    // Substitui a referencia temporaria PAGES_REF pelo numero real do objeto Pages
    for (let i = 0; i < this.objects.length; i++) {
      if (typeof this.objects[i] === 'string' && this.objects[i].includes('PAGES_REF')) {
        this.objects[i] = this.objects[i].replace(/PAGES_REF/g, `${pagesNum} 0 R`);
      }
    }
    const catalogNum = this._addObject(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

    let out = '%PDF-1.4\n';
    const offsets = [];
    for (let i = 0; i < this.objects.length; i++) {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${i + 1} 0 obj\n${this.objects[i]}\nendobj\n`;
    }
    const xrefStart = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      out += String(off).padStart(10, '0') + ' 00000 n \n';
    }
    out += `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(out, 'latin1');
  }
}

/**
 * Gera um PDF de relatorio tabular.
 * @param {object} opts
 * @param {string} opts.titulo
 * @param {string} opts.subtitulo
 * @param {Array<{header:string, width:number}>} opts.colunas larguras em pontos (somando ~ largura util da pagina)
 * @param {Array<Array<string>>} opts.linhas
 * @param {Array<string>} [opts.resumo] linhas de texto extra ao final (totais)
 * @param {boolean} [opts.landscape]
 */
function gerarRelatorioPdf({ titulo, subtitulo, colunas, linhas, resumo = [], landscape = false }) {
  const pdf = new PdfBuilder({ landscape, title: titulo });
  const margin = pdf.margin;
  const usableWidth = pdf.pageWidth - margin * 2;

  const desenharCabecalho = () => {
    pdf.rect(0, pdf.pageHeight - 64, pdf.pageWidth, 64, VERDE_ESCURO);
    pdf.text(margin, pdf.pageHeight - 30, titulo, { size: 15, bold: true, color: [1, 1, 1] });
    pdf.text(margin, pdf.pageHeight - 47, subtitulo, { size: 9, bold: false, color: [0.85, 0.93, 0.88] });
    pdf.y = pdf.pageHeight - 84;
  };

  const desenharLinhaTabelaHeader = () => {
    const rowH = 18;
    pdf.rect(margin, pdf.y - rowH + 4, usableWidth, rowH, VERDE_CLARO);
    let x = margin + 3;
    for (const col of colunas) {
      pdf.text(x, pdf.y - 10, col.header, { size: 8.5, bold: true, color: VERDE_ESCURO });
      x += col.width;
    }
    pdf.y -= rowH;
    pdf.line(margin, pdf.y + 2, margin + usableWidth, pdf.y + 2, [0.6, 0.75, 0.68], 0.7);
  };

  pdf.newPage();
  desenharCabecalho();
  desenharLinhaTabelaHeader();

  let zebra = false;
  for (const linha of linhas) {
    pdf.ensureSpace(16, () => {
      desenharCabecalho();
      desenharLinhaTabelaHeader();
    });
    const rowH = 15;
    if (zebra) pdf.rect(margin, pdf.y - rowH + 4, usableWidth, rowH, [0.965, 0.98, 0.97]);
    zebra = !zebra;
    let x = margin + 3;
    linha.forEach((valor, i) => {
      const col = colunas[i];
      const texto = truncateToWidth(valor, col.width - 6, 8, false);
      pdf.text(x, pdf.y - 10, texto, { size: 8, color: PRETO });
      x += col.width;
    });
    pdf.y -= rowH;
  }

  if (resumo.length) {
    pdf.ensureSpace(20 + resumo.length * 14, () => {
      desenharCabecalho();
    });
    pdf.y -= 14;
    pdf.line(margin, pdf.y + 8, margin + usableWidth, pdf.y + 8, [0.6, 0.75, 0.68], 0.7);
    for (const linhaResumo of resumo) {
      pdf.ensureSpace(16, () => desenharCabecalho());
      pdf.text(margin, pdf.y, linhaResumo, { size: 9.5, bold: true, color: VERDE_ESCURO });
      pdf.y -= 15;
    }
  }

  return pdf.finish();
}

module.exports = { gerarRelatorioPdf };
