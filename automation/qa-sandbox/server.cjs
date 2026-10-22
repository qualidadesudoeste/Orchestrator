const http = require("node:http");

const page = String.raw`<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sandbox neutra de QA</title></head>
<body>
  <main>
    <h1>Sandbox neutra de QA</h1>
    <p id="status" role="status">Pronta para testes</p>
    <form id="form" novalidate>
      <label for="name">Nome do item</label>
      <input id="name" name="name" required autocomplete="off">
      <button type="submit">Adicionar item</button>
      <p id="error" role="alert" hidden>Informe o nome do item.</p>
    </form>
    <label for="filter">Filtrar itens</label>
    <input id="filter" aria-label="Filtrar itens" autocomplete="off">
    <ul id="items" aria-label="Itens cadastrados"></ul>
    <p id="empty">Nenhum item cadastrado</p>
    <button id="download" type="button">Baixar relatório</button>
  </main>
  <script>
    const form = document.querySelector('#form');
    const nameInput = document.querySelector('#name');
    const filterInput = document.querySelector('#filter');
    const error = document.querySelector('#error');
    const list = document.querySelector('#items');
    const empty = document.querySelector('#empty');
    let items = JSON.parse(sessionStorage.getItem('qa-sandbox-items') || '[]');
    function render() {
      const query = filterInput.value.trim().toLowerCase();
      const visible = items.filter(item => item.toLowerCase().includes(query));
      list.replaceChildren(...visible.map(item => Object.assign(document.createElement('li'), { textContent: item })));
      empty.textContent = items.length ? 'Nenhum item encontrado' : 'Nenhum item cadastrado';
      empty.hidden = visible.length > 0;
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = nameInput.value.trim();
      error.hidden = Boolean(value);
      if (!value) return;
      items.push(value);
      sessionStorage.setItem('qa-sandbox-items', JSON.stringify(items));
      nameInput.value = '';
      document.querySelector('#status').textContent = 'Item adicionado com sucesso';
      render();
    });
    filterInput.addEventListener('input', render);
    document.querySelector('#download').addEventListener('click', () => {
      const blob = new Blob(['nome\\n' + items.join('\\n')], { type: 'text/csv' });
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'relatorio-sandbox.csv' });
      link.click();
      URL.revokeObjectURL(link.href);
    });
    render();
  </script>
</body></html>`;

function startSandbox(port = 0) {
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

module.exports = { startSandbox };

if (require.main === module) {
  startSandbox(Number(process.env.PORT || 4179)).then(server => {
    console.log(`Sandbox disponível em http://127.0.0.1:${server.address().port}`);
  });
}
