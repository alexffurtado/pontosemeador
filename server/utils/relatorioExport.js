'use strict';

const { buildCsv } = require('./csv');
const { gerarRelatorioPdf } = require('./pdf');
const { localDateBR, weekdayName, weekdayOfDateKey, minutesToHoursLabel } = require('./dateUtils');

function statusDoDia(dia) {
  if (dia.falta) return 'FALTA';
  if (dia.eventos.length === 0) return dia.diaUtil ? '-' : 'Folga';
  const partes = [];
  if (dia.atrasoMin > 0) partes.push(`Atraso ${minutesToHoursLabel(dia.atrasoMin)}`);
  if (dia.saidaAntecipadaMin > 0) partes.push(`Saída antecipada ${minutesToHoursLabel(dia.saidaAntecipadaMin)}`);
  if (dia.inconsistente) partes.push('Marcação incompleta');
  if (partes.length === 0) return 'OK';
  return partes.join(' | ');
}

function horasExtrasDoDia(dia) {
  return dia.extraMin > 0 ? minutesToHoursLabel(dia.extraMin) : '-';
}

const TIPO_ABREV = { entrada: 'Ent', saida_intervalo: 'Said.interv', retorno_intervalo: 'Ret.interv', saida: 'Said' };

// Lista TODAS as marcações do dia (não apenas 4 fixas), para que plantões/chamados
// extras (inclusive de madrugada) apareçam no relatório exportado.
function marcacoesDoDia(dia) {
  if (!dia.eventos.length) return '-';
  let texto = dia.eventos.map((e) => `${TIPO_ABREV[e.tipo] || '?'} ${e.hora}`).join(' | ');
  if (dia.continuacaoDoDiaAnterior) texto += ' (plantão iniciado no dia anterior)';
  if (dia.continuaNoDiaSeguinte) texto += ' (continua após a meia-noite)';
  return texto;
}

function linhasDetalhado(dias) {
  return dias.map((dia) => [
    localDateBR(dia.data),
    weekdayName(weekdayOfDateKey(dia.data)),
    marcacoesDoDia(dia),
    minutesToHoursLabel(dia.minutosTrabalhados),
    horasExtrasDoDia(dia),
    statusDoDia(dia),
  ]);
}

const COLUNAS_DETALHADO_HEADER = ['Data', 'Dia da semana', 'Marcações', 'Horas', 'Horas extras', 'Situação'];

function csvRelatorioDetalhado(funcionario, dias, totais) {
  const linhas = linhasDetalhado(dias);
  linhas.push([]);
  linhas.push(['Total de horas trabalhadas', minutesToHoursLabel(totais.minutosTrabalhados)]);
  linhas.push(['Total de horas extras', minutesToHoursLabel(totais.minutosExtras)]);
  linhas.push(['Total de atrasos', minutesToHoursLabel(totais.minutosAtraso)]);
  linhas.push(['Total de saídas antecipadas', minutesToHoursLabel(totais.minutosSaidaAntecipada)]);
  linhas.push(['Faltas', String(totais.diasComFalta)]);
  linhas.push(['Dias com marcação incompleta', String(totais.diasComInconsistencia)]);
  return buildCsv(COLUNAS_DETALHADO_HEADER, linhas);
}

function pdfRelatorioDetalhado(funcionario, dias, totais, periodoLabel) {
  const linhas = linhasDetalhado(dias);
  const resumo = [
    `Total de horas trabalhadas: ${minutesToHoursLabel(totais.minutosTrabalhados)}`,
    `Total de horas extras: ${minutesToHoursLabel(totais.minutosExtras)}`,
    `Total de atrasos: ${minutesToHoursLabel(totais.minutosAtraso)}`,
    `Total de saídas antecipadas: ${minutesToHoursLabel(totais.minutosSaidaAntecipada)}`,
    `Faltas: ${totais.diasComFalta} dia(s)`,
  ];
  return gerarRelatorioPdf({
    titulo: 'Plano Semeador - Relatório de Ponto',
    subtitulo: `Colaborador: ${funcionario.nome}  |  Cargo: ${funcionario.cargo || '-'}  |  Período: ${periodoLabel}`,
    landscape: true,
    colunas: [
      { header: 'Data', width: 65 },
      { header: 'Dia da semana', width: 80 },
      { header: 'Marcações', width: 300 },
      { header: 'Horas', width: 60 },
      { header: 'Horas extras', width: 60 },
      { header: 'Situação', width: 145 },
    ],
    linhas,
    resumo,
  });
}

function csvRelatorioEquipe(linhasEquipe) {
  const header = ['Colaborador', 'Cargo', 'Horas trabalhadas', 'Horas extras', 'Atrasos', 'Saídas antecipadas', 'Faltas', 'Dias com pendência'];
  const linhas = linhasEquipe.map((l) => [
    l.funcionario.nome,
    l.funcionario.cargo || '-',
    minutesToHoursLabel(l.totais.minutosTrabalhados),
    minutesToHoursLabel(l.totais.minutosExtras),
    minutesToHoursLabel(l.totais.minutosAtraso),
    minutesToHoursLabel(l.totais.minutosSaidaAntecipada),
    String(l.totais.diasComFalta),
    String(l.totais.diasComInconsistencia),
  ]);
  return buildCsv(header, linhas);
}

function pdfRelatorioEquipe(linhasEquipe, periodoLabel) {
  const linhas = linhasEquipe.map((l) => [
    l.funcionario.nome,
    l.funcionario.cargo || '-',
    minutesToHoursLabel(l.totais.minutosTrabalhados),
    minutesToHoursLabel(l.totais.minutosExtras),
    minutesToHoursLabel(l.totais.minutosAtraso),
    minutesToHoursLabel(l.totais.minutosSaidaAntecipada),
    String(l.totais.diasComFalta),
    String(l.totais.diasComInconsistencia),
  ]);
  return gerarRelatorioPdf({
    titulo: 'Plano Semeador - Relatório Consolidado da Equipe',
    subtitulo: `Período: ${periodoLabel}`,
    landscape: true,
    colunas: [
      { header: 'Colaborador', width: 160 },
      { header: 'Cargo', width: 100 },
      { header: 'Horas trabalhadas', width: 95 },
      { header: 'Horas extras', width: 90 },
      { header: 'Atrasos', width: 75 },
      { header: 'Saídas antecipadas', width: 95 },
      { header: 'Faltas', width: 60 },
      { header: 'Pendências', width: 75 },
    ],
    linhas,
  });
}

module.exports = {
  csvRelatorioDetalhado,
  pdfRelatorioDetalhado,
  csvRelatorioEquipe,
  pdfRelatorioEquipe,
};
