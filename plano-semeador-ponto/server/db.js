'use strict';

const { DatabaseSync } = require('node:sqlite');
const config = require('./config');
const { hashPassword } = require('./auth');

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  cargo TEXT DEFAULT '',
  is_admin INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  jornada_entrada TEXT NOT NULL DEFAULT '08:00',
  jornada_saida TEXT NOT NULL DEFAULT '18:00',
  carga_horaria_diaria_minutos INTEGER NOT NULL DEFAULT 480,
  tolerancia_minutos INTEGER NOT NULL DEFAULT 10,
  dias_trabalho TEXT NOT NULL DEFAULT '1,2,3,4,5',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS registros_ponto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida_intervalo','retorno_intervalo','saida')),
  data_hora_utc TEXT NOT NULL,
  observacao TEXT DEFAULT '',
  editado_por_admin INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);
`);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_registros_funcionario_data
ON registros_ponto (funcionario_id, data_hora_utc);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS sessoes (
  token_id TEXT PRIMARY KEY,
  funcionario_id INTEGER NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em TEXT NOT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);
`);

// --- Seed do administrador padrao, caso ainda nao exista nenhum usuario ---
function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS total FROM funcionarios').get().total;
  if (count > 0) return;
  const { nome, email, senha } = config.adminSeed;
  const senha_hash = hashPassword(senha);
  db.prepare(`
    INSERT INTO funcionarios
      (nome, email, senha_hash, cargo, is_admin, ativo, jornada_entrada, jornada_saida, carga_horaria_diaria_minutos, tolerancia_minutos, dias_trabalho)
    VALUES (?, ?, ?, ?, 1, 1, '08:00', '18:00', 480, 10, '1,2,3,4,5')
  `).run(nome, email, senha_hash, 'Administrador');
  console.log('----------------------------------------------------');
  console.log('Usuario administrador criado automaticamente:');
  console.log('  E-mail: ' + email);
  console.log('  Senha : ' + senha);
  console.log('  (troque a senha assim que possivel em "Meu perfil")');
  console.log('----------------------------------------------------');
}
seedAdmin();

module.exports = db;
