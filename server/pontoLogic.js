'use strict';

const SEQUENCIA_COM_INTERVALO = ['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'];
// Colaboradores sem intervalo de almoço (ex.: estagiários de 4h/dia) batem
// apenas entrada e saída — sem os dois passos intermediários.
const SEQUENCIA_SEM_INTERVALO = ['entrada', 'saida'];
const LABELS = {
  entrada: 'Entrada',
  saida_intervalo: 'Saída para intervalo',
  retorno_intervalo: 'Retorno do intervalo',
  saida: 'Saída',
};

// Dado o último tipo de marcação do dia (ou null se ainda não bateu ponto hoje),
// determina qual é a próxima marcação esperada. `temIntervalo` (default true)
// define se o colaborador segue o ciclo de 4 marcações ou só entrada/saída.
function proximoTipo(ultimoTipoHoje, temIntervalo = true) {
  const sequencia = temIntervalo === false ? SEQUENCIA_SEM_INTERVALO : SEQUENCIA_COM_INTERVALO;
  if (!ultimoTipoHoje || !sequencia.includes(ultimoTipoHoje)) return 'entrada';
  const idx = sequencia.indexOf(ultimoTipoHoje);
  if (idx === sequencia.length - 1) return 'entrada'; // reinicia (ex.: turno extra/plantão)
  return sequencia[idx + 1];
}

module.exports = { SEQUENCIA: SEQUENCIA_COM_INTERVALO, SEQUENCIA_SEM_INTERVALO, LABELS, proximoTipo };
