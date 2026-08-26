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
 * Emparelha entradas/saidas em sessoes de trabalho percorrendo TODA a lista de
 * registros em ordem cronologica (nao dia a dia). Isso garante que plantoes que
 * atravessam a meia-noite (ex.: chamado as 22h, atendimento ate 1h do dia seguinte)
 * sejam contabilizados corretamente como uma unica sessao, em vez de aparecerem
 * como duas marcacoes "quebradas" em dias diferentes.
 *
 * Cada sessao fechada e atribuida ao dia (fuso local) em que ELA COMEÇOU — convencao
 * comum em escalas de plantao/sobreaviso no Brasil.
 */
function montarSessoes(registrosOrdenados, hojeKey) {
  const sessoes = []; // { inicio, fim, minutos, diaInicio }
  const diasInconsistentes = new Set();
  let aberto = null;

  for (const ev of registrosOrdenados) {
    if (TIPO_ENTRADA_EVENTOS.has(ev.tipo)) {
      if (aberto) {
        // duas entradas seguidas sem saida no meio: marca o dia da entrada anterior
        diasInconsistentes.add(localDateKey(aberto));
      }
      aberto = ev.dt;
    } else if (TIPO_SAIDA_EVENTOS.has(ev.tipo)) {
      if (!aberto) {
        diasInconsistentes.add(localDateKey(ev.dt)); // saida sem entrada correspondente
      } else {
        const diaInicio = localDateKey(aberto);
        sessoes.push({ inicio: aberto, fim: ev.dt, minutos: minutesDiff(aberto, ev.dt), diaInicio });
        aberto = null;
      }
    }
  }
  if (aberto && localDateKey(aberto) !== hojeKey) {
    // sessao aberta que nao e a de hoje: esqueceram de bater a ultima saida
    diasInconsistentes.add(localDateKey(aberto));
  }

  return { sessoes, diasInconsistentes };
}

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
  const verificarAtraso = funcionario.verificar_atraso !== false && funcionario.verificar_atraso !== 0;
  const verificarSaidaAntecipada =
    funcionario.verificar_saida_antecipada !== false && funcionario.verificar_saida_antecipada !== 0;

  // Agrupa registros por dia local (para exibicao e para os checks de atraso/saida antecipada)
  const registrosComData = registros
    .map((r) => {
      const dt = new Date(r.data_hora_utc);
      return { ...r, dt, hora: localTimeStr(dt) };
    })
    .sort((a, b) => a.dt - b.dt);

  const porDia = new Map();
  for (const r of registrosComData) {
    const key = localDateKey(r.dt);
    if (!porDia.has(key)) porDia.set(key, []);
    porDia.get(key).push(r);
  }

  // Emparelha sessoes de trabalho cronologicamente (funciona atraves da meia-noite)
  const { sessoes, diasInconsistentes } = montarSessoes(registrosComData, hojeKey);
  const minutosPorDiaSessao = new Map();
  const diasComContinuacaoSeguinte = new Set(); // sessao iniciada nesse dia, mas que so termina no dia seguinte
  const diasQueRecebemContinuacao = new Set(); // dia que so tem a "cauda" (saida) de uma sessao iniciada no dia anterior
  for (const s of sessoes) {
    minutosPorDiaSessao.set(s.diaInicio, (minutosPorDiaSessao.get(s.diaInicio) || 0) + s.minutos);
    const diaFim = localDateKey(s.fim);
    if (diaFim !== s.diaInicio) {
      diasComContinuacaoSeguinte.add(s.diaInicio);
      diasQueRecebemContinuacao.add(diaFim);
    }
  }

  const dias = [];
  const totais = {
    minutosTrabalhados: 0,
    minutosAtraso: 0,
    minutosSaidaAntecipada: 0,
    minutosExtras: 0,
    diasComFalta: 0,
    diasTrabalhados: 0,
    diasUteisNoPeriodo: 0,
    diasComInconsistencia: 0,
  };

  for (const dataKey of dateKeyRange(inicioKey, fimKey)) {
    const weekday = weekdayOfDateKey(dataKey);
    const ehDiaUtil = diasTrabalho.has(weekday);
    const eventosDoDia = porDia.get(dataKey) || [];

    const minutosTrabalhados = minutosPorDiaSessao.get(dataKey) || 0;
    const inconsistente = diasInconsistentes.has(dataKey);

    const primeiraEntrada = eventosDoDia.find((e) => e.tipo === 'entrada');
    const ultimaSaida = [...eventosDoDia].reverse().find((e) => e.tipo === 'saida');

    let atrasoMin = 0;
    if (verificarAtraso && primeiraEntrada) {
      const p = primeiraEntrada.hora.split(':').map(Number);
      const entradaRealMin = p[0] * 60 + p[1];
      if (entradaRealMin > entradaEsperadaMin + tolerancia) {
        atrasoMin = entradaRealMin - entradaEsperadaMin;
      }
    }

    let saidaAntecipadaMin = 0;
    if (verificarSaidaAntecipada && ultimaSaida) {
      const p = ultimaSaida.hora.split(':').map(Number);
      const saidaRealMin = p[0] * 60 + p[1];
      if (saidaRealMin < saidaEsperadaMin - tolerancia) {
        saidaAntecipadaMin = saidaEsperadaMin - saidaRealMin;
      }
    }

    const isFuturo = dataKey > hojeKey;
    const falta = ehDiaUtil && eventosDoDia.length === 0 && !isFuturo;
    const metaMinutos = ehDiaUtil ? cargaEsperadaMin : 0;
    // Hora extra: minutos trabalhados alem da meta do dia. Em dias de folga
    // (meta = 0), tudo que for trabalhado conta como extra.
    const extraMin = Math.max(0, minutosTrabalhados - metaMinutos);

    if (ehDiaUtil && !isFuturo) totais.diasUteisNoPeriodo += 1;
    if (falta) totais.diasComFalta += 1;
    if (eventosDoDia.length > 0) totais.diasTrabalhados += 1;
    if (inconsistente) totais.diasComInconsistencia += 1;
    totais.minutosTrabalhados += minutosTrabalhados;
    totais.minutosAtraso += atrasoMin;
    totais.minutosSaidaAntecipada += saidaAntecipadaMin;
    totais.minutosExtras += extraMin;

    dias.push({
      data: dataKey,
      diaUtil: ehDiaUtil,
      eventos: eventosDoDia.map((e) => ({ tipo: e.tipo, label: TIPO_LABEL[e.tipo], hora: e.hora })),
      minutosTrabalhados,
      metaMinutos,
      continuaNoDiaSeguinte: diasComContinuacaoSeguinte.has(dataKey),
      continuacaoDoDiaAnterior: diasQueRecebemContinuacao.has(dataKey),
      atrasoMin,
      saidaAntecipadaMin,
      extraMin,
      falta,
      inconsistente,
    });
  }

  return { dias, totais };
}

module.exports = { calcularRelatorio, TIPO_LABEL };
