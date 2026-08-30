'use strict';

const config = require('../config');
const TZ = config.timezone;

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_NAMES_PT = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

// Converte uma Date (instante UTC) para as partes de calendario no fuso configurado.
function toZonedParts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    parts[p.type] = p.value;
  }
  // hour pode vir "24" em alguns runtimes para meia-noite; normaliza para 0
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute: parseInt(parts.minute, 10),
    second: parseInt(parts.second, 10),
    weekday: WEEKDAY_MAP[parts.weekday],
  };
}

// Chave de data local (YYYY-MM-DD) no fuso configurado, usada para agrupar registros por dia.
function localDateKey(date) {
  const p = toZonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function localTimeStr(date) {
  const p = toZonedParts(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function localDateTimeBR(date) {
  const p = toZonedParts(date);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function localDateBR(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

function weekdayName(weekdayIndex) {
  return WEEKDAY_NAMES_PT[weekdayIndex];
}

function parseHHMM(str) {
  const [h, m] = String(str || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

// Gera a lista de chaves de data (YYYY-MM-DD) entre duas datas, inclusive.
function dateKeyRange(startKey, endKey) {
  const keys = [];
  let [y, m, d] = startKey.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // meio-dia UTC evita problemas de DST
  const [ey, em, ed] = endKey.split('-').map(Number);
  const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  while (cursor <= end) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
    keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function weekdayOfDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  // meio-dia UTC para evitar problemas de fuso na leitura do dia da semana
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay();
}

function minutesDiff(dateA, dateB) {
  return Math.round((dateB.getTime() - dateA.getTime()) / 60000);
}

// Diferenca em dias corridos entre duas chaves de data (YYYY-MM-DD), podendo ser
// negativa se keyB for anterior a keyA. Usa meio-dia UTC (como dateKeyRange) para
// nao ser afetado por fuso/horario de verao. Usado pela escala 12x36, onde o dia
// de trabalho e definido pela paridade dos dias desde uma data de referencia.
function diasEntreDateKeys(keyA, keyB) {
  const [ay, am, ad] = keyA.split('-').map(Number);
  const [by, bm, bd] = keyB.split('-').map(Number);
  const dtA = Date.UTC(ay, am - 1, ad, 12, 0, 0);
  const dtB = Date.UTC(by, bm - 1, bd, 12, 0, 0);
  return Math.round((dtB - dtA) / 86400000);
}

function minutesToHoursLabel(totalMinutes) {
  const sign = totalMinutes < 0 ? '-' : '';
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
}

module.exports = {
  TZ,
  toZonedParts,
  localDateKey,
  localTimeStr,
  localDateTimeBR,
  localDateBR,
  weekdayName,
  parseHHMM,
  dateKeyRange,
  weekdayOfDateKey,
  minutesDiff,
  diasEntreDateKeys,
  minutesToHoursLabel,
};
