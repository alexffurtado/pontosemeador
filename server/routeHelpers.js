'use strict';

const { sendJson, readJsonBody } = require('./httpUtils');
const { getUserFromReq } = require('./sessionHelper');
const { Funcionarios } = require('./repository');

// Envolve um handler exigindo usuário autenticado. Injeta ctx.user (registro completo, com senha_hash).
function withAuth(handler) {
  return async (req, res, params, query) => {
    const user = await getUserFromReq(req);
    if (!user) return sendJson(res, 401, { erro: 'Não autenticado. Faça login novamente.' });
    return handler({ req, res, params, query, user });
  };
}

// Igual a withAuth, mas exige que o usuário seja administrador.
function withAdmin(handler) {
  return withAuth(async ({ req, res, params, query, user }) => {
    if (!user.is_admin) return sendJson(res, 403, { erro: 'Acesso restrito a administradores.' });
    return handler({ req, res, params, query, user });
  });
}

// Lê e retorna o corpo JSON da requisição, respondendo 400 automaticamente em caso de erro.
async function withBody(req, res) {
  try {
    return await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { erro: err.message || 'Corpo inválido' });
    return null;
  }
}

module.exports = { withAuth, withAdmin, withBody, sendJson, Funcionarios };
