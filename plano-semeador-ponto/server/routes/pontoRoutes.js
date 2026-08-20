'use strict';

const { sendJson } = require('../httpUtils');
const { withAuth, withBody } = require('../routeHelpers');
const { RegistrosPonto } = require('../repository');
const db = require('../db');
const { localDateKey, localDateTimeBR, localTimeStr } = require('../utils/dateUtils');
const { proximoTipo, LABELS } = require('../pontoLogic');

function registrosDeHoje(funcionarioId) {
  const hojeKey = localDateKey(new Date());
  const recentes = db
    .prepare('SELECT * FROM registros_ponto WHERE funcionario_id = ? ORDER BY data_hora_utc DESC LIMIT 20')
    .all(funcionarioId);
  return recentes
    .filter((r) => localDateKey(new Date(r.data_hora_utc)) === hojeKey)
    .reverse();
}

function register(router) {
  router.get(
    '/api/ponto/hoje',
    withAuth(({ res, user }) => {
      const registros = registrosDeHoje(user.id);
      const ultimo = registros[registros.length - 1];
      const proximo = proximoTipo(ultimo ? ultimo.tipo : null);
      sendJson(res, 200, {
        registros: registros.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          label: LABELS[r.tipo],
          hora: localTimeStr(new Date(r.data_hora_utc)),
        })),
        proximoTipo: proximo,
        proximoLabel: LABELS[proximo],
      });
    })
  );

  router.post(
    '/api/ponto',
    withAuth(async ({ req, res, user }) => {
      const body = (await withBody(req, res)) || {};
      const registros = registrosDeHoje(user.id);
      const ultimo = registros[registros.length - 1];
      const tipo = proximoTipo(ultimo ? ultimo.tipo : null);
      const agora = new Date();
      const novo = RegistrosPonto.criar({
        funcionario_id: user.id,
        tipo,
        data_hora_utc: agora.toISOString(),
        observacao: (body.observacao || '').slice(0, 300),
      });
      sendJson(res, 201, {
        registro: {
          id: novo.id,
          tipo: novo.tipo,
          label: LABELS[novo.tipo],
          hora: localTimeStr(agora),
          dataHoraCompleta: localDateTimeBR(agora),
        },
      });
    })
  );
}

module.exports = { register };
