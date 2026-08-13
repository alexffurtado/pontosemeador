'use strict';

const { sendJson } = require('../httpUtils');
const { withAuth, withBody } = require('../routeHelpers');
const { verifyPassword, hashPassword } = require('../auth');
const { Funcionarios } = require('../repository');
const sessionHelper = require('../sessionHelper');
const { isValidEmail } = require('../validation');

function register(router) {
  router.post('/api/login', async (req, res) => {
    const body = await withBody(req, res);
    if (!body) return;
    const { email, senha } = body;
    if (!email || !senha) {
      return sendJson(res, 400, { erro: 'Informe e-mail e senha.' });
    }
    const user = Funcionarios.porEmail(email);
    if (!user || !user.ativo || !verifyPassword(senha, user.senha_hash)) {
      return sendJson(res, 401, { erro: 'E-mail ou senha invalidos.' });
    }
    sessionHelper.login(res, user.id);
    sendJson(res, 200, { usuario: Funcionarios.publico(user) });
  });

  router.post('/api/logout', (req, res) => {
    sessionHelper.logout(res);
    sendJson(res, 200, { ok: true });
  });

  router.get(
    '/api/me',
    withAuth(({ res, user }) => {
      sendJson(res, 200, { usuario: Funcionarios.publico(user) });
    })
  );

  router.put(
    '/api/me/senha',
    withAuth(async ({ req, res, user }) => {
      const body = await withBody(req, res);
      if (!body) return;
      const { senhaAtual, novaSenha } = body;
      if (!senhaAtual || !novaSenha) {
        return sendJson(res, 400, { erro: 'Informe a senha atual e a nova senha.' });
      }
      if (String(novaSenha).length < 6) {
        return sendJson(res, 400, { erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }
      if (!verifyPassword(senhaAtual, user.senha_hash)) {
        return sendJson(res, 401, { erro: 'Senha atual incorreta.' });
      }
      Funcionarios.atualizarSenha(user.id, hashPassword(novaSenha));
      sendJson(res, 200, { ok: true });
    })
  );

  router.put(
    '/api/me/perfil',
    withAuth(async ({ req, res, user }) => {
      const body = await withBody(req, res);
      if (!body) return;
      const nome = (body.nome || '').trim();
      const email = (body.email || '').trim();
      if (!nome || nome.length < 2) return sendJson(res, 400, { erro: 'Informe um nome valido.' });
      if (!isValidEmail(email)) return sendJson(res, 400, { erro: 'Informe um e-mail valido.' });
      const existente = Funcionarios.porEmail(email);
      if (existente && existente.id !== user.id) {
        return sendJson(res, 409, { erro: 'Ja existe um usuario com esse e-mail.' });
      }
      const atualizado = Funcionarios.atualizar(user.id, { nome, email });
      sendJson(res, 200, { usuario: Funcionarios.publico(atualizado) });
    })
  );
}

module.exports = { register };
