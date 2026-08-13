(async function () {
  // Se ja estiver logado, manda direto para o dashboard.
  try {
    await apiFetch('/api/me');
    window.location.href = '/dashboard.html';
    return;
  } catch (e) {
    // nao logado, segue para exibir o formulario
  }

  const form = document.getElementById('form-login');
  const areaMensagem = document.getElementById('area-mensagem');
  const btnEntrar = document.getElementById('btn-entrar');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    areaMensagem.innerHTML = '';
    btnEntrar.disabled = true;
    btnEntrar.textContent = 'Entrando...';
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    try {
      await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
      window.location.href = '/dashboard.html';
    } catch (e) {
      areaMensagem.innerHTML = `<div class="mensagem-erro">${e.message}</div>`;
      btnEntrar.disabled = false;
      btnEntrar.textContent = 'Entrar';
    }
  });
})();
