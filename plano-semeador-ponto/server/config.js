'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.join(__dirname, '..');

// --- Carrega variaveis de um arquivo .env, se existir (sem dependencias externas) ---
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
loadDotEnv();

// DATA_DIR pode ser sobrescrito por uma variavel de ambiente — importante em
// hospedagens como o Render, onde um disco persistente e montado num caminho
// fixo (ex.: /var/data) fora da pasta do codigo, que e recriada a cada deploy.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --- Segredo usado para assinar os cookies de sessao ---
// Se nao houver SESSION_SECRET no ambiente, gera um e persiste em disco
// para que as sessoes nao sejam invalidadas a cada reinicio do servidor.
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretFile = path.join(DATA_DIR, 'session.secret');
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim();
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  timezone: process.env.TZ_NOME || 'America/Sao_Paulo',
  sessionSecret: getSessionSecret(),
  sessionMaxAgeMs: 1000 * 60 * 60 * 12, // 12 horas
  dbPath: path.join(DATA_DIR, 'ponto.db'),
  adminSeed: {
    nome: process.env.ADMIN_NOME || 'Administrador',
    email: process.env.ADMIN_EMAIL || 'admin@planosemeador.com.br',
    senha: process.env.ADMIN_SENHA || 'semeador2026',
  },
  nomeEmpresa: 'Plano Semeador',
  dataDir: DATA_DIR,
  rootDir: ROOT_DIR,
};

module.exports = config;
