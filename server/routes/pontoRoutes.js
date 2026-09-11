'use strict';

const { sendJson } = require('../httpUtils');
const { withAuth, withBody } = require('../routeHelpers');
const { RegistrosPonto } = require('../repository');
const { pool } = require('../db');
const { localDateKey, localDateTimeBR, localTimeStr, toZonedParts } = require('../utils/dateUtils');
const { proximoTipo, LABELS, SEQUENCIA, SEQUENCIA_SEM_INTERVALO } = require('../pontoLogic');

// Decide se HOJE (agora) o colaborador usa a sequencia com intervalo (4
// passos) ou sem intervalo (2 passos). Normalmente e uma configuracao unica
// do colaborador (funcionario.tem_intervalo) — mas quem usa horario
// personalizado por dia da semana pode ter um dia sem almoco (ex.: sabado de
// meio periodo) mesmo tendo intervalo nos demais dias, entao nesse caso o
// valor do dia da semana atual manda.
function temIntervaloAgora(user) {
  if (user.horario_personalizado_semana && Array.isArray(user.horarios_semana)) {
    const weekday = toZonedParts(new Date()).weekday;
    const cfg = user.horarios_semana.find((h) => h.dia === weekday);
    if (cfg && cfg.ativo) return cfg.tem_intervalo !== false;
  }
  return user.tem_intervalo !== false;
}

// Tipos que deixam uma sessao "aberta" (a pessoa esta em algum momento de
// trabalho, aguardando a proxima marcacao) — usado pra saber se ha um
// plantao/sobreaviso ainda em aberto de um dia anterior.
const TIPOS_SESSAO_ABERTA = new Set(['entrada', 'retorno_intervalo']);

// Retorna tanto as marcacoes de HOJE (pra exibir na linha do tempo) quanto a
// ultima marcacao no GERAL, de qualquer dia (pra decidir corretamente qual e
// a proxima marcacao esperada). As duas coisas sao diferentes de proposito:
// um plantonista 12x36 que entra as 19h e so sai as 7h do dia seguinte tem,
// as 7h, ZERO marcacoes "de hoje" ainda — mas ja existe uma sessao aberta
// desde ontem que precisa ser fechada com "saida" antes de qualquer "entrada"
// nova. Filtrar so por "hoje" (como esse codigo fazia antes) faz o sistema
// esquecer dessa entrada de ontem e oferecer "entrada" de novo por engano.
async function buscarMarcacoes(funcionarioId) {
  const hojeKey = localDateKey(new Date());
  const { rows: recentes } = await pool.query(
    'SELECT * FROM registros_ponto WHERE funcionario_id = $1 ORDER BY data_hora_utc DESC LIMIT 20',
    [funcionarioId]
  );
  const ultimoGeral = recentes[0] || null;
  const doDiaAtual = recentes.filter((r) => localDateKey(new Date(r.data_hora_utc)) === hojeKey).reverse();
  return { ultimoGeral, doDiaAtual };
}

function register(router) {
  router.get(
    '/api/ponto/hoje',
    withAuth(async ({ res, user }) => {
      const { ultimoGeral, doDiaAtual } = await buscarMarcacoes(user.id);
      const temIntervaloHoje = temIntervaloAgora(user);
      const proximo = proximoTipo(ultimoGeral ? ultimoGeral.tipo : null, temIntervaloHoje);
      const sequencia = temIntervaloHoje === false ? SEQUENCIA_SEM_INTERVALO : SEQUENCIA;

      const hojeKey = localDateKey(new Date());
      const veioDeOutroDia = !!ultimoGeral && localDateKey(new Date(ultimoGeral.data_hora_utc)) !== hojeKey;
      const sessaoAbertaDeOutroDia = veioDeOutroDia && TIPOS_SESSAO_ABERTA.has(ultimoGeral.tipo);

      sendJson(res, 200, {
        registros: doDiaAtual.map((r) => ({
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
        // Avisa a tela quando existe um plantao/sobreaviso ainda aberto desde
        // um dia anterior, pra mostrar um aviso claro em vez do colaborador
        // ficar em duvida sobre o que o botao vai registrar.
        sessaoAbertaDeOutroDia,
        sessaoAbertaDesde: sessaoAbertaDeOutroDia ? localDateTimeBR(new Date(ultimoGeral.data_hora_utc)) : null,
      });
    })
  );

  router.post(
    '/api/ponto',
    withAuth(async ({ req, res, user }) => {
      const body = (await withBody(req, res)) || {};
      const { ultimoGeral } = await buscarMarcacoes(user.id);
      const temIntervaloHoje = temIntervaloAgora(user);
      const tipoAutomatico = proximoTipo(ultimoGeral ? ultimoGeral.tipo : null, temIntervaloHoje);
      let tipo = tipoAutomatico;
      // Permite o colaborador escolher manualmente o tipo (ex.: esqueceu de
      // bater "retorno do intervalo" e precisa ir direto pra "saida" ao final
      // do expediente, em vez de ficar preso na sequencia automatica).
      if (body.tipoManual) {
        const sequencia = temIntervaloHoje === false ? SEQUENCIA_SEM_INTERVALO : SEQUENCIA;
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
