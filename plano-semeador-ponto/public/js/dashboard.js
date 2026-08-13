(async function () {
  const usuario = await montarTopo('ponto');
  if (!usuario) return;

  document.getElementById('perfil-nome').value = usuario.nome;
  document.getElementById('perfil-email').value = usuario.email;

  // ---------- Relogio ----------
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

  // ---------- Marcacoes de hoje ----------
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

    const linha = document.getElementById('linha-do-tempo');
    if (!dados.registros.length) {
      linha.innerHTML = '<span class="texto-suave">Nenhuma marcacao ainda hoje.</span>';
    } else {
      linha.innerHTML = dados.registros
        .map((r) => `
          <div class="marca-tempo">
            <div class="tipo">${ICONES[r.tipo] || ''} ${r.label}</div>
            <div class="hora">${r.hora}</div>
          </div>`)
        .join('');
    }
  }

  document.getElementById('btn-bater-ponto').addEventListener('click', async () => {
    const btn = document.getElementById('btn-bater-ponto');
    const areaMensagem = document.getElementById('area-mensagem');
    btn.disabled = true;
    areaMensagem.innerHTML = '';
    try {
      const resp = await apiFetch('/api/ponto', { method: 'POST', body: JSON.stringify({}) });
      areaMensagem.innerHTML = `<div class="mensagem-sucesso">Ponto registrado: <strong>${resp.registro.label}</strong> as ${resp.registro.hora}.</div>`;
      await carregarStatusHoje();
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
      btn.disabled = false;
    }
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
})();
