(async function () {
  const usuario = await montarTopo('admin');
  if (!usuario) return;
  if (!usuario.is_admin) {
    document.querySelector('main').innerHTML = '<div class="card"><div class="mensagem-erro">Acesso restrito a administradores.</div></div>';
    return;
  }

  const funcionarioId = new URLSearchParams(window.location.search).get('id');
  if (!funcionarioId) {
    document.querySelector('main').innerHTML = '<div class="card"><div class="mensagem-erro">Colaborador não informado. Volte para a administração e tente novamente.</div></div>';
    return;
  }

  const DIAS_SEMANA_CURTO = [
    { valor: 0, label: 'Dom' }, { valor: 1, label: 'Seg' }, { valor: 2, label: 'Ter' },
    { valor: 3, label: 'Qua' }, { valor: 4, label: 'Qui' }, { valor: 5, label: 'Sex' }, { valor: 6, label: 'Sáb' },
  ];
  const DIAS_SEMANA_NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  // ===================== Dados do colaborador (form) =====================
  const formColaborador = document.getElementById('form-colaborador');
  const diasContainer = document.getElementById('col-dias');

  DIAS_SEMANA_CURTO.forEach((d) => {
    const id = `col-dia-${d.valor}`;
    const wrapper = document.createElement('label');
    wrapper.style.cssText = 'display:flex; align-items:center; gap:4px; font-weight:400; font-size:0.85rem;';
    wrapper.innerHTML = `<input type="checkbox" id="${id}" value="${d.valor}" style="width:auto;"> ${d.label}`;
    diasContainer.appendChild(wrapper);
  });

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
        <label style="display:flex; align-items:center; gap:4px; font-weight:400; font-size:0.85rem;" title="Desmarque se esse dia não tem intervalo de almoço (ex.: sábado de meio período) — o botão de bater ponto só pede entrada e saída nesse dia.">
          <input type="checkbox" id="hsem-tem-intervalo-${dia}" style="width:auto;" checked> Almoço
        </label>
        <input type="number" id="hsem-almoco-${dia}" min="0" max="240" step="5" placeholder="Minutos" style="max-width:90px;">
        <span class="texto-suave" id="hsem-carga-exibida-${dia}" style="min-width:90px; font-size:0.8rem;"></span>
      </div>`).join('');
    DIAS_SEMANA_NOMES.forEach((_, dia) => {
      document.getElementById(`hsem-ativo-${dia}`).addEventListener('change', () => atualizarLinhaHorarioSemana(dia));
      document.getElementById(`hsem-tem-intervalo-${dia}`).addEventListener('change', () => atualizarLinhaHorarioSemana(dia));
      ['entrada', 'saida', 'almoco'].forEach((campo) => {
        document.getElementById(`hsem-${campo}-${dia}`).addEventListener('input', () => atualizarCargaExibidaDia(dia));
      });
      atualizarLinhaHorarioSemana(dia);
    });
  }
  // Mostra, ao lado de cada dia, a carga diária que vai ser calculada (entrada
  // − saída − almoço) — o admin nunca digita essa carga diretamente.
  function atualizarCargaExibidaDia(dia) {
    const spanExibicao = document.getElementById(`hsem-carga-exibida-${dia}`);
    const ativo = document.getElementById(`hsem-ativo-${dia}`).checked;
    if (!ativo) { spanExibicao.textContent = ''; return; }
    const temIntervalo = document.getElementById(`hsem-tem-intervalo-${dia}`).checked;
    const almoco = temIntervalo ? document.getElementById(`hsem-almoco-${dia}`).value : 0;
    const carga = calcularCargaMinutosCliente(
      document.getElementById(`hsem-entrada-${dia}`).value,
      document.getElementById(`hsem-saida-${dia}`).value,
      almoco
    );
    spanExibicao.textContent = carga != null ? `Carga: ${minutosParaHoras(carga)}` : '';
  }
  function atualizarLinhaHorarioSemana(dia) {
    const ativo = document.getElementById(`hsem-ativo-${dia}`).checked;
    ['entrada', 'saida', 'tem-intervalo'].forEach((campo) => {
      document.getElementById(`hsem-${campo}-${dia}`).disabled = !ativo;
    });
    const temIntervalo = document.getElementById(`hsem-tem-intervalo-${dia}`).checked;
    const campoAlmoco = document.getElementById(`hsem-almoco-${dia}`);
    campoAlmoco.disabled = !ativo || !temIntervalo;
    if (!temIntervalo) campoAlmoco.value = 0;
    atualizarCargaExibidaDia(dia);
  }
  function preencherHorariosSemana(horariosSemana) {
    for (let dia = 0; dia <= 6; dia++) {
      const cfg = Array.isArray(horariosSemana) ? horariosSemana.find((h) => h.dia === dia) : null;
      document.getElementById(`hsem-ativo-${dia}`).checked = !!(cfg && cfg.ativo);
      document.getElementById(`hsem-entrada-${dia}`).value = (cfg && cfg.entrada) || '';
      document.getElementById(`hsem-saida-${dia}`).value = (cfg && cfg.saida) || '';
      const temIntervaloCfg = cfg && cfg.ativo ? cfg.tem_intervalo !== false : true;
      document.getElementById(`hsem-tem-intervalo-${dia}`).checked = temIntervaloCfg;
      // Compatível com configurações salvas antes do campo de almoço explícito
      // existir: deriva o valor a partir da carga que já estava configurada,
      // em vez de assumir um padrão que poderia mudar a carga calculada.
      let almocoMin = 60;
      if (cfg && cfg.ativo && temIntervaloCfg) {
        if (cfg.almoco_minutos != null) {
          almocoMin = cfg.almoco_minutos;
        } else {
          const span = calcularCargaMinutosCliente(cfg.entrada, cfg.saida, 0);
          almocoMin = span != null ? Math.max(0, span - (cfg.carga_minutos || 0)) : 60;
        }
      }
      document.getElementById(`hsem-almoco-${dia}`).value = cfg && cfg.ativo ? almocoMin : '';
      atualizarLinhaHorarioSemana(dia);
    }
  }
  function lerHorariosSemana() {
    const lista = [];
    for (let dia = 0; dia <= 6; dia++) {
      const ativo = document.getElementById(`hsem-ativo-${dia}`).checked;
      const temIntervalo = ativo ? document.getElementById(`hsem-tem-intervalo-${dia}`).checked : true;
      lista.push({
        dia,
        ativo,
        entrada: ativo ? document.getElementById(`hsem-entrada-${dia}`).value : null,
        saida: ativo ? document.getElementById(`hsem-saida-${dia}`).value : null,
        almoco_minutos: ativo && temIntervalo ? Math.round(Number(document.getElementById(`hsem-almoco-${dia}`).value || 0)) : 0,
        tem_intervalo: temIntervalo,
      });
    }
    return lista;
  }
  montarTabelaHorariosSemana();

  // ===================== Carga diária calculada (jornada padrão/semanal) =====================
  // Só mostra os campos de almoço/carga padrão quando a jornada padrão (acima)
  // é realmente a que vale pro colaborador — ou seja, 12x36 ou "semanal"
  // sem horário personalizado por dia (nesse último caso cada dia tem seu
  // próprio almoço, configurado na tabela de horários por dia da semana).
  function atualizarCargaCalculadaFlat() {
    const temIntervalo = document.getElementById('col-tem-intervalo').checked;
    const is12x36 = document.getElementById('col-tipo-escala').value === '12x36';
    const personalizado = document.getElementById('col-horario-personalizado').checked;
    const usaJornadaPadrao = is12x36 || !personalizado;
    document.getElementById('campo-col-almoco').classList.toggle('oculto', !(usaJornadaPadrao && temIntervalo));
    document.getElementById('campo-col-desconta-almoco').classList.toggle('oculto', !(usaJornadaPadrao && temIntervalo));
    if (!temIntervalo) document.getElementById('col-desconta-almoco').checked = false;
    const almoco = temIntervalo ? document.getElementById('col-almoco').value : 0;
    const carga = calcularCargaMinutosCliente(
      document.getElementById('col-entrada').value,
      document.getElementById('col-saida').value,
      almoco
    );
    document.getElementById('col-carga-calculada').value = carga != null ? minutosParaHoras(carga) : '';
  }
  ['col-entrada', 'col-saida', 'col-almoco'].forEach((id) => {
    document.getElementById(id).addEventListener('input', atualizarCargaCalculadaFlat);
  });
  document.getElementById('col-tem-intervalo').addEventListener('change', atualizarCargaCalculadaFlat);

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
    atualizarCargaCalculadaFlat();
  }
  document.getElementById('col-tipo-escala').addEventListener('change', () => {
    if (document.getElementById('col-tipo-escala').value === '12x36') {
      document.getElementById('col-horario-personalizado').checked = false;
    }
    atualizarVisibilidadeEscala();
  });
  document.getElementById('col-horario-personalizado').addEventListener('change', atualizarVisibilidadeEscala);

  let funcionarioAtual = null;

  function preencherFormulario(f) {
    document.getElementById('col-nome').value = f.nome;
    document.getElementById('col-login').value = f.login || '';
    document.getElementById('col-email').value = f.email;
    document.getElementById('col-cargo').value = f.cargo || '';
    document.getElementById('col-entrada').value = f.jornada_entrada;
    document.getElementById('col-saida').value = f.jornada_saida;
    document.getElementById('col-almoco').value = f.almoco_padrao_minutos != null ? f.almoco_padrao_minutos : 60;
    document.getElementById('col-desconta-almoco').checked = !!f.desconta_almoco_quando_nao_bate;
    document.getElementById('col-tolerancia').value = f.tolerancia_minutos;
    document.getElementById('col-admin').checked = f.is_admin;
    document.getElementById('col-ativo').checked = f.ativo;
    document.getElementById('col-verificar-atraso').checked = f.verificar_atraso !== false;
    document.getElementById('col-verificar-saida-antecipada').checked = f.verificar_saida_antecipada !== false;
    document.getElementById('col-tem-intervalo').checked = f.tem_intervalo !== false;
    const diasAtivos = String(f.dias_trabalho).split(',').map((s) => s.trim());
    ['0', '1', '2', '3', '4', '5', '6'].forEach((v) => {
      document.getElementById(`col-dia-${v}`).checked = diasAtivos.includes(v);
    });
    document.getElementById('col-tipo-escala').value = f.tipo_escala === '12x36' ? '12x36' : 'semanal';
    document.getElementById('col-escala-referencia').value = f.escala_data_referencia || hojeISO();
    document.getElementById('col-horario-personalizado').checked = !!f.horario_personalizado_semana;
    preencherHorariosSemana(f.horarios_semana);
    atualizarVisibilidadeEscala();
    atualizarCargaCalculadaFlat();

    document.getElementById('pagina-titulo').childNodes[0].textContent = f.nome;
    const tags = [];
    if (f.is_admin) tags.push('<span class="tag tag-admin">Admin</span>');
    tags.push(f.ativo ? '<span class="tag tag-ok">Ativo</span>' : '<span class="tag tag-inativo">Inativo</span>');
    document.getElementById('pagina-subtitulo').innerHTML = `${f.cargo ? f.cargo + ' — ' : ''}${f.email} &nbsp; ${tags.join(' ')}`;
    document.title = `${f.nome} - Plano Semeador`;
  }

  async function carregarFuncionario() {
    try {
      const dados = await apiFetch(`/api/funcionarios/${funcionarioId}`);
      funcionarioAtual = dados.funcionario;
      preencherFormulario(funcionarioAtual);
    } catch (e) {
      document.querySelector('main').innerHTML = `<div class="card"><div class="mensagem-erro">${e.message}</div></div>`;
      throw e;
    }
  }

  formColaborador.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('dados-mensagem');
    msg.innerHTML = '';
    const diasSelecionados = DIAS_SEMANA_CURTO.filter((d) => document.getElementById(`col-dia-${d.valor}`).checked).map((d) => d.valor);
    const payload = {
      nome: document.getElementById('col-nome').value.trim(),
      login: document.getElementById('col-login').value.trim(),
      email: document.getElementById('col-email').value.trim(),
      cargo: document.getElementById('col-cargo').value.trim(),
      jornada_entrada: document.getElementById('col-entrada').value,
      jornada_saida: document.getElementById('col-saida').value,
      almoco_padrao_minutos: Math.round(Number(document.getElementById('col-almoco').value || 0)),
      desconta_almoco_quando_nao_bate: document.getElementById('col-desconta-almoco').checked,
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
    try {
      const resp = await apiFetch(`/api/funcionarios/${funcionarioId}`, { method: 'PUT', body: JSON.stringify(payload) });
      funcionarioAtual = resp.funcionario;
      preencherFormulario(funcionarioAtual);
      msg.innerHTML = '<div class="mensagem-sucesso">Dados salvos com sucesso.</div>';
    } catch (e) {
      msg.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  // ===================== Redefinir senha =====================
  document.getElementById('form-senha-admin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('senha-mensagem');
    msg.innerHTML = '';
    const novaSenha = document.getElementById('senha-nova-admin').value;
    try {
      await apiFetch(`/api/funcionarios/${funcionarioId}/senha`, { method: 'PUT', body: JSON.stringify({ novaSenha }) });
      msg.innerHTML = '<div class="mensagem-sucesso">Senha redefinida com sucesso.</div>';
      document.getElementById('form-senha-admin').reset();
    } catch (e) {
      msg.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  // ===================== Relatório de ponto =====================
  const TIPO_LABEL_JUSTIFICATIVA = {
    atraso: 'Atraso',
    falta: 'Falta',
    saida_antecipada: 'Saída antecipada',
    outro: 'Outro',
  };

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  // Igual ao marcacoesDoDia() do common.js, mas com um botão de excluir em
  // cada marcação — usado só na tela de admin, pra corrigir/remover
  // lançamentos errados (ex.: gerados por um esquecimento de sequência).
  function marcacoesComExclusao(dia) {
    if (!dia.eventos.length) return '<span class="texto-suave">-</span>';
    const chips = dia.eventos
      .map(
        (e) => `
        <span class="marca-chip" title="${e.label}">
          ${TIPO_ABREV[e.tipo] || '?'} ${e.hora}
          ${e.id ? `<button type="button" class="btn-excluir-marca" data-excluir-marca="${e.id}" title="Excluir esta marcação">&times;</button>` : ''}
        </span>`
      )
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

  async function carregarDetalhe() {
    const tbody = document.getElementById('detalhe-tabela');
    tbody.innerHTML = '<tr><td colspan="6" class="carregando">Carregando...</td></tr>';
    try {
      const params = new URLSearchParams({
        inicio: document.getElementById('detalhe-inicio').value,
        fim: document.getElementById('detalhe-fim').value,
      });
      const dados = await apiFetch(`/api/funcionarios/${funcionarioId}/relatorio?${params.toString()}`);
      renderizarResumo(document.getElementById('detalhe-resumo'), dados.totais);
      renderizarTabelaRelatorio(tbody, dados.dias, {
        marcacoesRenderer: marcacoesComExclusao,
        afterRender: () => {
          tbody.querySelectorAll('[data-excluir-marca]').forEach((btn) => {
            btn.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              if (!window.confirm('Excluir esta marcação? Isso pode alterar as horas calculadas do dia.')) return;
              try {
                await apiFetch(`/api/registros/${btn.dataset.excluirMarca}`, { method: 'DELETE' });
                await carregarDetalhe();
              } catch (e) {
                document.getElementById('detalhe-ajuste-mensagem').innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
              }
            });
          });
        },
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }

  document.getElementById('btn-detalhe-filtrar').addEventListener('click', carregarDetalhe);
  document.getElementById('btn-detalhe-csv').addEventListener('click', () => {
    const params = new URLSearchParams({
      inicio: document.getElementById('detalhe-inicio').value,
      fim: document.getElementById('detalhe-fim').value,
      formato: 'csv',
    });
    window.location.href = `/api/funcionarios/${funcionarioId}/relatorio/exportar?${params.toString()}`;
  });
  document.getElementById('btn-detalhe-pdf').addEventListener('click', () => {
    const params = new URLSearchParams({
      inicio: document.getElementById('detalhe-inicio').value,
      fim: document.getElementById('detalhe-fim').value,
      formato: 'pdf',
    });
    window.location.href = `/api/funcionarios/${funcionarioId}/relatorio/exportar?${params.toString()}`;
  });

  document.getElementById('form-ajuste').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('detalhe-ajuste-mensagem');
    msg.innerHTML = '';
    try {
      await apiFetch(`/api/funcionarios/${funcionarioId}/registros`, {
        method: 'POST',
        body: JSON.stringify({
          data: document.getElementById('ajuste-data').value,
          hora: document.getElementById('ajuste-hora').value,
          tipo: document.getElementById('ajuste-tipo').value,
        }),
      });
      msg.innerHTML = '<div class="mensagem-sucesso">Marcação adicionada com sucesso.</div>';
      await carregarDetalhe();
    } catch (e) {
      msg.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  // ===================== Justificativas =====================
  async function carregarJustificativasDetalhe() {
    const tbody = document.getElementById('detalhe-justificativas');
    tbody.innerHTML = '<tr><td colspan="4" class="carregando">Carregando...</td></tr>';
    try {
      const dados = await apiFetch(`/api/funcionarios/${funcionarioId}/justificativas`);
      if (!dados.justificativas.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="carregando">Nenhuma justificativa enviada.</td></tr>';
        return;
      }
      tbody.innerHTML = dados.justificativas
        .map((j) => `
          <tr>
            <td>${formatarDataBR(j.data_referencia)}</td>
            <td>${TIPO_LABEL_JUSTIFICATIVA[j.tipo] || 'Outro'}</td>
            <td>${escaparHtml(j.descricao)}</td>
            <td>${formatarDataBR(j.criado_em.slice(0, 10))}</td>
          </tr>`)
        .join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }

  // ===================== Inicialização =====================
  const { inicio, fim } = calcularPeriodoPreset('30dias');
  document.getElementById('detalhe-inicio').value = inicio;
  document.getElementById('detalhe-fim').value = fim;
  document.getElementById('ajuste-data').value = hojeISO();

  await carregarFuncionario();
  await Promise.all([carregarDetalhe(), carregarJustificativasDetalhe()]);
})();
