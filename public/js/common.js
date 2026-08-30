// Funções compartilhadas entre todas as páginas do sistema.

async function apiFetch(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  });
  let dados = null;
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    dados = await resp.json().catch(() => null);
  }
  if (!resp.ok) {
    const erro = new Error((dados && dados.erro) || `Erro na requisição (${resp.status})`);
    erro.status = resp.status;
    throw erro;
  }
  return dados;
}

function iniciaisNome(nome) {
  const partes = (nome || '').trim().split(/\s+/);
  const iniciais = (partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '');
  return iniciais.toUpperCase();
}

const LOGO_SVG = `<img src="/img/logo-icone.png" alt="Semeador" class="logo-topo">`;

// Monta o cabeçalho padrão no elemento #topo-app. paginaAtiva = 'ponto' | 'relatorios' | 'admin'
async function montarTopo(paginaAtiva) {
  const el = document.getElementById('topo-app');
  if (!el) return null;
  let usuario;
  try {
    const dados = await apiFetch('/api/me');
    usuario = dados.usuario;
  } catch (e) {
    window.location.href = '/login.html';
    return null;
  }

  const linksAdmin = usuario.is_admin
    ? `<a href="/admin.html" data-pagina="admin">Administração</a>`
    : '';

  el.innerHTML = `
    <div class="marca">
      ${LOGO_SVG}
      <div>
        Plano Semeador
        <span class="subtitulo">Ponto Digital</span>
      </div>
    </div>
    <nav>
      <a href="/dashboard.html" data-pagina="ponto">Bater Ponto</a>
      <a href="/relatorios.html" data-pagina="relatorios">Meus Relatórios</a>
      ${linksAdmin}
    </nav>
    <div class="usuario">
      <div class="avatar">${iniciaisNome(usuario.nome)}</div>
      <span>${usuario.nome}${usuario.is_admin ? ' <span class="tag tag-admin" style="margin-left:6px;">Admin</span>' : ''}</span>
      <button class="btn-sair" id="btn-sair">Sair</button>
    </div>
  `;

  el.querySelectorAll('nav a').forEach((a) => {
    if (a.dataset.pagina === paginaAtiva) a.classList.add('ativo');
  });

  document.getElementById('btn-sair').addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login.html';
  });

  return usuario;
}

function formatarDataBR(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

function hojeISO() {
  const d = new Date();
  const tz = d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const local = new Date(tz);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function primeiroDiaDoMesISO() {
  const [y, m] = hojeISO().split('-');
  return `${y}-${m}-01`;
}

const NOMES_DIA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function nomeDiaSemana(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return NOMES_DIA_SEMANA[dt.getUTCDay()];
}

function minutosParaHoras(totalMin) {
  const sinal = totalMin < 0 ? '-' : '';
  const abs = Math.abs(totalMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sinal}${h}h${String(m).padStart(2, '0')}`;
}

const TIPO_ABREV = { entrada: 'Ent', saida_intervalo: 'Said.interv', retorno_intervalo: 'Ret.interv', saida: 'Said' };

// Mostra TODAS as marcações do dia como uma lista compacta (não apenas 4 fixas),
// para que plantões/chamados extras (inclusive de madrugada) fiquem visíveis.
function marcacoesDoDia(dia) {
  if (!dia.eventos.length) return '<span class="texto-suave">-</span>';
  const chips = dia.eventos
    .map((e) => `<span class="marca-chip" title="${e.label}">${TIPO_ABREV[e.tipo] || '?'} ${e.hora}</span>`)
    .join(' ');
  let notas = '';
  if (dia.continuacaoDoDiaAnterior) {
    notas += '<div class="texto-suave" style="font-size:0.72rem; margin-top:2px;">&#8618; plantão iniciado no dia anterior</div>';
  }
  if (dia.continuaNoDiaSeguinte) {
    notas += '<div class="texto-suave" style="font-size:0.72rem; margin-top:2px;">&#8618; continua após a meia-noite</div>';
  }
  return chips + notas;
}

function tagStatusDia(dia) {
  if (dia.falta) return '<span class="tag tag-falta">Falta</span>';
  if (dia.eventos.length === 0) return dia.diaUtil ? '<span class="texto-suave">-</span>' : '<span class="tag tag-folga">Folga</span>';
  const tags = [];
  if (dia.atrasoMin > 0) tags.push(`<span class="tag tag-atraso">Atraso ${minutosParaHoras(dia.atrasoMin)}</span>`);
  if (dia.saidaAntecipadaMin > 0) tags.push(`<span class="tag tag-atraso">Saída antecip. ${minutosParaHoras(dia.saidaAntecipadaMin)}</span>`);
  if (dia.inconsistente) tags.push('<span class="tag tag-falta">Marcação incompleta</span>');
  if (tags.length === 0) return '<span class="tag tag-ok">OK</span>';
  return tags.join(' ');
}

function celulaHorasExtras(dia) {
  if (!dia.extraMin) return '<span class="texto-suave">-</span>';
  return `<span class="tag tag-extra">${minutosParaHoras(dia.extraMin)}</span>`;
}

// Renderiza a grade de cartões de resumo (totais) num container.
function renderizarResumo(container, totais) {
  container.innerHTML = `
    <div class="cartao-resumo">
      <div class="rotulo">Horas trabalhadas</div>
      <div class="valor">${minutosParaHoras(totais.minutosTrabalhados)}</div>
    </div>
    <div class="cartao-resumo destaque-extra">
      <div class="rotulo">Horas extras</div>
      <div class="valor">${minutosParaHoras(totais.minutosExtras || 0)}</div>
    </div>
    <div class="cartao-resumo destaque-atraso">
      <div class="rotulo">Atrasos</div>
      <div class="valor">${minutosParaHoras(totais.minutosAtraso)}</div>
    </div>
    <div class="cartao-resumo destaque-atraso">
      <div class="rotulo">Saídas antecipadas</div>
      <div class="valor">${minutosParaHoras(totais.minutosSaidaAntecipada)}</div>
    </div>
    <div class="cartao-resumo destaque-falta">
      <div class="rotulo">Faltas</div>
      <div class="valor">${totais.diasComFalta}</div>
    </div>
  `;
}

// Renderiza o corpo da tabela diária de um relatório.
// opcoes.marcacoesRenderer: função alternativa pra renderizar a célula de
// marcações (ex.: a tela de admin usa uma versão com botão de excluir).
// opcoes.afterRender: chamada depois do innerHTML ser atualizado, pra permitir
// quem chamou ligar event listeners nos elementos recém-criados.
function renderizarTabelaRelatorio(tbody, dias, opcoes = {}) {
  const renderMarcacoes = opcoes.marcacoesRenderer || marcacoesDoDia;
  if (!dias.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="carregando">Nenhum registro no período.</td></tr>';
    return;
  }
  tbody.innerHTML = dias
    .map(
      (dia) => `
      <tr>
        <td>${formatarDataBR(dia.data)}</td>
        <td>${nomeDiaSemana(dia.data)}</td>
        <td>${renderMarcacoes(dia)}</td>
        <td>${minutosParaHoras(dia.minutosTrabalhados)}</td>
        <td>${celulaHorasExtras(dia)}</td>
        <td>${tagStatusDia(dia)}</td>
      </tr>`
    )
    .join('');
  if (opcoes.afterRender) opcoes.afterRender();
}

// Calcula datas de início/fim a partir de um preset ('mes-atual', 'mes-passado', '30dias', '7dias').
function calcularPeriodoPreset(preset) {
  const hoje = hojeISO();
  const [ay, am] = hoje.split('-').map(Number);
  if (preset === 'mes-atual') {
    return { inicio: `${ay}-${String(am).padStart(2, '0')}-01`, fim: hoje };
  }
  if (preset === 'mes-passado') {
    const dt = new Date(Date.UTC(ay, am - 2, 1, 12));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const ultimoDia = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    return {
      inicio: `${y}-${String(m).padStart(2, '0')}-01`,
      fim: `${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
    };
  }
  const dias = preset === '7dias' ? 7 : 30;
  const [hy, hm, hd] = hoje.split('-').map(Number);
  const dtIni = new Date(Date.UTC(hy, hm - 1, hd, 12));
  dtIni.setUTCDate(dtIni.getUTCDate() - (dias - 1));
  const iy = dtIni.getUTCFullYear();
  const im = dtIni.getUTCMonth() + 1;
  const id = dtIni.getUTCDate();
  return { inicio: `${iy}-${String(im).padStart(2, '0')}-${String(id).padStart(2, '0')}`, fim: hoje };
}
