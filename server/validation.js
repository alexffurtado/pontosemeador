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
// Normaliza um login digitado pelo admin: minusculo, sem espacos/acentos.
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

module.exports = {
  isValidEmail,
  isValidLogin,
  normalizarLogin,
  isValidDateKey,
  isValidHHMM,
  isValidDiasTrabalho,
};
