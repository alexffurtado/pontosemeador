'use strict';

const { pool } = require('./db');
const { normalizarLogin } = require('./validation');

function slugFromNome(nome) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || 'usuario';
  const limpo = normalizarLogin(primeiro).replace(/[^a-z0-9]/g, '');
  return limpo || 'usuario';
}

function rowToFuncionarioPublico(row) {
  if (!row) return null;
  const { senha_hash, ...rest } = row;
  return {
    ...rest,
    is_admin: !!row.is_admin,
    ativo: !!row.ativo,
    verificar_atraso: row.verificar_atraso === undefined || row.verificar_atraso === null ? true : !!row.verificar_atraso,
    verificar_saida_antecipada:
      row.verificar_saida_antecipada === undefined || row.verificar_saida_antecipada === null
        ? true
        : !!row.verificar_saida_antecipada,
    tem_intervalo: row.tem_intervalo === undefined || row.tem_intervalo === null ? true : !!row.tem_intervalo,
    tipo_escala: row.tipo_escala || 'semanal',
    escala_data_referencia: row.escala_data_referencia || null,
    horario_personalizado_semana: !!row.horario_personalizado_semana,
    // node-postgres já desserializa jsonb em objeto/array JS automaticamente na leitura.
    horarios_semana: row.horarios_semana || null,
  };
}

const Funcionarios = {
  async porEmail(email) {
    const { rows } = await pool.query('SELECT * FROM funcionarios WHERE email = $1', [
      String(email).toLowerCase().trim(),
    ]);
    return rows[0] || null;
  },
  async porLogin(login) {
    const { rows } = await pool.query('SELECT * FROM funcionarios WHERE login = $1', [normalizarLogin(login)]);
    return rows[0] || null;
  },
  async porId(id) {
    const { rows } = await pool.query('SELECT * FROM funcionarios WHERE id = $1', [id]);
    return rows[0] || null;
  },
  // Gera um login único (ex.: "joao", "joao2", ...) a partir do nome. Usado
  // quando o admin cria/edita um colaborador sem informar um login manualmente.
  async gerarLoginUnico(nome, excluirId = null) {
    const base = slugFromNome(nome);
    let candidato = base;
    let sufixo = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existente = await this.porLogin(candidato);
      if (!existente || (excluirId != null && existente.id === excluirId)) return candidato;
      candidato = `${base}${sufixo}`;
      sufixo += 1;
    }
  },
  async listarTodos({ incluirInativos = true } = {}) {
    const sql = incluirInativos
      ? 'SELECT * FROM funcionarios ORDER BY ativo DESC, nome ASC'
      : 'SELECT * FROM funcionarios WHERE ativo = TRUE ORDER BY nome ASC';
    const { rows } = await pool.query(sql);
    return rows;
  },
  async criar(dados) {
    const login = dados.login ? normalizarLogin(dados.login) : await this.gerarLoginUnico(dados.nome);
    const { rows } = await pool.query(
      `INSERT INTO funcionarios
        (nome, email, login, senha_hash, cargo, is_admin, ativo, jornada_entrada, jornada_saida, carga_horaria_diaria_minutos, tolerancia_minutos, dias_trabalho, verificar_atraso, verificar_saida_antecipada, tem_intervalo, tipo_escala, escala_data_referencia, horario_personalizado_semana, horarios_semana)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        dados.nome,
        String(dados.email).toLowerCase().trim(),
        login,
        dados.senha_hash,
        dados.cargo || '',
        !!dados.is_admin,
        dados.ativo === false ? false : true,
        dados.jornada_entrada || '08:00',
        dados.jornada_saida || '18:00',
        dados.carga_horaria_diaria_minutos || 480,
        dados.tolerancia_minutos != null ? dados.tolerancia_minutos : 10,
        dados.dias_trabalho || '1,2,3,4,5',
        dados.verificar_atraso === false ? false : true,
        dados.verificar_saida_antecipada === false ? false : true,
        dados.tem_intervalo === false ? false : true,
        dados.tipo_escala === '12x36' ? '12x36' : 'semanal',
        dados.tipo_escala === '12x36' ? dados.escala_data_referencia || null : null,
        !!dados.horario_personalizado_semana,
        dados.horario_personalizado_semana ? JSON.stringify(dados.horarios_semana) : null,
      ]
    );
    return rows[0];
  },
  async atualizar(id, dados) {
    const atual = await this.porId(id);
    if (!atual) return null;
    const merged = { ...atual, ...dados };
    const login = dados.login ? normalizarLogin(dados.login) : atual.login || (await this.gerarLoginUnico(merged.nome, id));
    const { rows } = await pool.query(
      `UPDATE funcionarios SET
        nome = $1,
        email = $2,
        login = $3,
        cargo = $4,
        is_admin = $5,
        ativo = $6,
        jornada_entrada = $7,
        jornada_saida = $8,
        carga_horaria_diaria_minutos = $9,
        tolerancia_minutos = $10,
        dias_trabalho = $11,
        verificar_atraso = $12,
        verificar_saida_antecipada = $13,
        tem_intervalo = $14,
        tipo_escala = $15,
        escala_data_referencia = $16,
        horario_personalizado_semana = $17,
        horarios_semana = $18
      WHERE id = $19
      RETURNING *`,
      [
        merged.nome,
        String(merged.email).toLowerCase().trim(),
        login,
        merged.cargo || '',
        !!merged.is_admin,
        !!merged.ativo,
        merged.jornada_entrada,
        merged.jornada_saida,
        merged.carga_horaria_diaria_minutos,
        merged.tolerancia_minutos,
        merged.dias_trabalho,
        merged.verificar_atraso === false || merged.verificar_atraso === 0 ? false : true,
        merged.verificar_saida_antecipada === false || merged.verificar_saida_antecipada === 0 ? false : true,
        merged.tem_intervalo === false || merged.tem_intervalo === 0 ? false : true,
        merged.tipo_escala === '12x36' ? '12x36' : 'semanal',
        merged.tipo_escala === '12x36' ? merged.escala_data_referencia || null : null,
        !!merged.horario_personalizado_semana,
        merged.horario_personalizado_semana ? JSON.stringify(merged.horarios_semana) : null,
        id,
      ]
    );
    return rows[0];
  },
  async atualizarSenha(id, senha_hash) {
    await pool.query('UPDATE funcionarios SET senha_hash = $1 WHERE id = $2', [senha_hash, id]);
  },
  async contarAdminsAtivos() {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM funcionarios WHERE is_admin = TRUE AND ativo = TRUE'
    );
    return rows[0].total;
  },
  publico: rowToFuncionarioPublico,
};

const RegistrosPonto = {
  async criar({ funcionario_id, tipo, data_hora_utc, observacao = '', editado_por_admin = 0 }) {
    const { rows } = await pool.query(
      `INSERT INTO registros_ponto (funcionario_id, tipo, data_hora_utc, observacao, editado_por_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [funcionario_id, tipo, data_hora_utc, observacao, !!editado_por_admin]
    );
    return rows[0];
  },
  async ultimoDoFuncionario(funcionario_id) {
    const { rows } = await pool.query(
      'SELECT * FROM registros_ponto WHERE funcionario_id = $1 ORDER BY data_hora_utc DESC LIMIT 1',
      [funcionario_id]
    );
    return rows[0] || null;
  },
  async doFuncionarioEntrePeriodo(funcionario_id, inicioUtcIso, fimUtcIso) {
    const { rows } = await pool.query(
      'SELECT * FROM registros_ponto WHERE funcionario_id = $1 AND data_hora_utc >= $2 AND data_hora_utc <= $3 ORDER BY data_hora_utc ASC',
      [funcionario_id, inicioUtcIso, fimUtcIso]
    );
    return rows;
  },
  async todosEntrePeriodo(inicioUtcIso, fimUtcIso) {
    const { rows } = await pool.query(
      'SELECT * FROM registros_ponto WHERE data_hora_utc >= $1 AND data_hora_utc <= $2 ORDER BY funcionario_id ASC, data_hora_utc ASC',
      [inicioUtcIso, fimUtcIso]
    );
    return rows;
  },
  async remover(id) {
    await pool.query('DELETE FROM registros_ponto WHERE id = $1', [id]);
  },
  async porId(id) {
    const { rows } = await pool.query('SELECT * FROM registros_ponto WHERE id = $1', [id]);
    return rows[0] || null;
  },
};

const Justificativas = {
  async criar({ funcionario_id, data_referencia, tipo = 'outro', descricao }) {
    const { rows } = await pool.query(
      `INSERT INTO justificativas (funcionario_id, data_referencia, tipo, descricao)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [funcionario_id, data_referencia, tipo, descricao]
    );
    return rows[0];
  },
  async listarDoFuncionario(funcionario_id, { limit = 50 } = {}) {
    const { rows } = await pool.query(
      'SELECT * FROM justificativas WHERE funcionario_id = $1 ORDER BY data_referencia DESC, criado_em DESC LIMIT $2',
      [funcionario_id, limit]
    );
    return rows;
  },
  async porId(id) {
    const { rows } = await pool.query('SELECT * FROM justificativas WHERE id = $1', [id]);
    return rows[0] || null;
  },
  async remover(id, funcionario_id) {
    const { rowCount } = await pool.query(
      'DELETE FROM justificativas WHERE id = $1 AND funcionario_id = $2',
      [id, funcionario_id]
    );
    return rowCount > 0;
  },
};

module.exports = { Funcionarios, RegistrosPonto, Justificativas };
