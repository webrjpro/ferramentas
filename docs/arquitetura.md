# Arquitetura

A página inicial fica na raiz; as demais ficam em `paginas/`. Os estilos ficam
em `css/` e os controladores JavaScript em `js/`. `js/core/` contém regras puras: recebe valores, devolve valores e não acessa
DOM, arquivos ou rede. Os controladores fazem leitura de arquivos, interação com a
página, progresso e downloads. Bibliotecas externas continuam carregadas pelas páginas.

| Ferramenta | Núcleo | Controlador |
| --- | --- | --- |
| Compressor de PDF | `js/core/pdf.js` | `js/app.js` |
| CSV Moodle | `js/core/conversor.js` | `js/conversor.js` |
| Documentos de alunos | `js/core/documentos.js` | `js/docalunos.js` |
| QR em PDF | `js/core/qr.js` | `js/extratordeqr.js` |
| Presença | `js/core/presenca.js` | `js/gerador-presenca.js` |

Os núcleos usam um único namespace (`window.FerramentasCore`) para manter a abertura
direta dos HTMLs pelo navegador, sem instalação ou compilação. Também podem ser
importados pelo Node nos testes. A ordem dos scripts é verificada por
`tools/check-project.mjs`.

`js/preferences.js` centraliza as preferências persistentes no IndexedDB. O tema
(`js/theme.js` e `css/theme.css`) é compartilhado pelas páginas, inclusive termos;
o aceite dos termos usa o mesmo banco. Arquivos importados e resultados gerados
permanecem apenas na memória da página até o download.

## Regras de desenvolvimento

1. Coloque transformações e contratos de CSV no núcleo correspondente. Mantenha no
   controlador apenas leitura, estado visual e download.
2. Acrescente testes com dados fictícios quando mudar formatos de saída ou regras
   de correspondência. Execute `npm run check` antes de publicar.
3. Não coloque planilhas, PDFs, ZIPs ou CSVs com dados de alunos no projeto.
   `.gitignore` cobre esses formatos; a checagem também falha quando aparecem no projeto.
4. Após uma versão aprovada, execute `node tools/update-integrity.mjs` para atualizar
   os hashes dos arquivos distribuídos.

Os processadores de PDF e presença ainda têm controladores grandes. A próxima
extração deve seguir responsabilidades reais (leitura, análise, geração e interface)
à medida que esses fluxos forem alterados. Dividir arquivos apenas pelo tamanho
criaria dependências difíceis de revisar sem melhorar o comportamento.
