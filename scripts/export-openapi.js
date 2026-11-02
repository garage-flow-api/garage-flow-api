#!/usr/bin/env node
// Baixa o OpenAPI da API em execução e salva em docs/openapi.json.
// Uso: node scripts/export-openapi.js [url] [arquivo-de-saida]
const fs = require('node:fs');
const path = require('node:path');

const url = process.argv[2] || 'http://localhost:3000/docs-json';
const out = process.argv[3] || 'docs/openapi.json';

async function main() {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
  }
  const document = await response.json();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
  console.log(`OpenAPI salvo em ${out}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
