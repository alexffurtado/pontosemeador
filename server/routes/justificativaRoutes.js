'use strict';

const { sendJson } = require('../httpUtils');
const { withAuth, withAdmin, withBody } = require('../routeHelpers');
const { Justificativas, Funcionarios } = require('../repository');
const { isValidDateKey } = require('../validation');

const TIPOS_VALIDOS = new Set(['atraso', 'falta', 'saida_antecipada', 'outro']);

const TIPO_LABEL_JUSTIFICATIVA = {
  atraso: 'Atraso',
  falta: 'Falta',
  saida_antecipada: 'Saida antecipada',
  outro: 'Outro',
};

function register(router) {
  // ---------- Colaborador: suas proprias justificativas ----------
  router.get(
    '/api/justificativas',
    withAuth(async ({ res, user }) => {
      const lista = await Justificativas.listarDoFuncionario(user.id);
      sendJson(res, 200, { justificativas: lista });
    })
  );

  router.post(
    '/api/justificativas',
    withAuth(async ({ req, res, user }) => {
      const body = (await withBody(req, res)) || {};
      const data_referencia = body.data_referencia;
      const tipo = TIPOS_VALIDOS.has(body.tipo) ? body.tipo : 'outro';
      const descricao = String(body.descricao || '').trim();
      if (!isValidDateKey(data_referencia)) {
        return sendJson(res, 400, { erro: 'Informe a data a que se refere a justificativa.' });
      }
      if (!descricao || descricao.length < 5) {
        return sendJson(res, 400, { erro: 'Descreva o motivo com pelo menos 5 caracteres.' });
      }
      if (descricao.length > 2000) {
        return sendJson(res, 400, { erro: 'Descricao muito longa (maximo 2000 caracteres).' });
      }
      const criada = await Justificativas.criar({
        funcionario_id: user.id,
        data_referencia,
        tipo,
        descricao,
      });
      sendJson(res, 201, { justificativa: criada });
    })
  );

  // Usado para montar a folha de impressao (o proprio colaborador ou um admin podem ver).
  router.get(
    '/api/justificativas/:id',
    withAuth(async ({ res, params, user }) => {
      const id = parseInt(params.id, 10);
      const justificativa = await Justificativas.porId(id);
      if (!justificativa) return sendJson(res, 404, { erro: 'Justificativa nao encontrada.' });
      if (justificativa.funcionario_id !== user.id && !user.is_admin) {
        return sendJson(res, 403, { erro: 'Sem permissao para ver esta justificativa.' });
      }
      const dono = justificativa.funcionario_id === user.id ? user : await Funcionarios.porId(justificativa.funcionario_id);
      sendJson(res, 200, {
        justificativa,
        tipoLabel: TIPO_LABEL_JUSTIFICATIVA[justificativa.tipo] || 'Outro',
        funcionario: dono ? { nome: dono.nome, cargo: dono.cargo } : null,
      });
    })
  );

  router.delete(
    '/api/justificativas/:id',
    withAuth(async ({ res, params, user }) => {
      const id = parseInt(params.id, 10);
      const justificativa = await Justificativas.porId(id);
      if (!justificativa) return sendJson(res, 404, { erro: 'Justificativa nao encontrada.' });
      if (justificativa.funcionario_id !== user.id && !user.is_admin) {
        return sendJson(res, 403, { erro: 'Sem permissao para remover esta justificativa.' });
      }
      await Justificativas.remover(id, justificativa.funcionario_id);
      sendJson(res, 200, { ok: true });
    })
  );

  // ---------- Administracao: acompanhar justificativas de um colaborador ----------
  router.get(
    '/api/funcionarios/:id/justificativas',
    withAdmin(async ({ res, params }) => {
      const id = parseInt(params.id, 10);
      const alvo = await Funcionarios.porId(id);
      if (!alvo) return sendJson(res, 404, { erro: 'Colaborador nao encontrado.' });
      const lista = await Justificativas.listarDoFuncionario(id);
      sendJson(res, 200, { justificativas: lista });
    })
  );
}

module.exports = { register, TIPO_LABEL_JUSTIFICATIVA };
