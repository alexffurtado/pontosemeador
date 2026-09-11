'use strict';

const { sendJson } = require('../httpUtils');
const { withAdmin, withBody } = require('../routeHelpers');
const { Feriados } = require('../repository');
const { isValidDateKey } = require('../validation');

// Calendário único de feriados (vale pra todos os colaboradores) — gerenciado
// só por administradores. Ver calcularRelatorio() em server/utils/relatorioUtils.js
// pra como isso afeta o cálculo de horas.
function register(router) {
  router.get(
    '/api/feriados',
    withAdmin(async ({ res }) => {
      const feriados = await Feriados.listarTodos();
      sendJson(res, 200, { feriados });
    })
  );

  router.post(
    '/api/feriados',
    withAdmin(async ({ req, res }) => {
      const body = await withBody(req, res);
      if (!body) return;
      const data = String(body.data || '').trim();
      const descricao = String(body.descricao || '').trim();
      if (!isValidDateKey(data)) {
        return sendJson(res, 400, { erro: 'Informe uma data válida (AAAA-MM-DD).' });
      }
      if (descricao.length > 200) {
        return sendJson(res, 400, { erro: 'Descrição muito longa (máximo 200 caracteres).' });
      }
      if (await Feriados.porData(data)) {
        return sendJson(res, 409, { erro: 'Já existe um feriado cadastrado nessa data.' });
      }
      const criado = await Feriados.criar({ data, descricao });
      sendJson(res, 201, { feriado: criado });
    })
  );

  router.delete(
    '/api/feriados/:id',
    withAdmin(async ({ res, params }) => {
      const id = parseInt(params.id, 10);
      const removido = await Feriados.remover(id);
      if (!removido) return sendJson(res, 404, { erro: 'Feriado não encontrado.' });
      sendJson(res, 200, { ok: true });
    })
  );
}

module.exports = { register };
