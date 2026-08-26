'use strict';

const { sendJson } = require('../httpUtils');
const { withAuth, withBody } = require('../routeHelpers');
const { RegistrosPonto } = require('../repository');
const { pool } = require('../db');
const { localDateKey, localDateTimeBR, localTimeStr } = require('../utils/dateUtils');
const { proximoTipo, LABELS } = require('../pontoLogic');

async function registrosDeHoje(funcionarioId) {
  const hojeKey = localDateKey(new Date());
  const { rows: recentes } = await pool.query(
    'SELECT * FROM registros_ponto WHERE funcionario_id = $1 ORDER BY data_hora_utc DESC LIMIT 20',
    [funcionarioId]
  );
  return recentes.filter((r) => localDateKey(new Date(r.data_hora_utc)) === hojeKey).reverse();
}

function register(router) {
  router.get(
    '/api/ponto/hoje',
    withAuth(async ({ res, user }) => {
      const registros = await registrosDeHoje(user.id);
      const ultimo = registros[registros.length - 1];
      const proximo = proximoTipo(ultimo ? ultimo.tipo : null, user.tem_intervalo);
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
      const registros = await registrosDeHoje(user.id);
      const ultimo = registros[registros.length - 1];
      const tipo = proximoTipo(ultimo ? ultimo.tipo : null, user.tem_intervalo);
      const agora = new Date();
      const novo = await RegistrosPonto.criar({
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
