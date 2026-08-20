'use strict';

const db = require('./db');

function rowToFuncionarioPublico(row) {
  if (!row) return null;
  const { senha_hash, ...rest } = row;
  return {
    ...rest,
    is_admin: !!row.is_admin,
    ativo: !!row.ativo,
    verificar_atraso: row.verificar_atraso === undefined ? true : !!row.verificar_atraso,
    verificar_saida_antecipada: row.verificar_saida_antecipada === undefined ? true : !!row.verificar_saida_antecipada,
  };
}

const Funcionarios = {
  porEmail(email) {
    return db.prepare('SELECT * FROM funcionarios WHERE email = ?').get(String(email).toLowerCase().trim());
  },
  porId(id) {
    return db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
  },
  listarTodos({ incluirInativos = true } = {}) {
    const sql = incluirInativos
      ? 'SELECT * FROM funcionarios ORDER BY ativo DESC, nome ASC'
      : 'SELECT * FROM funcionarios WHERE ativo = 1 ORDER BY nome ASC';
    return db.prepare(sql).all();
  },
  criar(dados) {
    const stmt = db.prepare(`
      INSERT INTO funcionarios
        (nome, email, senha_hash, cargo, is_admin, ativo, jornada_entrada, jornada_saida, carga_horaria_diaria_minutos, tolerancia_minutos, dias_trabalho, verificar_atraso, verificar_saida_antecipada)
      VALUES (@nome, @email, @senha_hash, @cargo, @is_admin, @ativo, @jornada_entrada, @jornada_saida, @carga_horaria_diaria_minutos, @tolerancia_minutos, @dias_trabalho, @verificar_atraso, @verificar_saida_antecipada)
    `);
    const info = stmt.run({
      nome: dados.nome,
      email: String(dados.email).toLowerCase().trim(),
      senha_hash: dados.senha_hash,
      cargo: dados.cargo || '',
      is_admin: dados.is_admin ? 1 : 0,
      ativo: dados.ativo === false ? 0 : 1,
      jornada_entrada: dados.jornada_entrada || '08:00',
      jornada_saida: dados.jornada_saida || '18:00',
      carga_horaria_diaria_minutos: dados.carga_horaria_diaria_minutos || 480,
      tolerancia_minutos: dados.tolerancia_minutos != null ? dados.tolerancia_minutos : 10,
      dias_trabalho: dados.dias_trabalho || '1,2,3,4,5',
      verificar_atraso: dados.verificar_atraso === false ? 0 : 1,
      verificar_saida_antecipada: dados.verificar_saida_antecipada === false ? 0 : 1,
    });
    return this.porId(info.lastInsertRowid);
  },
  atualizar(id, dados) {
    const atual = this.porId(id);
    if (!atual) return null;
    const merged = { ...atual, ...dados };
    db.prepare(`
      UPDATE funcionarios SET
        nome = @nome,
        email = @email,
        cargo = @cargo,
        is_admin = @is_admin,
        ativo = @ativo,
        jornada_entrada = @jornada_entrada,
        jornada_saida = @jornada_saida,
        carga_horaria_diaria_minutos = @carga_horaria_diaria_minutos,
        tolerancia_minutos = @tolerancia_minutos,
        dias_trabalho = @dias_trabalho,
        verificar_atraso = @verificar_atraso,
        verificar_saida_antecipada = @verificar_saida_antecipada
      WHERE id = @id
    `).run({
      id,
      nome: merged.nome,
      email: String(merged.email).toLowerCase().trim(),
      cargo: merged.cargo || '',
      is_admin: merged.is_admin ? 1 : 0,
      ativo: merged.ativo ? 1 : 0,
      jornada_entrada: merged.jornada_entrada,
      jornada_saida: merged.jornada_saida,
      carga_horaria_diaria_minutos: merged.carga_horaria_diaria_minutos,
      tolerancia_minutos: merged.tolerancia_minutos,
      dias_trabalho: merged.dias_trabalho,
      verificar_atraso: merged.verificar_atraso === false || merged.verificar_atraso === 0 ? 0 : 1,
      verificar_saida_antecipada:
        merged.verificar_saida_antecipada === false || merged.verificar_saida_antecipada === 0 ? 0 : 1,
    });
    return this.porId(id);
  },
  atualizarSenha(id, senha_hash) {
    db.prepare('UPDATE funcionarios SET senha_hash = ? WHERE id = ?').run(senha_hash, id);
  },
  contarAdminsAtivos() {
    return db.prepare('SELECT COUNT(*) AS total FROM funcionarios WHERE is_admin = 1 AND ativo = 1').get().total;
  },
  publico: rowToFuncionarioPublico,
};

const RegistrosPonto = {
  criar({ funcionario_id, tipo, data_hora_utc, observacao = '', editado_por_admin = 0 }) {
    const info = db
      .prepare(
        'INSERT INTO registros_ponto (funcionario_id, tipo, data_hora_utc, observacao, editado_por_admin) VALUES (?, ?, ?, ?, ?)'
      )
      .run(funcionario_id, tipo, data_hora_utc, observacao, editado_por_admin ? 1 : 0);
    return db.prepare('SELECT * FROM registros_ponto WHERE id = ?').get(info.lastInsertRowid);
  },
  ultimoDoFuncionario(funcionario_id) {
    return db
      .prepare('SELECT * FROM registros_ponto WHERE funcionario_id = ? ORDER BY data_hora_utc DESC LIMIT 1')
      .get(funcionario_id);
  },
  doFuncionarioEntrePeriodo(funcionario_id, inicioUtcIso, fimUtcIso) {
    return db
      .prepare(
        'SELECT * FROM registros_ponto WHERE funcionario_id = ? AND data_hora_utc >= ? AND data_hora_utc <= ? ORDER BY data_hora_utc ASC'
      )
      .all(funcionario_id, inicioUtcIso, fimUtcIso);
  },
  todosEntrePeriodo(inicioUtcIso, fimUtcIso) {
    return db
      .prepare(
        'SELECT * FROM registros_ponto WHERE data_hora_utc >= ? AND data_hora_utc <= ? ORDER BY funcionario_id ASC, data_hora_utc ASC'
      )
      .all(inicioUtcIso, fimUtcIso);
  },
  remover(id) {
    db.prepare('DELETE FROM registros_ponto WHERE id = ?').run(id);
  },
  porId(id) {
    return db.prepare('SELECT * FROM registros_ponto WHERE id = ?').get(id);
  },
};

module.exports = { Funcionarios, RegistrosPonto };
