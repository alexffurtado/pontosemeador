# Plano Semeador — Ponto Digital

Sistema web de marcação de ponto para os colaboradores da funerária **Plano Semeador**. Cada colaborador tem seu próprio login, bate ponto (entrada, saída para intervalo, retorno do intervalo e saída) e pode consultar seus próprios relatórios de horas, atrasos e faltas. Administradores têm um painel para cadastrar colaboradores, corrigir marcações e gerar relatórios consolidados da equipe em CSV (Excel) e PDF.

## Sobre as dependências

O sistema usa quase só recursos nativos do Node.js (servidor HTTP, `node:crypto` para senhas e sessões) — a única dependência externa é o driver oficial do Postgres (`pg`), usado para conversar com o banco de dados. Isso significa:

- Praticamente nenhum risco de vulnerabilidades em pacotes de terceiros.
- Os dados (colaboradores e marcações de ponto) ficam num banco Postgres externo, não em disco local — então funciona no plano **gratuito** do Render (ou de qualquer host), sem precisar de disco persistente pago.

**Requisitos:** Node.js 22.5 ou superior (verifique com `node -v`) e uma connection string de um banco Postgres (veja "Banco de dados" abaixo).

## Banco de dados (gratuito, sem cartão de crédito)

Antes de rodar o servidor, você precisa de um banco Postgres. O [Neon](https://neon.tech) tem um plano gratuito permanente, sem necessidade de cartão:

1. Crie uma conta gratuita em https://neon.tech e crie um novo projeto.
2. Na tela do projeto, copie a **Connection string** (algo como `postgresql://usuario:senha@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`).
3. Defina essa string na variável de ambiente `DATABASE_URL` (veja `.env.example`).

O servidor cria as tabelas automaticamente na primeira execução — não é preciso rodar nenhum script de migração manualmente.

## Como rodar localmente

```bash
node server.js
```

O servidor sobe em `http://localhost:3000` (ajustável pela variável `PORT`). Na primeira execução, as tabelas são criadas automaticamente no banco Postgres configurado em `DATABASE_URL`, e um usuário **administrador** é criado com as credenciais:

- **Login:** `administrador`
- **Senha:** `semeador2026`

Essas credenciais aparecem no console na primeira inicialização. **Troque a senha assim que possível** (tela "Bater Ponto" → seção "Meu perfil" → "Alterar senha"), ou defina `ADMIN_EMAIL`/`ADMIN_SENHA` num arquivo `.env` (veja `.env.example`) antes de rodar pela primeira vez.

## Funcionalidades

- **Login individual por colaborador** usando um **login curto** (ex.: `joao`, gerado automaticamente a partir do primeiro nome e editável pelo admin) + senha — mais fácil de digitar/lembrar que um e-mail. O e-mail continua cadastrado para contato, e também funciona como login alternativo por compatibilidade. Sessão segura em cookie `httpOnly`.
- **Bater ponto** com um botão único que detecta automaticamente a próxima marcação do dia (entrada → saída intervalo → retorno intervalo → saída).
- **Meus Relatórios**: cada colaborador vê suas próprias horas trabalhadas, atrasos, saídas antecipadas e faltas por período, com exportação em CSV (abre no Excel) e PDF.
- **Painel de Administração** (visível só para administradores):
  - Relatório consolidado de toda a equipe, com exportação CSV/PDF.
  - Cadastro, edição, inativação e redefinição de senha de colaboradores.
  - Jornada configurável por colaborador (horário de entrada/saída esperado, carga horária diária, tolerância em minutos e dias de trabalho — importante para funerárias que têm colaboradores com escalas diferentes, incluindo fins de semana).
  - Correção manual de marcações esquecidas (fica registrado como ajuste feito pelo administrador).
  - Detalhamento (drill-down) do relatório de qualquer colaborador individualmente.
- **Suporte a plantão/sobreaviso**: qualquer colaborador pode bater ponto quantas vezes forem necessárias no mesmo dia (ex.: expediente normal + um ou mais chamados noturnos). O cálculo de horas soma corretamente sessões que atravessam a meia-noite (ex.: chamado às 22h, atendimento até 1h do dia seguinte), e a tabela de relatório mostra todas as marcações do dia, não só 4 fixas. Para colaboradores com escala variável (agentes funerários de sobreaviso), o administrador pode desmarcar "Verificar saída antecipada" no cadastro do colaborador, evitando alertas incorretos quando ele bate a saída de um chamado de madrugada.

## Estrutura do projeto

```
server.js                 → ponto de entrada do servidor HTTP
server/
  config.js                → configurações e variáveis de ambiente
  db.js                     → conexão Postgres (pg), schema e criação do admin inicial
  auth.js                   → hash de senha (scrypt) e tokens de sessão assinados (HMAC)
  router.js                 → roteador HTTP minimalista
  repository.js             → acesso a dados (funcionários e registros de ponto)
  routes/                   → endpoints da API (auth, ponto, relatórios, funcionários)
  utils/
    dateUtils.js             → conversões de fuso horário (America/Sao_Paulo)
    relatorioUtils.js         → cálculo de horas, atrasos, saídas antecipadas e faltas
    csv.js / pdf.js           → geração de arquivos CSV e PDF (sem bibliotecas externas)
public/                    → front-end (HTML/CSS/JS puro, sem framework)
```

## Publicando o site (hospedagem)

Qualquer serviço que rode Node.js 22+ funciona, mesmo no plano gratuito, já que os dados vivem no banco Postgres (não em disco local). Alguns caminhos comuns:

1. **Render / Railway / Fly.io** (mais simples): crie um novo serviço Web, aponte para este repositório, comando de start `node server.js`. Defina a variável de ambiente `DATABASE_URL` (veja "Banco de dados" acima) — sem ela, o servidor não inicia.
2. **VPS próprio**: copie os arquivos, rode `node server.js` atrás de um processo gerenciado (ex.: `pm2 start server.js --name ponto-semeador`) e um proxy reverso (ex.: Nginx) com HTTPS na frente.

### Configurando no Render (plano Free)

1. No painel do serviço, vá em **Environment** e adicione a variável `DATABASE_URL` com a connection string do Neon (ou outro Postgres).
2. Adicione também `SESSION_SECRET` com um texto longo e aleatório — sem essa variável, o segredo de sessão é gerado em disco e se perde a cada reinício/novo deploy no plano Free, deslogando todo mundo.
3. Faça um novo deploy. Não é necessário disco nem plano pago: o Render Free já é suficiente, os dados ficam no Neon.

Em produção, sirva o site sempre com **HTTPS** (essencial para proteger senhas e cookies de login) — o Render já faz isso automaticamente.

## Backup dos dados

Todo o histórico de ponto e cadastro de colaboradores fica no banco Postgres (Neon ou outro provedor). A maioria dos provedores gratuitos já mantém backups automáticos recentes, mas vale exportar periodicamente: no Neon, é possível rodar `pg_dump` apontando para a connection string, ou usar a opção de export/branch do próprio painel.

## Personalizando as cores

A paleta de verdes e brancos está centralizada no topo do arquivo `public/css/style.css`, nas variáveis `:root` (`--verde-escuro`, `--verde`, `--verde-medio`, `--verde-claro`, etc.). Basta alterar os códigos de cor ali para ajustar a identidade visual em todo o site de uma vez.

## Observações importantes

- O horário de verão foi abolido no Brasil desde 2019, então o sistema assume o fuso `America/Sao_Paulo` como UTC-03:00 fixo — não é necessário nenhum ajuste sazonal.
- A exportação "Excel" gera um arquivo `.csv` (compatível e reconhecido nativamente pelo Excel/Google Sheets), evitando dependência de bibliotecas externas para o formato `.xlsx`.
- Planos gratuitos de Postgres (como o do Neon) costumam "hibernar" a conexão após um tempo de inatividade e acordam automaticamente na próxima requisição — a primeira marcação de ponto depois de um tempo parado pode demorar um ou dois segundos a mais, o que é normal.
