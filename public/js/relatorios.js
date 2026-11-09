(async function () {
  const usuario = await montarTopo('relatorios');
  if (!usuario) return;

  const inputInicio = document.getElementById('filtro-inicio');
  const inputFim = document.getElementById('filtro-fim');
  const selectPreset = document.getElementById('filtro-preset');

  function aplicarPreset() {
    const { inicio, fim } = calcularPeriodoPreset(selectPreset.value);
    inputInicio.value = inicio;
    inputFim.value = fim;
  }
  aplicarPreset();
  selectPreset.addEventListener('change', () => {
    aplicarPreset();
    carregar();
  });

  async function carregar() {
    const tbody = document.getElementById('tabela-corpo');
    tbody.innerHTML = '<tr><td colspan="6" class="carregando">Carregando...</td></tr>';
    try {
      const params = new URLSearchParams({ inicio: inputInicio.value, fim: inputFim.value });
      const dados = await apiFetch(`/api/relatorio/meu?${params.toString()}`);
      renderizarResumo(document.getElementById('grade-resumo'), dados.totais);
      renderizarTabelaRelatorio(tbody, dados.dias);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="mensagem-erro">${e.message}</div></td></tr>`;
    }
  }

  document.getElementById('btn-filtrar').addEventListener('click', carregar);

  function exportar(formato) {
    const params = new URLSearchParams({ inicio: inputInicio.value, fim: inputFim.value, formato });
    window.location.href = `/api/relatorio/meu/exportar?${params.toString()}`;
  }
  document.getElementById('btn-exportar-csv').addEventListener('click', () => exportar('csv'));
  document.getElementById('btn-exportar-pdf').addEventListener('click', () => exportar('pdf'));

  await carregar();
})();
