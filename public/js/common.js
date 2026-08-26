// Funcoes compartilhadas entre todas as paginas do sistema.

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
    const erro = new Error((dados && dados.erro) || `Erro na requisicao (${resp.status})`);
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

const LOGO_SVG = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C12 2 6 8.5 6 13.5C6 17.09 8.69 20 12 20C15.31 20 18 17.09 18 13.5C18 8.5 12 2 12 2Z" fill="#ffffff" fill-opacity="0.95"/>
  <path d="M12 20V22" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

// Monta o cabecalho padrao no elemento #topo-app. paginaAtiva = 'ponto' | 'relatorios' | 'admin'
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
    ? `<a href="/admin.html" data-pagina="admin">Administracao</a>`
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
      <a href="/relatorios.html" data-pagina="relatorios">Meus Relatorios</a>
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

const NOMES_DIA_SEMANA = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

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

// Mostra TODAS as marcacoes do dia como uma lista compacta (nao apenas 4 fixas),
// para que plantoes/chamados extras (inclusive de madrugada) fiquem visiveis.
function marcacoesDoDia(dia) {
  if (!dia.eventos.length) return '<span class="texto-suave">-</span>';
  const chips = dia.eventos
    .map((e) => `<span class="marca-chip" title="${e.label}">${TIPO_ABREV[e.tipo] || '?'} ${e.hora}</span>`)
    .join(' ');
  let notas = '';
  if (dia.continuacaoDoDiaAnterior) {
    notas += '<div class="texto-suave" style="font-size:0.72rem; margin-top:2px;">&#8618; plantao iniciado no dia anterior</div>';
  }
  if (dia.continuaNoDiaSeguinte) {
    notas += '<div class="texto-suave" style="font-size:0.72rem; margin-top:2px;">&#8618; continua apos a meia-noite</div>';
  }
  return chips + notas;
}

function tagStatusDia(dia) {
  if (dia.falta) return '<span class="tag tag-falta">Falta</span>';
  if (dia.eventos.length === 0) return dia.diaUtil ? '<span class="texto-suave">-</span>' : '<span class="tag tag-folga">Folga</span>';
  const tags = [];
  if (dia.atrasoMin > 0) tags.push(`<span class="tag tag-atraso">Atraso ${minutosParaHoras(dia.atrasoMin)}</span>`);
  if (dia.saidaAntecipadaMin > 0) tags.push(`<span class="tag tag-atraso">Saida antecip. ${minutosParaHoras(dia.saidaAntecipadaMin)}</span>`);
  if (dia.inconsistente) tags.push('<span class="tag tag-falta">Marcacao incompleta</span>');
  if (tags.length === 0) return '<span class="tag tag-ok">OK</span>';
  return tags.join(' ');
}

function celulaHorasExtras(dia) {
  if (!dia.extraMin) return '<span class="texto-suave">-</span>';
  return `<span class="tag tag-extra">${minutosParaHoras(dia.extraMin)}</span>`;
}

// Renderiza a grade de cartoes de resumo (totais) num container.
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
      <div class="rotulo">Saidas antecipadas</div>
      <div class="valor">${minutosParaHoras(totais.minutosSaidaAntecipada)}</div>
    </div>
    <div class="cartao-resumo destaque-falta">
      <div class="rotulo">Faltas</div>
      <div class="valor">${totais.diasComFalta}</div>
    </div>
  `;
}

// Renderiza o corpo da tabela diaria de um relatorio.
function renderizarTabelaRelatorio(tbody, dias) {
  if (!dias.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="carregando">Nenhum registro no periodo.</td></tr>';
    return;
  }
  tbody.innerHTML = dias
    .map(
      (dia) => `
      <tr>
        <td>${formatarDataBR(dia.data)}</td>
        <td>${nomeDiaSemana(dia.data)}</td>
        <td>${marcacoesDoDia(dia)}</td>
        <td>${minutosParaHoras(dia.minutosTrabalhados)}</td>
        <td>${celulaHorasExtras(dia)}</td>
        <td>${tagStatusDia(dia)}</td>
      </tr>`
    )
    .join('');
}

// Calcula datas de inicio/fim a partir de um preset ('mes-atual', 'mes-passado', '30dias', '7dias').
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
