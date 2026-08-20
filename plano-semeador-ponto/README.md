# Plano Semeador — Ponto Digital

Sistema web de marcação de ponto para os colaboradores da funerária **Plano Semeador**. Cada colaborador tem seu próprio login, bate ponto (entrada, saída para intervalo, retorno do intervalo e saída) e pode consultar seus próprios relatórios de horas, atrasos e faltas. Administradores têm um painel para cadastrar colaboradores, corrigir marcações e gerar relatórios consolidados da equipe em CSV (Excel) e PDF.

## Por que não precisa de "npm install"

O sistema foi construído **sem nenhuma dependência externa** — apenas recursos nativos do Node.js (servidor HTTP, o módulo `node:sqlite` para o banco de dados, `node:crypto` para senhas e sessões). Isso significa:

- Não há risco de vulnerabilidades em pacotes de terceiros.
- A instalação em qualquer host (Render, Railway, VPS, etc.) é mais rápida e não depende de compilação nativa.
- Basta ter o Node.js instalado e rodar `node server.js`.

**Requisito:** Node.js 22.5 ou superior (o módulo nativo de SQLite foi introduzido nessa versão). Verifique com `node -v`.

## Como rodar localmente

```bash
node server.js
```

O servidor sobe em `http://localhost:3000` (ajustável pela variável `PORT`). Na primeira execução, um banco SQLite é criado automaticamente em `data/ponto.db` e um usuário **administrador** é criado com as credenciais:

- **E-mail:** `admin@planosemeador.com.br`
- **Senha:** `semeador2026`

Essas credenciais aparecem no console na primeira inicialização. **Troque a senha assim que possível** (tela "Bater Ponto" → seção "Meu perfil" → "Alterar senha"), ou defina `ADMIN_EMAIL`/`ADMIN_SENHA` num arquivo `.env` (veja `.env.example`) antes de rodar pela primeira vez.

## Funcionalidades

- **Login individual por colaborador** (e-mail + senha), com sessão segura em cookie `httpOnly`.
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
  db.js                     → conexão SQLite, schema e criação do admin inicial
  auth.js                   → hash de senha (scrypt) e tokens de sessão assinados (HMAC)
  router.js                 → roteador HTTP minimalista
  repository.js             → acesso a dados (funcionários e registros de ponto)
  routes/                   → endpoints da API (auth, ponto, relatórios, funcionários)
  utils/
    dateUtils.js             → conversões de fuso horário (America/Sao_Paulo)
    relatorioUtils.js         → cálculo de horas, atrasos, saídas antecipadas e faltas
    csv.js / pdf.js           → geração de arquivos CSV e PDF (sem bibliotecas externas)
public/                    → front-end (HTML/CSS/JS puro, sem framework)
data/                      → banco de dados SQLite (criado automaticamente, não versionar)
```

## Publicando o site (hospedagem)

Qualquer serviço que rode Node.js 22+ funciona. Alguns caminhos comuns:

1. **Render / Railway / Fly.io** (mais simples): crie um novo serviço Web, aponte para este repositório, comando de start `node server.js`. Configure um **disco persistente** — sem isso, o banco de dados (colaboradores e marcações) é perdido a cada reinício/novo deploy.
2. **VPS próprio**: copie os arquivos, rode `node server.js` atrás de um processo gerenciado (ex.: `pm2 start server.js --name ponto-semeador`) e um proxy reverso (ex.: Nginx) com HTTPS na frente.

### Configurando o disco persistente no Render

1. No painel do serviço, vá em **Settings → Disks** (ou **Disks** no menu lateral) e clique em **Add Disk**.
2. Dê um nome (ex.: `ponto-dados`), defina o **Mount Path** como `/var/data` e o tamanho (1 GB já é mais do que suficiente).
3. Isso exige um plano pago (o disco persistente não está disponível no plano gratuito).
4. Defina a variável de ambiente `DATA_DIR=/var/data` no serviço, apontando para o mesmo caminho do disco.
5. Faça um novo deploy — a partir daí, o banco de dados vive no disco e sobrevive a reinícios e a novos deploys.

Em produção, defina a variável de ambiente `SESSION_SECRET` (um texto longo e aleatório) para garantir que as sessões continuem válidas entre reinícios do servidor, e sirva o site sempre com **HTTPS** (essencial para proteger senhas e cookies de login).

## Backup dos dados

Todo o histórico de ponto e cadastro de colaboradores fica em um único arquivo: `data/ponto.db` (mais os arquivos auxiliares `ponto.db-wal` e `ponto.db-shm` do SQLite). Faça backup periódico desse arquivo — por exemplo, copiando-o diariamente para outro local ou serviço de armazenamento.

## Personalizando as cores

A paleta de verdes e brancos está centralizada no topo do arquivo `public/css/style.css`, nas variáveis `:root` (`--verde-escuro`, `--verde`, `--verde-medio`, `--verde-claro`, etc.). Basta alterar os códigos de cor ali para ajustar a identidade visual em todo o site de uma vez.

## Observações importantes

- O horário de verão foi abolido no Brasil desde 2019, então o sistema assume o fuso `America/Sao_Paulo` como UTC-03:00 fixo — não é necessário nenhum ajuste sazonal.
- A exportação "Excel" gera um arquivo `.csv` (compatível e reconhecido nativamente pelo Excel/Google Sheets), evitando dependência de bibliotecas externas para o formato `.xlsx`.
- O SQLite nativo do Node (`node:sqlite`) ainda é classificado como recurso experimental pela documentação oficial do Node.js; ele é estável para o volume de dados de uma equipe de dezenas de colaboradores, mas acompanhe os releases do Node caso alguma mudança de API ocorra em versões futuras.
