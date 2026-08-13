'use strict';

const { sendJson } = require('../httpUtils');
const { withAdmin, withBody } = require('../routeHelpers');
const { Funcionarios, RegistrosPonto } = require('../repository');
const { hashPassword } = require('../auth');
const { isValidEmail, isValidHHMM, isValidDiasTrabalho, isValidDateKey } = require('../validation');
const { relatorioDoFuncionario, periodoPadrao } = require('./relatorioRoutes');
const { localDateBR } = require('../utils/dateUtils');
const { csvRelatorioDetalhado, pdfRelatorioDetalhado } = require('../utils/relatorioExport');
const { LABELS } = require('../pontoLogic');

function validarDadosFuncionario(body, { exigirSenha }) {
  const erros = [];
  const nome = (body.nome || '').trim();
  const email = (body.email || '').trim();
  if (!nome || nome.length < 2) erros.push('Informe um nome valido.');
  if (!isValidEmail(email)) erros.push('Informe um e-mail valido.');
  if (exigirSenha && (!body.senha || String(body.senha).length < 6)) {
    erros.push('A senha deve ter pelo menos 6 caracteres.');
  }
  const jornada_entrada = body.jornada_entrada || '08:00';
  const jornada_saida = body.jornada_saida || '18:00';
  if (!isValidHHMM(jornada_entrada)) erros.push('Horario de entrada invalido.');
  if (!isValidHHMM(jornada_saida)) erros.push('Horario de saida invalido.');
  const dias_trabalho = body.dias_trabalho || '1,2,3,4,5';
  if (!isValidDiasTrabalho(dias_trabalho)) erros.push('Dias de trabalho invalidos.');
  const tolerancia = Number.isFinite(+body.tolerancia_minutos) ? Math.max(0, Math.min(120, +body.tolerancia_minutos)) : 10;
  const carga = Number.isFinite(+body.carga_horaria_diaria_minutos)
    ? Math.max(60, Math.min(720, +body.carga_horaria_diaria_minutos))
    : 480;
  return {
    erros,
    dados: {
      nome,
      email,
      cargo: (body.cargo || '').trim(),
      is_admin: !!body.is_admin,
      ativo: body.ativo !== false,
      jornada_entrada,
      jornada_saida,
      carga_horaria_diaria_minutos: carga,
      tolerancia_minutos: tolerancia,
      dias_trabalho,
    },
  };
}

function register(router) {
  router.get(
    '/api/funcionarios',
    withAdmin(({ res, query }) => {
      const incluirInativos = query.incluirInativos !== '0';
      const lista = Funcionarios.listarTodos({ incluirInativos }).map(Funcionarios.publico);
      sendJson(res, 200, { funcionarios: lista });
    })
  );

  router.post(
    '/api/funcionarios',
    withAdmin(async ({ req, res }) => {
      const body = await withBody(req, res);
      if (!body) return;
      const { erros, dados } = validarDadosFuncionario(body, { exigirSenha: true });
      if (erros.length) return sendJson(res, 400, { erro: erros.join(' ') });
      if (Funcionarios.porEmail(dados.email)) {
        return sendJson(res, 409, { erro: 'Ja existe um colaborador com esse e-mail.' });
      }
      const criado = Funcionarios.criar({ ...dados, senha_hash: hashPassword(body.senha) });
      sendJson(res, 201, { funcionario: Funcionarios.publico(criado) });
    })
  );

  router.put(
    '/api/funcionarios/:id',
    withAdmin(async ({ req, res, params, user }) => {
      const id = parseInt(params.id, 10);
      const alvo = Funcionarios.porId(id);
      if (!alvo) return sendJson(res, 404, { erro: 'Colaborador nao encontrado.' });
      const body = await withBody(req, res);
      if (!body) return;
      const { erros, dados } = validarDadosFuncionario(body, { exigirSenha: false });
      if (erros.length) return sendJson(res, 400, { erro: erros.join(' ') });
      const outroComEsseEmail = Funcionarios.porEmail(dados.email);
      if (outroComEsseEmail && outroComEsseEmail.id !== id) {
        return sendJson(res, 409, { erro: 'Ja existe um colaborador com esse e-mail.' });
      }
      // Impede remover o ultimo administrador ativo (o proprio ou rebaixando outro)
      if ((alvo.is_admin && (!dados.is_admin || !dados.ativo)) && Funcionarios.contarAdminsAtivos() <= 1) {
        return sendJson(res, 400, { erro: 'Nao e possivel remover o ultimo administrador do sistema.' });
      }
      const atualizado = Funcionarios.atualizar(id, dados);
      sendJson(res, 200, { funcionario: Funcionarios.publico(atualizado) });
    })
  );

  router.put(
    '/api/funcionarios/:id/senha',
    withAdmin(async ({ req, res, params }) => {
      const id = parseInt(params.id, 10);
      const alvo = Funcionarios.porId(id);
      if (!alvo) return sendJson(res, 404, { erro: 'Colaborador nao encontrado.' });
      const body = await withBody(req, res);
      if (!body) return;
      if (!body.novaSenha || String(body.novaSenha).length < 6) {
        return sendJson(res, 400, { erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }
      Funcionarios.atualizarSenha(id, hashPassword(body.novaSenha));
      sendJson(res, 200, { ok: true });
    })
  );

  router.get(
    '/api/funcionarios/:id/relatorio',
    withAdmin(({ res, params, query }) => {
      const id = parseInt(params.id, 10);
      const alvo = Funcionarios.porId(id);
      if (!alvo) return sendJson(res, 404, { erro: 'Colaborador nao encontrado.' });
      const { inicio, fim, hojeKey } = periodoPadrao(query);
      const relatorio = relatorioDoFuncionario(alvo, inicio, fim, hojeKey);
      sendJson(res, 200, { inicio, fim, funcionario: Funcionarios.publico(alvo), ...relatorio });
    })
  );

  router.get(
    '/api/funcionarios/:id/relatorio/exportar',
    withAdmin(({ res, params, query }) => {
      const id = parseInt(params.id, 10);
      const alvo = Funcionarios.porId(id);
      if (!alvo) return sendJson(res, 404, { erro: 'Colaborador nao encontrado.' });
      const { inicio, fim, hojeKey } = periodoPadrao(query);
      const { dias, totais } = relatorioDoFuncionario(alvo, inicio, fim, hojeKey);
      const periodoLabel = `${localDateBR(inicio)} a ${localDateBR(fim)}`;
      const nomeArquivo = `ponto_${alvo.nome.replace(/\s+/g, '_').toLowerCase()}_${inicio}_a_${fim}`;
      if (query.formato === 'pdf') {
        const buffer = pdfRelatorioDetalhado(alvo, dias, totais, periodoLabel);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${nomeArquivo}.pdf"`,
        });
        return res.end(buffer);
      }
      const csv = csvRelatorioDetalhado(alvo, dias, totais);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nomeArquivo}.csv"`,
      });
      res.end(Buffer.from(csv, 'utf8'));
    })
  );

  // ---------- Correcao manual de marcacoes (admin) ----------
  router.post(
    '/api/funcionarios/:id/registros',
    withAdmin(async ({ req, res, params }) => {
      const id = parseInt(params.id, 10);
      const alvo = Funcionarios.porId(id);
      if (!alvo) return sendJson(res, 404, { erro: 'Colaborador nao encontrado.' });
      const body = await withBody(req, res);
      if (!body) return;
      const { data, hora, tipo, observacao } = body;
      if (!isValidDateKey(data)) return sendJson(res, 400, { erro: 'Data invalida.' });
      if (!isValidHHMM(hora)) return sendJson(res, 400, { erro: 'Horario invalido.' });
      if (!LABELS[tipo]) return sendJson(res, 400, { erro: 'Tipo de marcacao invalido.' });
      // Brasil nao adota horario de verao desde 2019: America/Sao_Paulo = UTC-03:00 fixo.
      const dataHoraUtc = new Date(`${data}T${hora}:00-03:00`);
      if (Number.isNaN(dataHoraUtc.getTime())) return sendJson(res, 400, { erro: 'Data/hora invalida.' });
      const registro = RegistrosPonto.criar({
        funcionario_id: id,
        tipo,
        data_hora_utc: dataHoraUtc.toISOString(),
        observacao: (observacao || 'Ajuste manual feito pelo administrador').slice(0, 300),
        editado_por_admin: 1,
      });
      sendJson(res, 201, { registro });
    })
  );

  router.delete(
    '/api/registros/:registroId',
    withAdmin(({ res, params }) => {
      const registroId = parseInt(params.registroId, 10);
      const registro = RegistrosPonto.porId(registroId);
      if (!registro) return sendJson(res, 404, { erro: 'Registro nao encontrado.' });
      RegistrosPonto.remover(registroId);
      sendJson(res, 200, { ok: true });
    })
  );
}

module.exports = { register };
