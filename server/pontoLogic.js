'use strict';

const SEQUENCIA_COM_INTERVALO = ['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'];
// Colaboradores sem intervalo de almoco (ex.: estagiarios de 4h/dia) batem
// apenas entrada e saida — sem os dois passos intermediarios.
const SEQUENCIA_SEM_INTERVALO = ['entrada', 'saida'];
const LABELS = {
  entrada: 'Entrada',
  saida_intervalo: 'Saida para intervalo',
  retorno_intervalo: 'Retorno do intervalo',
  saida: 'Saida',
};

// Dado o ultimo tipo de marcacao do dia (ou null se ainda nao bateu ponto hoje),
// determina qual e a proxima marcacao esperada. `temIntervalo` (default true)
// define se o colaborador segue o ciclo de 4 marcacoes ou so entrada/saida.
function proximoTipo(ultimoTipoHoje, temIntervalo = true) {
  const sequencia = temIntervalo === false ? SEQUENCIA_SEM_INTERVALO : SEQUENCIA_COM_INTERVALO;
  if (!ultimoTipoHoje || !sequencia.includes(ultimoTipoHoje)) return 'entrada';
  const idx = sequencia.indexOf(ultimoTipoHoje);
  if (idx === sequencia.length - 1) return 'entrada'; // reinicia (ex.: turno extra/plantao)
  return sequencia[idx + 1];
}

module.exports = { SEQUENCIA: SEQUENCIA_COM_INTERVALO, SEQUENCIA_SEM_INTERVALO, LABELS, proximoTipo };
