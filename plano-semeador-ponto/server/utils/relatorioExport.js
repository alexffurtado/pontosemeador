'use strict';

const { buildCsv } = require('./csv');
const { gerarRelatorioPdf } = require('./pdf');
const { localDateBR, weekdayName, weekdayOfDateKey, minutesToHoursLabel } = require('./dateUtils');

function statusDoDia(dia) {
  if (dia.falta) return 'FALTA';
  if (dia.eventos.length === 0) return dia.diaUtil ? '-' : 'Folga';
  const partes = [];
  if (dia.atrasoMin > 0) partes.push(`Atraso ${minutesToHoursLabel(dia.atrasoMin)}`);
  if (dia.saidaAntecipadaMin > 0) partes.push(`Saida antecipada ${minutesToHoursLabel(dia.saidaAntecipadaMin)}`);
  if (dia.inconsistente) partes.push('Marcacao incompleta');
  if (partes.length === 0) return 'OK';
  return partes.join(' | ');
}

function eventoHora(dia, tipo) {
  const ev = dia.eventos.find((e) => e.tipo === tipo);
  return ev ? ev.hora : '';
}

function linhasDetalhado(dias) {
  return dias.map((dia) => [
    localDateBR(dia.data),
    weekdayName(weekdayOfDateKey(dia.data)),
    eventoHora(dia, 'entrada'),
    eventoHora(dia, 'saida_intervalo'),
    eventoHora(dia, 'retorno_intervalo'),
    eventoHora(dia, 'saida'),
    minutesToHoursLabel(dia.minutosTrabalhados),
    statusDoDia(dia),
  ]);
}

const COLUNAS_DETALHADO_HEADER = ['Data', 'Dia da semana', 'Entrada', 'Saida intervalo', 'Retorno intervalo', 'Saida', 'Horas', 'Situacao'];

function csvRelatorioDetalhado(funcionario, dias, totais) {
  const linhas = linhasDetalhado(dias);
  linhas.push([]);
  linhas.push(['Total de horas trabalhadas', minutesToHoursLabel(totais.minutosTrabalhados)]);
  linhas.push(['Total de atrasos', minutesToHoursLabel(totais.minutosAtraso)]);
  linhas.push(['Total de saidas antecipadas', minutesToHoursLabel(totais.minutosSaidaAntecipada)]);
  linhas.push(['Faltas', String(totais.diasComFalta)]);
  linhas.push(['Dias com marcacao incompleta', String(totais.diasComInconsistencia)]);
  return buildCsv(COLUNAS_DETALHADO_HEADER, linhas);
}

function pdfRelatorioDetalhado(funcionario, dias, totais, periodoLabel) {
  const linhas = linhasDetalhado(dias);
  const resumo = [
    `Total de horas trabalhadas: ${minutesToHoursLabel(totais.minutosTrabalhados)}`,
    `Total de atrasos: ${minutesToHoursLabel(totais.minutosAtraso)}`,
    `Total de saidas antecipadas: ${minutesToHoursLabel(totais.minutosSaidaAntecipada)}`,
    `Faltas: ${totais.diasComFalta} dia(s)`,
  ];
  return gerarRelatorioPdf({
    titulo: 'Plano Semeador - Relatorio de Ponto',
    subtitulo: `Colaborador: ${funcionario.nome}  |  Cargo: ${funcionario.cargo || '-'}  |  Periodo: ${periodoLabel}`,
    landscape: true,
    colunas: [
      { header: 'Data', width: 70 },
      { header: 'Dia da semana', width: 95 },
      { header: 'Entrada', width: 65 },
      { header: 'Saida interv.', width: 90 },
      { header: 'Retorno interv.', width: 95 },
      { header: 'Saida', width: 65 },
      { header: 'Horas', width: 65 },
      { header: 'Situacao', width: 225 },
    ],
    linhas,
    resumo,
  });
}

function csvRelatorioEquipe(linhasEquipe) {
  const header = ['Colaborador', 'Cargo', 'Horas trabalhadas', 'Atrasos', 'Saidas antecipadas', 'Faltas', 'Dias com pendencia'];
  const linhas = linhasEquipe.map((l) => [
    l.funcionario.nome,
    l.funcionario.cargo || '-',
    minutesToHoursLabel(l.totais.minutosTrabalhados),
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
    minutesToHoursLabel(l.totais.minutosAtraso),
    minutesToHoursLabel(l.totais.minutosSaidaAntecipada),
    String(l.totais.diasComFalta),
    String(l.totais.diasComInconsistencia),
  ]);
  return gerarRelatorioPdf({
    titulo: 'Plano Semeador - Relatorio Consolidado da Equipe',
    subtitulo: `Periodo: ${periodoLabel}`,
    landscape: true,
    colunas: [
      { header: 'Colaborador', width: 180 },
      { header: 'Cargo', width: 120 },
      { header: 'Horas trabalhadas', width: 110 },
      { header: 'Atrasos', width: 90 },
      { header: 'Saidas antecipadas', width: 110 },
      { header: 'Faltas', width: 70 },
      { header: 'Pendencias', width: 90 },
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
