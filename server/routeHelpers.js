'use strict';

const { sendJson, readJsonBody } = require('./httpUtils');
const { getUserFromReq } = require('./sessionHelper');
const { Funcionarios } = require('./repository');

// Envolve um handler exigindo usuario autenticado. Injeta ctx.user (registro completo, com senha_hash).
function withAuth(handler) {
  return async (req, res, params, query) => {
    const user = await getUserFromReq(req);
    if (!user) return sendJson(res, 401, { erro: 'Nao autenticado. Faca login novamente.' });
    return handler({ req, res, params, query, user });
  };
}

// Igual a withAuth, mas exige que o usuario seja administrador.
function withAdmin(handler) {
  return withAuth(async ({ req, res, params, query, user }) => {
    if (!user.is_admin) return sendJson(res, 403, { erro: 'Acesso restrito a administradores.' });
    return handler({ req, res, params, query, user });
  });
}

// Le e retorna o corpo JSON da requisicao, respondendo 400 automaticamente em caso de erro.
async function withBody(req, res) {
  try {
    return await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { erro: err.message || 'Corpo invalido' });
    return null;
  }
}

module.exports = { withAuth, withAdmin, withBody, sendJson, Funcionarios };
