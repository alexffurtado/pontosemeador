'use strict';

const { sendJson } = require('../httpUtils');
const { withAuth, withAdmin } = require('../routeHelpers');
const { RegistrosPonto, Funcionarios } = require('../repository');
const { calcularRelatorio } = require('../utils/relatorioUtils');
const { localDateKey, localDateBR } = require('../utils/dateUtils');
const { isValidDateKey } = require('../validation');
const {
  csvRelatorioDetalhado,
  pdfRelatorioDetalhado,
  csvRelatorioEquipe,
  pdfRelatorioEquipe,
} = require('../utils/relatorioExport');

function periodoPadrao(query) {
  const hojeKey = localDateKey(new Date());
  let inicio = query.inicio;
  let fim = query.fim;
  if (!isValidDateKey(fim)) fim = hojeKey;
  if (!isValidDateKey(inicio)) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    inicio = localDateKey(d);
  }
  if (inicio > fim) [inicio, fim] = [fim, inicio];
  return { inicio, fim, hojeKey };
}

function utcBoundsForLocalRange(inicioKey, fimKey) {
  const inicioUtc = new Date(inicioKey + 'T00:00:00.000Z');
  inicioUtc.setUTCDate(inicioUtc.getUTCDate() - 1);
  const fimUtc = new Date(fimKey + 'T23:59:59.999Z');
  fimUtc.setUTCDate(fimUtc.getUTCDate() + 1);
  return { inicioUtcIso: inicioUtc.toISOString(), fimUtcIso: fimUtc.toISOString() };
}

function relatorioDoFuncionario(funcionario, inicio, fim, hojeKey) {
  const { inicioUtcIso, fimUtcIso } = utcBoundsForLocalRange(inicio, fim);
  const registros = RegistrosPonto.doFuncionarioEntrePeriodo(funcionario.id, inicioUtcIso, fimUtcIso);
  return calcularRelatorio(funcionario, registros, inicio, fim, hojeKey);
}

function enviarArquivo(res, buffer, filename, contentType) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  res.end(buffer);
}

function register(router) {
  // ---------- Relatorio do proprio colaborador ----------
  router.get(
    '/api/relatorio/meu',
    withAuth(({ res, user, query }) => {
      const { inicio, fim, hojeKey } = periodoPadrao(query);
      const relatorio = relatorioDoFuncionario(user, inicio, fim, hojeKey);
      sendJson(res, 200, { inicio, fim, ...relatorio });
    })
  );

  router.get(
    '/api/relatorio/meu/exportar',
    withAuth(({ res, user, query }) => {
      const { inicio, fim, hojeKey } = periodoPadrao(query);
      const { dias, totais } = relatorioDoFuncionario(user, inicio, fim, hojeKey);
      const periodoLabel = `${localDateBR(inicio)} a ${localDateBR(fim)}`;
      const nomeArquivo = `ponto_${user.nome.replace(/\s+/g, '_').toLowerCase()}_${inicio}_a_${fim}`;
      if (query.formato === 'pdf') {
        const buffer = pdfRelatorioDetalhado(user, dias, totais, periodoLabel);
        return enviarArquivo(res, buffer, `${nomeArquivo}.pdf`, 'application/pdf');
      }
      const csv = csvRelatorioDetalhado(user, dias, totais);
      return enviarArquivo(res, Buffer.from(csv, 'utf8'), `${nomeArquivo}.csv`, 'text/csv; charset=utf-8');
    })
  );

  // ---------- Relatorio consolidado da equipe (somente admin) ----------
  router.get(
    '/api/relatorio/equipe',
    withAdmin(({ res, query }) => {
      const { inicio, fim, hojeKey } = periodoPadrao(query);
      const incluirInativos = query.incluirInativos === '1';
      const funcionarios = Funcionarios.listarTodos({ incluirInativos });
      const linhas = funcionarios.map((f) => ({
        funcionario: Funcionarios.publico(f),
        totais: relatorioDoFuncionario(f, inicio, fim, hojeKey).totais,
      }));
      sendJson(res, 200, { inicio, fim, linhas });
    })
  );

  router.get(
    '/api/relatorio/equipe/exportar',
    withAdmin(({ res, query }) => {
      const { inicio, fim, hojeKey } = periodoPadrao(query);
      const incluirInativos = query.incluirInativos === '1';
      const funcionarios = Funcionarios.listarTodos({ incluirInativos });
      const linhas = funcionarios.map((f) => ({
        funcionario: Funcionarios.publico(f),
        totais: relatorioDoFuncionario(f, inicio, fim, hojeKey).totais,
      }));
      const periodoLabel = `${localDateBR(inicio)} a ${localDateBR(fim)}`;
      const nomeArquivo = `relatorio_equipe_plano_semeador_${inicio}_a_${fim}`;
      if (query.formato === 'pdf') {
        const buffer = pdfRelatorioEquipe(linhas, periodoLabel);
        return enviarArquivo(res, buffer, `${nomeArquivo}.pdf`, 'application/pdf');
      }
      const csv = csvRelatorioEquipe(linhas);
      return enviarArquivo(res, Buffer.from(csv, 'utf8'), `${nomeArquivo}.csv`, 'text/csv; charset=utf-8');
    })
  );
}

module.exports = { register, relatorioDoFuncionario, periodoPadrao };
