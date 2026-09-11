'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

function isValidEmail(v) {
  return typeof v === 'string' && EMAIL_RE.test(v.trim());
}
function isValidLogin(v) {
  return typeof v === 'string' && LOGIN_RE.test(v.trim());
}
// Normaliza um login digitado pelo admin: minúsculo, sem espaços/acentos.
function normalizarLogin(v) {
  return String(v || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}
function isValidDateKey(v) {
  return typeof v === 'string' && DATE_RE.test(v);
}
function isValidHHMM(v) {
  return typeof v === 'string' && HHMM_RE.test(v);
}
function isValidDiasTrabalho(v) {
  if (typeof v !== 'string') return false;
  return v
    .split(',')
    .every((p) => ['0', '1', '2', '3', '4', '5', '6'].includes(p.trim()));
}
function isValidTipoEscala(v) {
  return v === 'semanal' || v === '12x36';
}
// Valida a estrutura de "horários por dia da semana" (escala personalizada):
// deve ter exatamente as 7 chaves de dia (0=domingo..6=sábado), cada uma com
// um horário válido quando ativa (folgas não precisam de horário).
function isValidHorariosSemana(arr) {
  if (!Array.isArray(arr) || arr.length !== 7) return false;
  const diasVistos = new Set();
  for (const item of arr) {
    if (!item || typeof item !== 'object') return false;
    const dia = item.dia;
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) return false;
    diasVistos.add(dia);
    if (item.ativo) {
      if (!isValidHHMM(item.entrada) || !isValidHHMM(item.saida)) return false;
      const carga = Number(item.carga_minutos);
      if (!Number.isFinite(carga) || carga < 0 || carga > 1440) return false;
    }
  }
  return diasVistos.size === 7;
}

module.exports = {
  isValidEmail,
  isValidLogin,
  normalizarLogin,
  isValidDateKey,
  isValidHHMM,
  isValidDiasTrabalho,
  isValidTipoEscala,
  isValidHorariosSemana,
};
