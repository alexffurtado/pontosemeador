'use strict';

const crypto = require('node:crypto');
const config = require('./config');

const SCRYPT_KEYLEN = 64;

// ---------- Senhas ----------
function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plainPassword, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const attempted = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
  if (attempted.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(attempted, hashBuffer);
}

// ---------- Tokens de sessao assinados (HMAC), guardados em cookie httpOnly ----------
function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadObj) {
  const payload = base64url(JSON.stringify(payloadObj));
  const signature = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function createSessionToken(funcionarioId) {
  const exp = Date.now() + config.sessionMaxAgeMs;
  return sign({ uid: funcionarioId, exp });
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken: verify,
};
