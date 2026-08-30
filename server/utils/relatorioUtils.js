'use strict';

const {
  localDateKey,
  localTimeStr,
  dateKeyRange,
  weekdayOfDateKey,
  parseHHMM,
  minutesDiff,
  diasEntreDateKeys,
} = require('./dateUtils');

const TIPO_ENTRADA_EVENTOS = new Set(['entrada', 'retorno_intervalo']);
const TIPO_SAIDA_EVENTOS = new Set(['saida_intervalo', 'saida']);

const TIPO_LABEL = {
  entrada: 'Entrada',
  saida_intervalo: 'Saída (intervalo)',
  retorno_intervalo: 'Retorno (intervalo)',
  saida: 'Saída',
};

/**
 * Emparelha entradas/saídas em sessões de trabalho percorrendo TODA a lista de
 * registros em ordem cronológica (não dia a dia). Isso garante que plantões que
 * atravessam a meia-noite (ex.: chamado às 22h, atendimento até 1h do dia seguinte)
 * sejam contabilizados corretamente como uma única sessão, em vez de aparecerem
 * como duas marcações "quebradas" em dias diferentes.
 *
 * Cada sessão fechada é atribuída ao dia (fuso local) em que ELA COMEÇOU — convenção
 * comum em escalas de plantão/sobreaviso no Brasil.
 */
function montarSessoes(registrosOrdenados, hojeKey) {
  const sessoes = []; // { inicio, fim, minutos, diaInicio }
  const diasInconsistentes = new Set();
  let aberto = null;
  // Guarda o tipo do último evento de cada dia (a lista já vem ordenada
  // cronologicamente, então a última escrita por dia é sempre o evento mais
  // recente daquele dia).
  const ultimoEventoPorDia = new Map();

  for (const ev of registrosOrdenados) {
    ultimoEventoPorDia.set(localDateKey(ev.dt), ev.tipo);
    if (TIPO_ENTRADA_EVENTOS.has(ev.tipo)) {
      if (aberto) {
        // duas entradas seguidas sem saída no meio: marca o dia da entrada anterior
        diasInconsistentes.add(localDateKey(aberto));
      }
      aberto = ev.dt;
    } else if (TIPO_SAIDA_EVENTOS.has(ev.tipo)) {
      if (!aberto) {
        diasInconsistentes.add(localDateKey(ev.dt)); // saída sem entrada correspondente
      } else {
        const diaInicio = localDateKey(aberto);
        sessoes.push({ inicio: aberto, fim: ev.dt, minutos: minutesDiff(aberto, ev.dt), diaInicio });
        aberto = null;
      }
    }
  }
  if (aberto && localDateKey(aberto) !== hojeKey) {
    // sessão aberta que não é a de hoje: esqueceram de bater a última saída
    diasInconsistentes.add(localDateKey(aberto));
  }

  // Dia que terminou "no meio do almoço": bateu entrada e saída (intervalo),
  // mas nunca bateu o retorno nem a saída final. A sessão da manhã já fecha
  // normalmente (par entrada -> saida_intervalo), então "aberto" fica nulo e o
  // caso acima não pega isso — precisa olhar especificamente qual foi o
  // último evento de cada dia já encerrado.
  for (const [dia, tipo] of ultimoEventoPorDia) {
    if (dia !== hojeKey && tipo === 'saida_intervalo') {
      diasInconsistentes.add(dia);
    }
  }

  return { sessoes, diasInconsistentes };
}

/**
 * Calcula, para um funcionário, o relatório diário dentro de um intervalo de datas.
 * @param {object} funcionario registro da tabela funcionarios
 * @param {Array} registros lista de registros_ponto (já filtrados para esse funcionário, ordenados por data_hora_utc)
 * @param {string} inicioKey YYYY-MM-DD
 * @param {string} fimKey YYYY-MM-DD
 * @param {string} hojeKey YYYY-MM-DD (data atual, para não marcar falta em dias futuros/dia corrente incompleto)
 */
function calcularRelatorio(funcionario, registros, inicioKey, fimKey, hojeKey) {
  const diasTrabalho = new Set(
    String(funcionario.dias_trabalho || '1,2,3,4,5')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
  );
  // Escala 12x36 (plantonistas): o dia de trabalho não segue um dia fixo da
  // semana, ele alterna a cada dia corrido a partir de uma data de referência
  // conhecida (paridade par/ímpar da diferença de dias). Ex.: se a referência
  // é um dia de trabalho, dias com diferença par também são (0, 2, 4, ...
  // dias depois/antes), e os de diferença ímpar são folga.
  const escala12x36 = funcionario.tipo_escala === '12x36' && !!funcionario.escala_data_referencia;

  // Horário personalizado por dia da semana: cada dia (0=domingo..6=sábado)
  // tem seu próprio horário esperado e pode ser folga independente dos
  // demais — usado por colaboradores com jornada bem irregular (ex.: folga
  // na terça, horário diferente no sábado/domingo). Só se aplica à escala
  // "semanal" (12x36 sempre usa a jornada padrão abaixo, já que o dia de
  // trabalho lá é definido por paridade de data, não por dia da semana).
  const horarioPersonalizado =
    !escala12x36 && !!funcionario.horario_personalizado_semana && Array.isArray(funcionario.horarios_semana);
  const horariosPorDiaSemana = new Map();
  if (horarioPersonalizado) {
    for (const cfg of funcionario.horarios_semana) {
      horariosPorDiaSemana.set(cfg.dia, cfg);
    }
  }

  const jornadaPadrao = {
    entradaEsperadaMin: parseHHMM(funcionario.jornada_entrada),
    saidaEsperadaMin: parseHHMM(funcionario.jornada_saida),
    cargaEsperadaMin: funcionario.carga_horaria_diaria_minutos || 480,
  };

  // Retorna, para uma data específica, se é dia de trabalho e qual o
  // horário/carga esperados naquele dia — cobre as 3 formas de escala
  // (semanal fixa, personalizada por dia da semana, 12x36).
  function configDoDia(dataKey, weekday) {
    if (horarioPersonalizado) {
      const cfg = horariosPorDiaSemana.get(weekday);
      if (!cfg || !cfg.ativo) {
        return { ehDiaUtil: false, entradaEsperadaMin: 0, saidaEsperadaMin: 0, cargaEsperadaMin: 0 };
      }
      return {
        ehDiaUtil: true,
        entradaEsperadaMin: parseHHMM(cfg.entrada),
        saidaEsperadaMin: parseHHMM(cfg.saida),
        cargaEsperadaMin: cfg.carga_minutos || 0,
      };
    }
    if (escala12x36) {
      const diff = diasEntreDateKeys(funcionario.escala_data_referencia, dataKey);
      return { ehDiaUtil: Math.abs(diff) % 2 === 0, ...jornadaPadrao };
    }
    return { ehDiaUtil: diasTrabalho.has(weekday), ...jornadaPadrao };
  }

  const tolerancia = funcionario.tolerancia_minutos || 0;
  const verificarAtraso = funcionario.verificar_atraso !== false && funcionario.verificar_atraso !== 0;
  const verificarSaidaAntecipada =
    funcionario.verificar_saida_antecipada !== false && funcionario.verificar_saida_antecipada !== 0;

  // Agrupa registros por dia local (para exibição e para os checks de atraso/saída antecipada)
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

  // Emparelha sessões de trabalho cronologicamente (funciona através da meia-noite)
  const { sessoes, diasInconsistentes } = montarSessoes(registrosComData, hojeKey);
  const minutosPorDiaSessao = new Map();
  const diasComContinuacaoSeguinte = new Set(); // sessão iniciada nesse dia, mas que só termina no dia seguinte
  const diasQueRecebemContinuacao = new Set(); // dia que só tem a "cauda" (saída) de uma sessão iniciada no dia anterior
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
    const { ehDiaUtil, entradaEsperadaMin, saidaEsperadaMin, cargaEsperadaMin } = configDoDia(dataKey, weekday);
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
    // Hora extra: minutos trabalhados além da meta do dia. Em dias de folga
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
      eventos: eventosDoDia.map((e) => ({ id: e.id, tipo: e.tipo, label: TIPO_LABEL[e.tipo], hora: e.hora })),
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
