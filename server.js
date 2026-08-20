'use strict';

const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const config = require('./server/config');
const { initDb } = require('./server/db');

const Router = require('./server/router');
const { serveStatic } = require('./server/httpUtils');

const router = new Router();
require('./server/routes/authRoutes').register(router);
require('./server/routes/pontoRoutes').register(router);
require('./server/routes/relatorioRoutes').register(router);
require('./server/routes/funcionarioRoutes').register(router);

const publicDir = path.join(__dirname, 'public');
const serveFromPublic = serveStatic(publicDir);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    const query = Object.fromEntries(url.searchParams.entries());

    if (pathname.startsWith('/api/')) {
      const match = router.match(req.method, pathname);
      if (!match) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ erro: 'Rota nao encontrada.' }));
        return;
      }
      await match.handler(req, res, match.params, query);
      return;
    }

    const served = serveFromPublic(req, res, pathname);
    if (!served) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - Pagina nao encontrada</h1><p><a href="/login.html">Voltar ao login</a></p>');
    }
  } catch (err) {
    console.error('Erro nao tratado:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erro: 'Erro interno do servidor.' }));
    } else {
      res.end();
    }
  }
});

// A inicializacao do banco (criacao de tabelas/migracoes/seed do admin) e
// assincrona com Postgres, entao so comecamos a aceitar conexoes depois que
// ela terminar com sucesso.
async function start() {
  try {
    await initDb();
  } catch (err) {
    console.error('----------------------------------------------------');
    console.error('Erro ao conectar/inicializar o banco de dados Postgres:');
    console.error(err.message);
    console.error('Verifique se a variavel de ambiente DATABASE_URL esta');
    console.error('correta e se o banco esta acessivel.');
    console.error('----------------------------------------------------');
    process.exit(1);
  }

  server.listen(config.port, () => {
    console.log(`Plano Semeador - Ponto Digital rodando em http://localhost:${config.port}`);
  });
}

start();
