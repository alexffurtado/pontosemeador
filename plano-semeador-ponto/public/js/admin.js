(async function () {
  const usuario = await montarTopo('admin');
  if (!usuario) return;
  if (!usuario.is_admin) {
    document.querySelector('main').innerHTML = '<div class="card"><div class="mensagem-erro">Acesso restrito a administradores.</div></div>';
    return;
  }

  const DIAS_SEMANA_CURTO = [
    { valor: 0, label: 'Dom' }, { valor: 1, label: 'Seg' }, { valor: 2, label: 'Ter' },
    { valor: 3, label: 'Qua' }, { valor: 4, label: 'Qui' }, { valor: 5, label: 'Sex' }, { valor: 6, label: 'Sab' },
  ];

  // ===================== Relatorio consolidado da equipe =====================
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
    tbody.innerHTML = '<tr><td colspan="8" class="carregando">Carregando...</td></tr>';
    try {
      const params = new URLSearchParams({ inicio: inputInicio.value, fim: inputFim.value });
      const dados = await apiFetch(`/api/relatorio/equipe?${params.toString()}`);
      if (!dados.linhas.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="carregando">Nenhum colaborador cadastrado.</td></tr>';
        return;
      }
      tbody.innerHTML = dados.linhas
        .map(({ funcionario: f, totais: t }) => `
          <tr>
            <td>${f.nome}${f.is_admin ? ' <span class="tag tag-admin">Admin</span>' : ''}</td>
            <td>${f.cargo || '-'}</td>
            <td>${minutosParaHoras(t.minutosTrabalhados)}</td>
            <td>${t.minutosAtraso > 0 ? `<span class="tag tag-atraso">${minutosParaHoras(t.minutosAtraso)}</span>` : '-'}</td>
            <td>${t.minutosSaidaAntecipada > 0 ? `<span class="tag tag-atraso">${minutosParaHoras(t.minutosSaidaAntecipada)}</span>` : '-'}</td>
            <td>${t.diasComFalta > 0 ? `<span class="tag tag-falta">${t.diasComFalta}</span>` : '0'}</td>
            <td>${t.diasComInconsistencia > 0 ? `<span class="tag tag-falta">${t.diasComInconsistencia}</span>` : '0'}</td>
            <td><button class="btn btn-pequeno btn-secundario" data-detalhar="${f.id}" data-nome="${f.nome}">Detalhar</button></td>
          </tr>`)
        .join('');
      tbody.querySelectorAll('[data-detalhar]').forEach((btn) => {
        btn.addEventListener('click', () => abrirDetalhe(btn.dataset.detalhar, btn.dataset.nome));
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="mensagem-erro">${e.message}</div></td></tr>`;
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

  // ===================== Lista de colaboradores =====================
  async function carregarColaboradores() {
    const tbody = document.getElementById('tabela-colaboradores');
    tbody.innerHTML = '<tr><td colspan="6" class="carregando">Carregando...</td></tr>';
    try {
      const dados = await apiFetch('/api/funcionarios');
      window.__colaboradores = dados.funcionarios;
      tbody.innerHTML = dados.funcionarios
        .map((f) => `
          <tr>
            <td>${f.nome}${f.is_admin ? ' <span class="tag tag-admin">Admin</span>' : ''}</td>
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
      tbody.querySelectorAll('[data-editar]').forEach((btn) => btn.addEventListener('click', () => abrirEdicao(btn.dataset.editar)));
      tbody.querySelectorAll('[data-senha]').forEach((btn) => btn.addEventListener('click', () => abrirModalSenha(btn.dataset.senha)));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="mensagem-erro">${e.message}</div></td></tr>`;
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

  function fecharModalColaborador() { modalColaborador.classList.add('oculto'); }

  function abrirNovoColaborador() {
    formColaborador.reset();
    document.getElementById('col-id').value = '';
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
    ['0', '1', '2', '3', '4', '5', '6'].forEach((v) => {
      document.getElementById(`col-dia-${v}`).checked = ['1', '2', '3', '4', '5'].includes(v);
    });
    modalColaborador.classList.remove('oculto');
  }

  function abrirEdicao(id) {
    const f = (window.__colaboradores || []).find((x) => String(x.id) === String(id));
    if (!f) return;
    formColaborador.reset();
    document.getElementById('modal-colaborador-mensagem').innerHTML = '';
    document.getElementById('modal-colaborador-titulo').textContent = 'Editar colaborador';
    document.getElementById('col-id').value = f.id;
    document.getElementById('col-nome').value = f.nome;
    document.getElementById('col-email').value = f.email;
    document.getElementById('col-cargo').value = f.cargo || '';
    document.getElementById('col-entrada').value = f.jornada_entrada;
    document.getElementById('col-saida').value = f.jornada_saida;
    document.getElementById('col-carga').value = f.carga_horaria_diaria_minutos / 60;
    document.getElementById('col-tolerancia').value = f.tolerancia_minutos;
    document.getElementById('col-admin').checked = f.is_admin;
    document.getElementById('col-ativo').checked = f.ativo;
    document.getElementById('col-verificar-atraso').checked = f.verificar_atraso !== false;
    document.getElementById('col-verificar-saida-antecipada').checked = f.verificar_saida_antecipada !== false;
    document.getElementById('campo-col-senha').classList.add('oculto');
    document.getElementById('col-senha').required = false;
    document.getElementById('campo-col-ativo').classList.remove('oculto');
    const diasAtivos = String(f.dias_trabalho).split(',').map((s) => s.trim());
    ['0', '1', '2', '3', '4', '5', '6'].forEach((v) => {
      document.getElementById(`col-dia-${v}`).checked = diasAtivos.includes(v);
    });
    modalColaborador.classList.remove('oculto');
  }

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

  // ===================== Modal detalhe / relatorio individual =====================
  const modalDetalhe = document.getElementById('modal-detalhe');
  let detalheFuncionarioId = null;

  async function abrirDetalhe(id, nome) {
    detalheFuncionarioId = id;
    document.getElementById('detalhe-titulo').textContent = `Relatorio de ${nome}`;
    const { inicio, fim } = calcularPeriodoPreset('30dias');
    document.getElementById('detalhe-inicio').value = inicio;
    document.getElementById('detalhe-fim').value = fim;
    document.getElementById('ajuste-data').value = hojeISO();
    document.getElementById('detalhe-ajuste-mensagem').innerHTML = '';
    modalDetalhe.classList.remove('oculto');
    await carregarDetalhe();
  }

  async function carregarDetalhe() {
    const tbody = document.getElementById('detalhe-tabela');
    tbody.innerHTML = '<tr><td colspan="5" class="carregando">Carregando...</td></tr>';
    try {
      const params = new URLSearchParams({
        inicio: document.getElementById('detalhe-inicio').value,
        fim: document.getElementById('detalhe-fim').value,
      });
      const dados = await apiFetch(`/api/funcionarios/${detalheFuncionarioId}/relatorio?${params.toString()}`);
      renderizarResumo(document.getElementById('detalhe-resumo'), dados.totais);
      renderizarTabelaRelatorio(tbody, dados.dias);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }

  document.getElementById('btn-detalhe-filtrar').addEventListener('click', carregarDetalhe);
  document.getElementById('btn-fechar-detalhe').addEventListener('click', () => {
    modalDetalhe.classList.add('oculto');
    carregarEquipe();
  });
  document.getElementById('btn-detalhe-csv').addEventListener('click', () => {
    const params = new URLSearchParams({
      inicio: document.getElementById('detalhe-inicio').value,
      fim: document.getElementById('detalhe-fim').value,
      formato: 'csv',
    });
    window.location.href = `/api/funcionarios/${detalheFuncionarioId}/relatorio/exportar?${params.toString()}`;
  });
  document.getElementById('btn-detalhe-pdf').addEventListener('click', () => {
    const params = new URLSearchParams({
      inicio: document.getElementById('detalhe-inicio').value,
      fim: document.getElementById('detalhe-fim').value,
      formato: 'pdf',
    });
    window.location.href = `/api/funcionarios/${detalheFuncionarioId}/relatorio/exportar?${params.toString()}`;
  });

  document.getElementById('form-ajuste').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('detalhe-ajuste-mensagem');
    msg.innerHTML = '';
    try {
      await apiFetch(`/api/funcionarios/${detalheFuncionarioId}/registros`, {
        method: 'POST',
        body: JSON.stringify({
          data: document.getElementById('ajuste-data').value,
          hora: document.getElementById('ajuste-hora').value,
          tipo: document.getElementById('ajuste-tipo').value,
        }),
      });
      msg.innerHTML = '<div class="mensagem-sucesso">Marcacao adicionada com sucesso.</div>';
      await carregarDetalhe();
    } catch (e) {
      msg.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  await Promise.all([carregarEquipe(), carregarColaboradores()]);
})();
