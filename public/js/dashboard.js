(async function () {
  const usuario = await montarTopo('ponto');
  if (!usuario) return;

  document.getElementById('perfil-nome').value = usuario.nome;
  document.getElementById('perfil-email').value = usuario.email;

  // ---------- Relógio ----------
  function atualizarRelogio() {
    const agora = new Date();
    const hora = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(agora);
    const data = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    }).format(agora);
    document.getElementById('relogio-hora').textContent = hora;
    document.getElementById('relogio-data').textContent = data;
  }
  atualizarRelogio();
  setInterval(atualizarRelogio, 1000);

  // ---------- Marcações de hoje ----------
  const ICONES = {
    entrada: '➡️',
    saida_intervalo: '🍽️',
    retorno_intervalo: '↩️',
    saida: '🏁',
  };

  async function carregarStatusHoje() {
    const dados = await apiFetch('/api/ponto/hoje');
    const btn = document.getElementById('btn-bater-ponto');
    document.getElementById('rotulo-proximo-icone').textContent = ICONES[dados.proximoTipo] || '🕓';
    document.getElementById('rotulo-proximo-texto').innerHTML =
      `Bater: ${dados.proximoLabel}<div class="rotulo-proximo">Toque para confirmar</div>`;
    btn.disabled = false;

    const avisoPlantao = document.getElementById('aviso-plantao-aberto');
    if (dados.sessaoAbertaDeOutroDia) {
      avisoPlantao.innerHTML = `Você tem uma marcação em aberto desde <strong>${dados.sessaoAbertaDesde}</strong> (plantão/sobreaviso que passou da meia-noite). O próximo toque no botão abaixo vai registrar: <strong>${dados.proximoLabel}</strong>.`;
      avisoPlantao.classList.remove('oculto');
    } else {
      avisoPlantao.classList.add('oculto');
      avisoPlantao.innerHTML = '';
    }

    const linha = document.getElementById('linha-do-tempo');
    if (!dados.registros.length) {
      linha.innerHTML = '<span class="texto-suave">Nenhuma marcação ainda hoje.</span>';
    } else {
      linha.innerHTML = dados.registros
        .map((r) => `
          <div class="marca-tempo">
            <div class="tipo">${ICONES[r.tipo] || ''} ${r.label}</div>
            <div class="hora">${r.hora}</div>
          </div>`)
        .join('');
    }

    const selectManual = document.getElementById('select-tipo-manual');
    selectManual.innerHTML = (dados.tiposDisponiveis || [])
      .map((t) => `<option value="${t.tipo}">${t.label}</option>`)
      .join('');
  }

  async function registrarPonto(tipoManual) {
    const areaMensagem = document.getElementById('area-mensagem');
    areaMensagem.innerHTML = '';
    try {
      const payload = tipoManual ? { tipoManual } : {};
      const resp = await apiFetch('/api/ponto', { method: 'POST', body: JSON.stringify(payload) });
      areaMensagem.innerHTML = `<div class="mensagem-sucesso">Ponto registrado: <strong>${resp.registro.label}</strong> às ${resp.registro.hora}.</div>`;
      document.getElementById('area-correcao-manual').classList.add('oculto');
      await carregarStatusHoje();
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  }

  document.getElementById('btn-bater-ponto').addEventListener('click', async () => {
    const btn = document.getElementById('btn-bater-ponto');
    btn.disabled = true;
    await registrarPonto(null);
    btn.disabled = false;
  });

  document.getElementById('btn-mostrar-correcao').addEventListener('click', () => {
    document.getElementById('area-correcao-manual').classList.toggle('oculto');
  });

  document.getElementById('btn-confirmar-correcao').addEventListener('click', async () => {
    const tipo = document.getElementById('select-tipo-manual').value;
    if (!tipo) return;
    if (!window.confirm('Confirma o registro manual deste tipo de marcação com o horário de agora?')) return;
    await registrarPonto(tipo);
  });

  await carregarStatusHoje();

  // ---------- Perfil ----------
  document.getElementById('form-perfil').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const areaMensagem = document.getElementById('area-mensagem-perfil');
    areaMensagem.innerHTML = '';
    try {
      await apiFetch('/api/me/perfil', {
        method: 'PUT',
        body: JSON.stringify({
          nome: document.getElementById('perfil-nome').value.trim(),
          email: document.getElementById('perfil-email').value.trim(),
        }),
      });
      areaMensagem.innerHTML = '<div class="mensagem-sucesso">Dados atualizados com sucesso.</div>';
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  document.getElementById('form-senha').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const areaMensagem = document.getElementById('area-mensagem-perfil');
    areaMensagem.innerHTML = '';
    const senhaAtual = document.getElementById('senha-atual').value;
    const novaSenha = document.getElementById('senha-nova').value;
    try {
      await apiFetch('/api/me/senha', { method: 'PUT', body: JSON.stringify({ senhaAtual, novaSenha }) });
      areaMensagem.innerHTML = '<div class="mensagem-sucesso">Senha alterada com sucesso.</div>';
      document.getElementById('form-senha').reset();
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  // ---------- Minhas justificativas ----------
  const TIPO_LABEL_JUSTIFICATIVA = {
    atraso: 'Atraso',
    falta: 'Falta',
    saida_antecipada: 'Saída antecipada',
    outro: 'Outro',
  };

  document.getElementById('just-data').value = hojeISO();

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  function formatarDataHoraBR(isoString) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(isoString));
  }

  async function carregarJustificativas() {
    const tbody = document.getElementById('tabela-justificativas');
    tbody.innerHTML = '<tr><td colspan="5" class="carregando">Carregando...</td></tr>';
    try {
      const dados = await apiFetch('/api/justificativas');
      if (!dados.justificativas.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="carregando">Nenhuma justificativa registrada ainda.</td></tr>';
        return;
      }
      tbody.innerHTML = dados.justificativas
        .map((j) => `
          <tr>
            <td>${formatarDataBR(j.data_referencia)}</td>
            <td>${TIPO_LABEL_JUSTIFICATIVA[j.tipo] || 'Outro'}</td>
            <td>${escaparHtml(j.descricao.length > 80 ? j.descricao.slice(0, 80) + '...' : j.descricao)}</td>
            <td>${formatarDataHoraBR(j.criado_em)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-pequeno btn-secundario" data-imprimir="${j.id}">Imprimir</button>
              <button class="btn btn-pequeno btn-secundario" data-excluir="${j.id}">Excluir</button>
            </td>
          </tr>`)
        .join('');
      tbody.querySelectorAll('[data-imprimir]').forEach((btn) => {
        btn.addEventListener('click', () => imprimirJustificativa(btn.dataset.imprimir));
      });
      tbody.querySelectorAll('[data-excluir]').forEach((btn) => {
        btn.addEventListener('click', () => excluirJustificativa(btn.dataset.excluir));
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }

  async function excluirJustificativa(id) {
    if (!window.confirm('Excluir esta justificativa?')) return;
    try {
      await apiFetch(`/api/justificativas/${id}`, { method: 'DELETE' });
      await carregarJustificativas();
    } catch (e) {
      document.getElementById('area-mensagem-justificativa').innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  }

  async function imprimirJustificativa(id) {
    try {
      const dados = await apiFetch(`/api/justificativas/${id}`);
      const j = dados.justificativa;
      const nome = (dados.funcionario && dados.funcionario.nome) || usuario.nome;
      const cargo = (dados.funcionario && dados.funcionario.cargo) || '';
      const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Justificativa - ${escaparHtml(nome)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 48px auto; color: #1c2b23; line-height: 1.6; }
  h1 { font-size: 1.2rem; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 32px; }
  .campo-imp { margin-bottom: 10px; }
  .rotulo-imp { font-weight: 700; }
  .texto-descricao { margin: 24px 0; white-space: pre-wrap; border: 1px solid #ccc; border-radius: 6px; padding: 16px; min-height: 100px; }
  .assinatura { margin-top: 72px; text-align: center; }
  .linha-assinatura { border-top: 1px solid #333; width: 320px; margin: 0 auto; padding-top: 6px; }
  @media print { body { margin: 20px; } }
</style>
</head><body>
  <h1>Justificativa de ponto</h1>
  <div class="campo-imp"><span class="rotulo-imp">Colaborador:</span> ${escaparHtml(nome)}${cargo ? ' — ' + escaparHtml(cargo) : ''}</div>
  <div class="campo-imp"><span class="rotulo-imp">Data referente:</span> ${escaparHtml(formatarDataBR(j.data_referencia))}</div>
  <div class="campo-imp"><span class="rotulo-imp">Motivo:</span> ${escaparHtml(dados.tipoLabel)}</div>
  <div class="campo-imp"><span class="rotulo-imp">Descrição:</span></div>
  <div class="texto-descricao">${escaparHtml(j.descricao)}</div>
  <div class="campo-imp">Documento gerado em ${escaparHtml(formatarDataHoraBR(j.criado_em))}.</div>
  <div class="assinatura">
    <div class="linha-assinatura">Assinatura do colaborador</div>
  </div>
</body></html>`;
      const janela = window.open('', '_blank');
      if (!janela) {
        window.alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.');
        return;
      }
      janela.document.open();
      janela.document.write(html);
      janela.document.close();
      janela.focus();
      janela.onload = () => janela.print();
      // Fallback caso onload não dispare (alguns navegadores com document.write).
      setTimeout(() => { try { janela.print(); } catch (err) {} }, 300);
    } catch (e) {
      document.getElementById('area-mensagem-justificativa').innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  }

  document.getElementById('form-justificativa').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const areaMensagem = document.getElementById('area-mensagem-justificativa');
    areaMensagem.innerHTML = '';
    try {
      await apiFetch('/api/justificativas', {
        method: 'POST',
        body: JSON.stringify({
          data_referencia: document.getElementById('just-data').value,
          tipo: document.getElementById('just-tipo').value,
          descricao: document.getElementById('just-descricao').value.trim(),
        }),
      });
      areaMensagem.innerHTML = '<div class="mensagem-sucesso">Justificativa salva. Você pode imprimi-la na lista abaixo.</div>';
      document.getElementById('just-descricao').value = '';
      await carregarJustificativas();
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
    }
  });

  await carregarJustificativas();
})();
