'use strict';

const { parseCookies, setCookie } = require('./httpUtils');
const { verifySessionToken, createSessionToken } = require('./auth');
const { Funcionarios } = require('./repository');
const config = require('./config');

const COOKIE_NAME = 'ps_sessao';

function getUserFromReq(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  const data = verifySessionToken(token);
  if (!data || !data.uid) return null;
  const user = Funcionarios.porId(data.uid);
  if (!user || !user.ativo) return null;
  return user;
}

function login(res, funcionarioId) {
  const token = createSessionToken(funcionarioId);
  setCookie(res, COOKIE_NAME, token, { maxAgeMs: config.sessionMaxAgeMs });
}

function logout(res) {
  setCookie(res, COOKIE_NAME, '', { expiresNow: true });
}

module.exports = { getUserFromReq, login, logout, COOKIE_NAME };
