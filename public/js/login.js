(async function () {
  // Se já estiver logado, manda direto para a tela certa: administradores vão
  // direto para o painel de administração (não têm botão de bater ponto),
  // colaboradores vão para o dashboard de ponto.
  try {
    const dados = await apiFetch('/api/me');
    window.location.href = dados.usuario.is_admin ? '/admin.html' : '/dashboard.html';
    return;
  } catch (e) {
    // não logado, segue para exibir o formulário
  }

  const form = document.getElementById('form-login');
  const areaMensagem = document.getElementById('area-mensagem');
  const btnEntrar = document.getElementById('btn-entrar');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    areaMensagem.innerHTML = '';
    btnEntrar.disabled = true;
    btnEntrar.textContent = 'Entrando...';
    const login = document.getElementById('login').value.trim();
    const senha = document.getElementById('senha').value;
    try {
      const resp = await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ login, senha }) });
      window.location.href = resp.usuario.is_admin ? '/admin.html' : '/dashboard.html';
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
      btnEntrar.disabled = false;
      btnEntrar.textContent = 'Entrar';
    }
  });
})();
