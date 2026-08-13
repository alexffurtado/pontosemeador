'use strict';

const SEQUENCIA = ['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'];
const LABELS = {
  entrada: 'Entrada',
  saida_intervalo: 'Saida para intervalo',
  retorno_intervalo: 'Retorno do intervalo',
  saida: 'Saida',
};

// Dado o ultimo tipo de marcacao do dia (ou null se ainda nao bateu ponto hoje),
// determina qual e a proxima marcacao esperada.
function proximoTipo(ultimoTipoHoje) {
  if (!ultimoTipoHoje) return 'entrada';
  const idx = SEQUENCIA.indexOf(ultimoTipoHoje);
  if (idx === -1 || idx === SEQUENCIA.length - 1) return 'entrada'; // reinicia (ex.: turno extra)
  return SEQUENCIA[idx + 1];
}

module.exports = { SEQUENCIA, LABELS, proximoTipo };
