'use strict';

const { Pool } = require('pg');
const config = require('./config');
const { hashPassword } = require('./auth');

if (!config.databaseUrl) {
  console.error('----------------------------------------------------');
  console.error('ERRO: a variavel de ambiente DATABASE_URL nao foi definida.');
  console.error('Configure DATABASE_URL com a connection string do seu banco');
  console.error('Postgres (ex.: criado gratuitamente em https://neon.tech) antes');
  console.error('de iniciar o servidor. Veja o README para o passo a passo.');
  console.error('----------------------------------------------------');
  process.exit(1);
}

// Provedores gratuitos de Postgres (Neon, Supabase, etc.) exigem conexao via
// TLS. rejectUnauthorized:false evita problemas com a cadeia de certificados
// intermediaria desses provedores; nao e necessario (nem correto) exigir TLS
// para um Postgres local de desenvolvimento.
const usaSslLocal = /localhost|127\.0\.0\.1/.test(config.databaseUrl);

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: usaSslLocal ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Erro inesperado numa conexao ociosa do pool do Postgres:', err);
});

// --- Migracao leve: adiciona colunas novas em bancos ja existentes, sem apagar dados ---
async function colunaExiste(tabela, coluna) {
  const { rows } = await pool.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
    [tabela, coluna]
  );
  return rows.length > 0;
}

// Gera um "login" curto (ex.: primeiro nome) a partir do nome completo, sem
// acentos/espacos, para servir como identificador de acesso mais facil que o
// e-mail. Usado tanto no seed do admin quanto na migracao de contas antigas.
function slugFromNome(nome) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || 'usuario';
  const semAcento = primeiro.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const limpo = semAcento.toLowerCase().replace(/[^a-z0-9]/g, '');
  return limpo || 'usuario';
}

async function criarSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      login TEXT,
      senha_hash TEXT NOT NULL,
      cargo TEXT DEFAULT '',
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      jornada_entrada TEXT NOT NULL DEFAULT '08:00',
      jornada_saida TEXT NOT NULL DEFAULT '18:00',
      carga_horaria_diaria_minutos INTEGER NOT NULL DEFAULT 480,
      tolerancia_minutos INTEGER NOT NULL DEFAULT 10,
      dias_trabalho TEXT NOT NULL DEFAULT '1,2,3,4,5',
      verificar_atraso BOOLEAN NOT NULL DEFAULT TRUE,
      verificar_saida_antecipada BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  if (!(await colunaExiste('funcionarios', 'verificar_atraso'))) {
    await pool.query('ALTER TABLE funcionarios ADD COLUMN verificar_atraso BOOLEAN NOT NULL DEFAULT TRUE');
  }
  if (!(await colunaExiste('funcionarios', 'verificar_saida_antecipada'))) {
    await pool.query('ALTER TABLE funcionarios ADD COLUMN verificar_saida_antecipada BOOLEAN NOT NULL DEFAULT TRUE');
  }
  if (!(await colunaExiste('funcionarios', 'login'))) {
    await pool.query('ALTER TABLE funcionarios ADD COLUMN login TEXT');
  }

  // Preenche o "login" para contas criadas antes dessa versao (que so tinham
  // e-mail). Gera a partir do primeiro nome, evitando colisao com logins ja
  // existentes.
  const { rows: semLogin } = await pool.query(
    'SELECT id, nome FROM funcionarios WHERE login IS NULL ORDER BY id ASC'
  );
  if (semLogin.length) {
    const { rows: existentes } = await pool.query('SELECT login FROM funcionarios WHERE login IS NOT NULL');
    const loginsUsados = new Set(existentes.map((r) => r.login));
    for (const row of semLogin) {
      const base = slugFromNome(row.nome);
      let candidato = base;
      let sufixo = 2;
      while (loginsUsados.has(candidato)) {
        candidato = `${base}${sufixo}`;
        sufixo += 1;
      }
      loginsUsados.add(candidato);
      await pool.query('UPDATE funcionarios SET login = $1 WHERE id = $2', [candidato, row.id]);
    }
  }

  // Garante unicidade do login daqui pra frente (idempotente a cada subida).
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_funcionarios_login ON funcionarios (login)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registros_ponto (
      id SERIAL PRIMARY KEY,
      funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida_intervalo','retorno_intervalo','saida')),
      data_hora_utc TEXT NOT NULL,
      observacao TEXT DEFAULT '',
      editado_por_admin BOOLEAN NOT NULL DEFAULT FALSE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_registros_funcionario_data
    ON registros_ponto (funcionario_id, data_hora_utc);
  `);
}

// --- Seed do administrador padrao, caso ainda nao exista nenhum usuario ---
async function seedAdmin() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM funcionarios');
  if (rows[0].total > 0) return;
  const { nome, email, senha } = config.adminSeed;
  const senha_hash = hashPassword(senha);
  const login = slugFromNome(nome);
  await pool.query(
    `INSERT INTO funcionarios
      (nome, email, login, senha_hash, cargo, is_admin, ativo, jornada_entrada, jornada_saida, carga_horaria_diaria_minutos, tolerancia_minutos, dias_trabalho)
     VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, '08:00', '18:00', 480, 10, '1,2,3,4,5')`,
    [nome, email, login, senha_hash, 'Administrador']
  );
  console.log('----------------------------------------------------');
  console.log('Usuario administrador criado automaticamente:');
  console.log('  Login : ' + login);
  console.log('  E-mail: ' + email);
  console.log('  Senha : ' + senha);
  console.log('  (troque a senha assim que possivel em "Meu perfil")');
  console.log('----------------------------------------------------');
}

// initDb() e chamada uma vez, na subida do servidor (ver server.js), antes de
// aceitar requisicoes. E seguro chama-la mais de uma vez (idempotente).
let initPromise = null;
function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      await criarSchema();
      await seedAdmin();
    })().catch((err) => {
      initPromise = null; // permite tentar novamente numa proxima chamada
      throw err;
    });
  }
  return initPromise;
}

module.exports = { pool, initDb };
