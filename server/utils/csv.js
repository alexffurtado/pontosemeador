'use strict';

function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[";\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Gera CSV compatível com Excel (separador ; para localização pt-BR, com BOM UTF-8).
function buildCsv(headers, rows) {
  const lines = [];
  lines.push(headers.map(escapeCsvField).join(';'));
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(';'));
  }
  const BOM = '﻿';
  return BOM + lines.join('\r\n') + '\r\n';
}

module.exports = { buildCsv };
