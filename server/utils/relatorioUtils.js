'use strict';

const {
  localDateKey,
  localTimeStr,
  dateKeyRange,
  weekdayOfDateKey,
  parseHHMM,
  minutesDiff,
} = require('./dateUtils');

const TIPO_ENTRADA_EVENTOS = new Set(['entrada', 'retorno_intervalo']);
const TIPO_SAIDA_EVENTOS = new Set(['saida_intervalo', 'saida']);

const TIPO_LABEL = {
  entrada: 'Entrada',
  saida_intervalo: 'Saida (intervalo)',
  retorno_intervalo: 'Retorno (intervalo)',
  saida: 'Saida',
};

/**
 * Calcula, para um funcionario, o relatorio diario dentro de um intervalo de datas.
 * @param {object} funcionario registro da tabela funcionarios
 * @param {Array} registros lista de registros_ponto (ja filtrados para esse funcionario, ordenados por data_hora_utc)
 * @param {string} inicioKey YYYY-MM-DD
 * @param {string} fimKey YYYY-MM-DD
 * @param {string} hojeKey YYYY-MM-DD (data atual, para nao marcar falta em dias futuros/dia corrente incompleto)
 */
function calcularRelatorio(funcionario, registros, inicioKey, fimKey, hojeKey) {
  const diasTrabalho = new Set(
    String(funcionario.dias_trabalho || '1,2,3,4,5')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
  );
  const entradaEsperadaMin = parseHHMM(funcionario.jornada_entrada);
  const saidaEsperadaMin = parseHHMM(funcionario.jornada_saida);
  const tolerancia = funcionario.tolerancia_minutos || 0;
  const cargaEsperadaMin = funcionario.carga_horaria_diaria_minutos || 480;

  // Agrupa registros por dia local
  const porDia = new Map();
  for (const r of registros) {
    const dt = new Date(r.data_hora_utc);
    const key = localDateKey(dt);
    if (!porDia.has(key)) porDia.set(key, []);
    porDia.get(key).push({ ...r, dt, hora: localTimeStr(dt) });
  }

  const dias = [];
  const totais = {
    minutosTrabalhados: 0,
    minutosAtraso: 0,
    minutosSaidaAntecipada: 0,
    diasComFalta: 0,
    diasTrabalhados: 0,
    diasUteisNoPeriodo: 0,
    diasComInconsistencia: 0,
  };

  for (const dataKey of dateKeyRange(inicioKey, fimKey)) {
    const weekday = weekdayOfDateKey(dataKey);
    const ehDiaUtil = diasTrabalho.has(weekday);
    const eventosDoDia = (porDia.get(dataKey) || []).sort((a, b) => a.dt - b.dt);

    let minutosTrabalhados = 0;
    let aberto = null;
    let inconsistente = false;

    for (const ev of eventosDoDia) {
      if (TIPO_ENTRADA_EVENTOS.has(ev.tipo)) {
        if (aberto) inconsistente = true; // duas entradas seguidas sem saida
        aberto = ev.dt;
      } else if (TIPO_SAIDA_EVENTOS.has(ev.tipo)) {
        if (!aberto) {
          inconsistente = true; // saida sem entrada correspondente
        } else {
          minutosTrabalhados += minutesDiff(aberto, ev.dt);
          aberto = null;
        }
      }
    }
    if (aberto && dataKey !== hojeKey) {
      // dia encerrado sem a ultima saida registrada
      inconsistente = true;
    }

    const primeiraEntrada = eventosDoDia.find((e) => e.tipo === 'entrada');
    const ultimaSaida = [...eventosDoDia].reverse().find((e) => e.tipo === 'saida');

    let atrasoMin = 0;
    let entradaRealMin = null;
    if (primeiraEntrada) {
      const p = localTimeStr(primeiraEntrada.dt).split(':').map(Number);
      entradaRealMin = p[0] * 60 + p[1];
      if (entradaRealMin > entradaEsperadaMin + tolerancia) {
        atrasoMin = entradaRealMin - entradaEsperadaMin;
      }
    }

    let saidaAntecipadaMin = 0;
    if (ultimaSaida) {
      const p = localTimeStr(ultimaSaida.dt).split(':').map(Number);
      const saidaRealMin = p[0] * 60 + p[1];
      if (saidaRealMin < saidaEsperadaMin - tolerancia) {
        saidaAntecipadaMin = saidaEsperadaMin - saidaRealMin;
      }
    }

    const isFuturo = dataKey > hojeKey;
    const falta = ehDiaUtil && eventosDoDia.length === 0 && !isFuturo;

    if (ehDiaUtil && !isFuturo) totais.diasUteisNoPeriodo += 1;
    if (falta) totais.diasComFalta += 1;
    if (eventosDoDia.length > 0) totais.diasTrabalhados += 1;
    if (inconsistente) totais.diasComInconsistencia += 1;
    totais.minutosTrabalhados += minutosTrabalhados;
    totais.minutosAtraso += atrasoMin;
    totais.minutosSaidaAntecipada += saidaAntecipadaMin;

    dias.push({
      data: dataKey,
      diaUtil: ehDiaUtil,
      eventos: eventosDoDia.map((e) => ({ tipo: e.tipo, label: TIPO_LABEL[e.tipo], hora: e.hora })),
      minutosTrabalhados,
      metaMinutos: ehDiaUtil ? cargaEsperadaMin : 0,
      atrasoMin,
      saidaAntecipadaMin,
      falta,
      inconsistente,
    });
  }

  return { dias, totais };
}

module.exports = { calcularRelatorio, TIPO_LABEL };
