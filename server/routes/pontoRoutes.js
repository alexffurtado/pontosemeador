'use strict';

const { sendJson } = require('../httpUtils');
const { withAuth, withBody } = require('../routeHelpers');
const { RegistrosPonto } = require('../repository');
const { pool } = require('../db');
const { localDateKey, localDateTimeBR, localTimeStr } = require('../utils/dateUtils');
const { proximoTipo, LABELS, SEQUENCIA, SEQUENCIA_SEM_INTERVALO } = require('../pontoLogic');

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
      const sequencia = user.tem_intervalo === false ? SEQUENCIA_SEM_INTERVALO : SEQUENCIA;
      sendJson(res, 200, {
        registros: registros.map((r) => ({
          id: r.id,
          tipo: r.tipo,
          label: LABELS[r.tipo],
          hora: localTimeStr(new Date(r.data_hora_utc)),
        })),
        proximoTipo: proximo,
        proximoLabel: LABELS[proximo],
        // Lista de tipos que o colaborador pode escolher manualmente (usado
        // quando ele esqueceu de bater algum passo e precisa corrigir a
        // sequencia sozinho, em vez de seguir cegamente o botao automatico).
        tiposDisponiveis: sequencia.map((tipo) => ({ tipo, label: LABELS[tipo] })),
      });
    })
  );

  router.post(
    '/api/ponto',
    withAuth(async ({ req, res, user }) => {
      const body = (await withBody(req, res)) || {};
      const registros = await registrosDeHoje(user.id);
      const ultimo = registros[registros.length - 1];
      const tipoAutomatico = proximoTipo(ultimo ? ultimo.tipo : null, user.tem_intervalo);
      let tipo = tipoAutomatico;
      // Permite o colaborador escolher manualmente o tipo (ex.: esqueceu de
      // bater "retorno do intervalo" e precisa ir direto pra "saida" ao final
      // do expediente, em vez de ficar preso na sequencia automatica).
      if (body.tipoManual) {
        const sequencia = user.tem_intervalo === false ? SEQUENCIA_SEM_INTERVALO : SEQUENCIA;
        if (!sequencia.includes(body.tipoManual)) {
          return sendJson(res, 400, { erro: 'Tipo de marcacao invalido.' });
        }
        tipo = body.tipoManual;
      }
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
