(async function () {
  const usuario = await montarTopo('admin');
  if (!usuario) return;
  if (!usuario.is_admin) {
    document.querySelector('main').innerHTML = '<div class="card"><div class="mensagem-erro">Acesso restrito a administradores.</div></div>';
    return;
  }

  const DIAS_SEMANA_CURTO = [
    { valor: 0, label: 'Dom' }, { valor: 1, label: 'Seg' }, { valor: 2, label: 'Ter' },
    { valor: 3, label: 'Qua' }, { valor: 4, label: 'Qui' }, { valor: 5, label: 'Sex' }, { valor: 6, label: 'Sáb' },
  ];

  // ===================== Relatório consolidado da equipe =====================
  const inputInicio = document.getElementById('filtro-inicio');
  const inputFim = document.getElementById('filtro-fim');
  const selectPreset = document.getElementById('filtro-preset');

  function aplicarPreset() {
    const { inicio, fim } = calcularPeriodoPreset(selectPreset.value);
    inputInicio.value = inicio;
    inputFim.value = fim;
  }
  aplicarPreset();
  selectPreset.addEventListener('change', () => { aplicarPreset(); carregarEquipe(); });

  async function carregarEquipe() {
    const tbody = document.getElementById('tabela-equipe');
    tbody.innerHTML = '<tr><td colspan="9" class="carregando">Carregando...</td></tr>';
    try {
      const params = new URLSearchParams({ inicio: inputInicio.value, fim: inputFim.value });
      const dados = await apiFetch(`/api/relatorio/equipe?${params.toString()}`);
      if (!dados.linhas.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="carregando">Nenhum colaborador cadastrado.</td></tr>';
        return;
      }
      tbody.innerHTML = dados.linhas
        .map(({ funcionario: f, totais: t }) => `
          <tr>
            <td>${f.nome}${f.is_admin ? ' <span class="tag tag-admin">Admin</span>' : ''}</td>
            <td>${f.cargo || '-'}</td>
            <td>${minutosParaHoras(t.minutosTrabalhados)}</td>
            <td>${t.minutosExtras > 0 ? `<span class="tag tag-extra">${minutosParaHoras(t.minutosExtras)}</span>` : '-'}</td>
            <td>${t.minutosAtraso > 0 ? `<span class="tag tag-atraso">${minutosParaHoras(t.minutosAtraso)}</span>` : '-'}</td>
            <td>${t.minutosSaidaAntecipada > 0 ? `<span class="tag tag-atraso">${minutosParaHoras(t.minutosSaidaAntecipada)}</span>` : '-'}</td>
            <td>${t.diasComFalta > 0 ? `<span class="tag tag-falta">${t.diasComFalta}</span>` : '0'}</td>
            <td>${t.diasComInconsistencia > 0 ? `<span class="tag tag-falta">${t.diasComInconsistencia}</span>` : '0'}</td>
            <td><button class="btn btn-pequeno btn-secundario" data-detalhar="${f.id}" data-nome="${f.nome}">Detalhar</button></td>
          </tr>`)
        .join('');
      tbody.querySelectorAll('[data-detalhar]').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.location.href = `/colaborador.html?id=${encodeURIComponent(btn.dataset.detalhar)}`;
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }
  document.getElementById('btn-filtrar-equipe').addEventListener('click', carregarEquipe);
  document.getElementById('btn-exportar-equipe-csv').addEventListener('click', () => {
    const params = new URLSearchParams({ inicio: inputInicio.value, fim: inputFim.value, formato: 'csv' });
    window.location.href = `/api/relatorio/equipe/exportar?${params.toString()}`;
  });
  document.getElementById('btn-exportar-equipe-pdf').addEventListener('click', () => {
    const params = new URLSearchParams({ inicio: inputInicio.value, fim: inputFim.value, formato: 'pdf' });
    window.location.href = `/api/relatorio/equipe/exportar?${params.toString()}`;
  });

  // ===================== Feriados =====================
  // Calendário único de feriados: vale pra todos os colaboradores ao mesmo
  // tempo (ver calcularRelatorio() no servidor) — não precisa marcar dia a
  // dia pra cada pessoa.
  document.getElementById('feriado-data').value = hojeISO();

  async function carregarFeriados() {
    const tbody = document.getElementById('tabela-feriados');
    tbody.innerHTML = '<tr><td colspan="3" class="carregando">Carregando...</td></tr>';
    try {
      const dados = await apiFetch('/api/feriados');
      if (!dados.feriados.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="carregando">Nenhum feriado cadastrado ainda.</td></tr>';
        return;
      }
      tbody.innerHTML = dados.feriados
        .map(
          (f) => `
          <tr>
            <td>${formatarDataBR(f.data)}</td>
            <td>${f.descricao || '-'}</td>
            <td><button class="btn btn-pequeno btn-secundario" data-excluir-feriado="${f.id}">Excluir</button></td>
          </tr>`
        )
        .join('');
      tbody.querySelectorAll('[data-excluir-feriado]').forEach((btn) => {
        btn.addEventListener('click', () => excluirFeriado(btn.dataset.excluirFeriado));
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }

  async function excluirFeriado(id) {
    if (!window.confirm('Excluir este feriado? Os dias já calculados com base nele serão recalculados como dia normal.')) return;
    try {
      await apiFetch(`/api/feriados/${id}`, { method: 'DELETE' });
      await carregarFeriados();
    } catch (e) {
      document.getElementById('area-mensagem-feriado').innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  }

  document.getElementById('form-feriado').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const areaMensagem = document.getElementById('area-mensagem-feriado');
    areaMensagem.innerHTML = '';
    try {
      await apiFetch('/api/feriados', {
        method: 'POST',
        body: JSON.stringify({
          data: document.getElementById('feriado-data').value,
          descricao: document.getElementById('feriado-descricao').value.trim(),
        }),
      });
      document.getElementById('feriado-descricao').value = '';
      await carregarFeriados();
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  // ===================== Lista de colaboradores =====================
  async function carregarColaboradores() {
    const tbody = document.getElementById('tabela-colaboradores');
    tbody.innerHTML = '<tr><td colspan="7" class="carregando">Carregando...</td></tr>';
    try {
      const dados = await apiFetch('/api/funcionarios');
      window.__colaboradores = dados.funcionarios;
      tbody.innerHTML = dados.funcionarios
        .map((f) => `
          <tr>
            <td>${f.nome}${f.is_admin ? ' <span class="tag tag-admin">Admin</span>' : ''}</td>
            <td>${f.login || '-'}</td>
            <td>${f.email}</td>
            <td>${f.cargo || '-'}</td>
            <td>${f.jornada_entrada} - ${f.jornada_saida}</td>
            <td>${f.ativo ? '<span class="tag tag-ok">Ativo</span>' : '<span class="tag tag-inativo">Inativo</span>'}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-pequeno btn-secundario" data-editar="${f.id}">Editar</button>
              <button class="btn btn-pequeno btn-secundario" data-senha="${f.id}">Senha</button>
            </td>
          </tr>`)
        .join('');
      tbody.querySelectorAll('[data-editar]').forEach((btn) => btn.addEventListener('click', () => {
        window.location.href = `/colaborador.html?id=${encodeURIComponent(btn.dataset.editar)}`;
      }));
      tbody.querySelectorAll('[data-senha]').forEach((btn) => btn.addEventListener('click', () => abrirModalSenha(btn.dataset.senha)));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }

  // ===================== Modal novo/editar colaborador =====================
  const modalColaborador = document.getElementById('modal-colaborador');
  const formColaborador = document.getElementById('form-colaborador');
  const diasContainer = document.getElementById('col-dias');

  DIAS_SEMANA_CURTO.forEach((d) => {
    const id = `col-dia-${d.valor}`;
    const wrapper = document.createElement('label');
    wrapper.style.cssText = 'display:flex; align-items:center; gap:4px; font-weight:400; font-size:0.85rem;';
    wrapper.innerHTML = `<input type="checkbox" id="${id}" value="${d.valor}" style="width:auto;"> ${d.label}`;
    diasContainer.appendChild(wrapper);
  });
  ['1', '2', '3', '4', '5'].forEach((v) => { document.getElementById(`col-dia-${v}`).checked = true; });

  // ===================== Horario personalizado por dia da semana =====================
  const DIAS_SEMANA_NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  function montarTabelaHorariosSemana() {
    const container = document.getElementById('col-horarios-semana-tabela');
    container.innerHTML = DIAS_SEMANA_NOMES.map((nome, dia) => `
      <div class="linha-horario-semana" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:6px 0; border-bottom:1px solid var(--borda);">
        <div style="width:88px; font-weight:600; font-size:0.85rem;">${nome}</div>
        <label style="display:flex; align-items:center; gap:4px; font-weight:400; font-size:0.85rem;">
          <input type="checkbox" id="hsem-ativo-${dia}" style="width:auto;"> Trabalha
        </label>
        <input type="time" id="hsem-entrada-${dia}" style="max-width:110px;">
        <span class="texto-suave">às</span>
        <input type="time" id="hsem-saida-${dia}" style="max-width:110px;">
        <input type="number" id="hsem-carga-${dia}" min="0" max="24" step="0.5" placeholder="Carga (h)" style="max-width:100px;">
        <label style="display:flex; align-items:center; gap:4px; font-weight:400; font-size:0.85rem;" title="Marque se esse dia não tem intervalo de almoço (ex.: sábado de meio período) — o botão de bater ponto só pede entrada e saída nesse dia.">
          <input type="checkbox" id="hsem-sem-intervalo-${dia}" style="width:auto;"> Sem almoço
        </label>
      </div>`).join('');
    DIAS_SEMANA_NOMES.forEach((_, dia) => {
      document.getElementById(`hsem-ativo-${dia}`).addEventListener('change', () => atualizarLinhaHorarioSemana(dia));
      atualizarLinhaHorarioSemana(dia);
    });
  }
  function atualizarLinhaHorarioSemana(dia) {
    const ativo = document.getElementById(`hsem-ativo-${dia}`).checked;
    ['entrada', 'saida', 'carga', 'sem-intervalo'].forEach((campo) => {
      document.getElementById(`hsem-${campo}-${dia}`).disabled = !ativo;
    });
  }
  // Preenche a tabela a partir da config salva (edição) ou reseta pro estado
  // vazio/inativo (novo colaborador).
  function preencherHorariosSemana(horariosSemana) {
    for (let dia = 0; dia <= 6; dia++) {
      const cfg = Array.isArray(horariosSemana) ? horariosSemana.find((h) => h.dia === dia) : null;
      document.getElementById(`hsem-ativo-${dia}`).checked = !!(cfg && cfg.ativo);
      document.getElementById(`hsem-entrada-${dia}`).value = (cfg && cfg.entrada) || '';
      document.getElementById(`hsem-saida-${dia}`).value = (cfg && cfg.saida) || '';
      document.getElementById(`hsem-carga-${dia}`).value = cfg && cfg.ativo ? cfg.carga_minutos / 60 : '';
      document.getElementById(`hsem-sem-intervalo-${dia}`).checked = !!(cfg && cfg.ativo && cfg.tem_intervalo === false);
      atualizarLinhaHorarioSemana(dia);
    }
  }
  function lerHorariosSemana() {
    const lista = [];
    for (let dia = 0; dia <= 6; dia++) {
      const ativo = document.getElementById(`hsem-ativo-${dia}`).checked;
      lista.push({
        dia,
        ativo,
        entrada: ativo ? document.getElementById(`hsem-entrada-${dia}`).value : null,
        saida: ativo ? document.getElementById(`hsem-saida-${dia}`).value : null,
        carga_minutos: ativo ? Math.round(parseFloat(document.getElementById(`hsem-carga-${dia}`).value || '0') * 60) : 0,
        tem_intervalo: ativo ? !document.getElementById(`hsem-sem-intervalo-${dia}`).checked : true,
      });
    }
    return lista;
  }
  montarTabelaHorariosSemana();

  function fecharModalColaborador() { modalColaborador.classList.add('oculto'); }

  // Sugere um login a partir do primeiro nome (mesma lógica usada no servidor):
  // minúsculo, sem acentos/espaços/símbolos.
  function sugerirLoginDoNome(nome) {
    const primeiro = (nome || '').trim().split(/\s+/)[0] || '';
    return primeiro
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  const inputColNome = document.getElementById('col-nome');
  const inputColLogin = document.getElementById('col-login');
  let loginEditadoManualmente = false;
  inputColLogin.addEventListener('input', () => { loginEditadoManualmente = true; });
  inputColNome.addEventListener('input', () => {
    // Só auto-preenche ao criar um colaborador novo, e enquanto o admin não
    // tiver digitado nada manualmente no campo de login.
    if (!document.getElementById('col-id').value && !loginEditadoManualmente) {
      inputColLogin.value = sugerirLoginDoNome(inputColNome.value);
    }
  });

  function abrirNovoColaborador() {
    formColaborador.reset();
    document.getElementById('col-id').value = '';
    loginEditadoManualmente = false;
    document.getElementById('modal-colaborador-titulo').textContent = 'Novo colaborador';
    document.getElementById('modal-colaborador-mensagem').innerHTML = '';
    document.getElementById('campo-col-senha').classList.remove('oculto');
    document.getElementById('col-senha').required = true;
    document.getElementById('campo-col-ativo').classList.add('oculto');
    document.getElementById('col-entrada').value = '08:00';
    document.getElementById('col-saida').value = '18:00';
    document.getElementById('col-carga').value = 8;
    document.getElementById('col-tolerancia').value = 10;
    document.getElementById('col-verificar-atraso').checked = true;
    document.getElementById('col-verificar-saida-antecipada').checked = true;
    document.getElementById('col-tem-intervalo').checked = true;
    ['0', '1', '2', '3', '4', '5', '6'].forEach((v) => {
      document.getElementById(`col-dia-${v}`).checked = ['1', '2', '3', '4', '5'].includes(v);
    });
    document.getElementById('col-tipo-escala').value = 'semanal';
    document.getElementById('col-escala-referencia').value = hojeISO();
    document.getElementById('col-horario-personalizado').checked = false;
    preencherHorariosSemana(null);
    atualizarVisibilidadeEscala();
    modalColaborador.classList.remove('oculto');
  }

  function atualizarVisibilidadeEscala() {
    const is12x36 = document.getElementById('col-tipo-escala').value === '12x36';
    const personalizado = document.getElementById('col-horario-personalizado').checked;
    document.getElementById('bloco-personalizado-toggle').classList.toggle('oculto', is12x36);
    document.getElementById('bloco-escala-referencia').classList.toggle('oculto', !is12x36);
    const usaDiasSemanaSimples = !is12x36 && !personalizado;
    document.getElementById('bloco-dias-semana').classList.toggle('oculto', !usaDiasSemanaSimples);
    document.getElementById('bloco-horarios-semana').classList.toggle('oculto', !(!is12x36 && personalizado));
    document.querySelectorAll('.campo-jornada-padrao').forEach((el) => {
      el.classList.toggle('oculto', !is12x36 && personalizado);
    });
  }
  document.getElementById('col-tipo-escala').addEventListener('change', () => {
    if (document.getElementById('col-tipo-escala').value === '12x36') {
      document.getElementById('col-horario-personalizado').checked = false;
    }
    atualizarVisibilidadeEscala();
  });
  document.getElementById('col-horario-personalizado').addEventListener('change', atualizarVisibilidadeEscala);

  document.getElementById('btn-novo-colaborador').addEventListener('click', abrirNovoColaborador);
  document.getElementById('btn-cancelar-colaborador').addEventListener('click', fecharModalColaborador);

  formColaborador.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('modal-colaborador-mensagem');
    msg.innerHTML = '';
    const id = document.getElementById('col-id').value;
    const diasSelecionados = DIAS_SEMANA_CURTO.filter((d) => document.getElementById(`col-dia-${d.valor}`).checked).map((d) => d.valor);
    const payload = {
      nome: document.getElementById('col-nome').value.trim(),
      login: document.getElementById('col-login').value.trim(),
      email: document.getElementById('col-email').value.trim(),
      cargo: document.getElementById('col-cargo').value.trim(),
      jornada_entrada: document.getElementById('col-entrada').value,
      jornada_saida: document.getElementById('col-saida').value,
      carga_horaria_diaria_minutos: Math.round(parseFloat(document.getElementById('col-carga').value) * 60),
      tolerancia_minutos: parseInt(document.getElementById('col-tolerancia').value, 10),
      dias_trabalho: diasSelecionados.join(','),
      is_admin: document.getElementById('col-admin').checked,
      ativo: document.getElementById('col-ativo').checked,
      verificar_atraso: document.getElementById('col-verificar-atraso').checked,
      verificar_saida_antecipada: document.getElementById('col-verificar-saida-antecipada').checked,
      tem_intervalo: document.getElementById('col-tem-intervalo').checked,
      tipo_escala: document.getElementById('col-tipo-escala').value,
      escala_data_referencia: document.getElementById('col-escala-referencia').value,
      horario_personalizado_semana: document.getElementById('col-horario-personalizado').checked,
      horarios_semana: lerHorariosSemana(),
    };
    if (!id) payload.senha = document.getElementById('col-senha').value;
    try {
      if (id) {
        await apiFetch(`/api/funcionarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/funcionarios', { method: 'POST', body: JSON.stringify(payload) });
      }
      fecharModalColaborador();
      await Promise.all([carregarColaboradores(), carregarEquipe()]);
    } catch (e) {
      msg.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  // ===================== Modal redefinir senha =====================
  const modalSenha = document.getElementById('modal-senha');
  function abrirModalSenha(id) {
    const f = (window.__colaboradores || []).find((x) => String(x.id) === String(id));
    document.getElementById('senha-col-id').value = id;
    document.getElementById('modal-senha-nome').textContent = f ? `Colaborador: ${f.nome}` : '';
    document.getElementById('modal-senha-mensagem').innerHTML = '';
    document.getElementById('form-senha-admin').reset();
    modalSenha.classList.remove('oculto');
  }
  document.getElementById('btn-cancelar-senha').addEventListener('click', () => modalSenha.classList.add('oculto'));
  document.getElementById('form-senha-admin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('modal-senha-mensagem');
    const id = document.getElementById('senha-col-id').value;
    const novaSenha = document.getElementById('senha-nova-admin').value;
    try {
      await apiFetch(`/api/funcionarios/${id}/senha`, { method: 'PUT', body: JSON.stringify({ novaSenha }) });
      modalSenha.classList.add('oculto');
    } catch (e) {
      msg.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  await Promise.all([carregarEquipe(), carregarColaboradores(), carregarFeriados()]);
})();
