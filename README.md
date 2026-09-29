# Ferramentas locais

Conjunto gratuito de ferramentas que funciona diretamente no navegador. Os arquivos
sao processados localmente e nao sao enviados para um servidor.

## Arquitetura e verificacao

Cada pagina possui um controlador para interface, leitura de arquivos e downloads.
As regras de transformacao independentes da interface ficam em `js/core/` e sao
testadas com dados ficticios. A estrutura e as responsabilidades estao descritas
em `docs/arquitetura.md`.

Todas as paginas oferecem temas claro e escuro. A escolha e o aceite dos termos
sao salvos no IndexedDB do navegador (`ferramentas-locais`); as planilhas e os
documentos carregados nao sao guardados no banco. Para compartilhar a preferencia
entre paginas, abra todas pelo mesmo endereco local. Alguns navegadores restringem
o IndexedDB em `file://`; nesse caso, use o servidor HTTP local indicado abaixo.

Para verificar o projeto com Node.js 20 ou superior, sem instalar dependencias:

```powershell
npm run check
```

Esse comando confere scripts e referencias locais, impede arquivos de dados no
projeto e executa os testes. Planilhas, PDFs e CSVs pessoais devem permanecer
fora desta pasta. Para atualizar o registro SHA-256 depois de uma alteracao:

```powershell
node tools/update-integrity.mjs
```

## Ferramentas disponiveis

- `index.html`: compressor adaptativo de PDF.
- `paginas/conversor.html`: conversor de Excel/CSV para CSV estruturado para Moodle.
- `paginas/docalunos.html`: auditoria e organizacao dos documentos de cada aluno em ZIPs.
- `paginas/extratordeqr.html`: extracao de QRs de PDFs e insercao nos certificados correspondentes.
- `paginas/gerador-presenca.html`: gerador de ZIP com CSVs para criar sessoes no Moodle.

O conversor aceita `.xlsx`, `.xls` e `.csv`, permite escolher a aba, detecta o
cabecalho, sugere o mapeamento das colunas e permite corrigir cada correspondencia.
Ele exporta um CSV para Moodle e uma copia CSV completa. Nenhuma senha e criada.

## Autoria e licenca

Copyright (c) 2026 Carlos Antonio de Oliveira Piquet. Todos os direitos reservados.

O uso gratuito das ferramentas nao autoriza copiar, revender, redistribuir, remover
os creditos ou apresentar o projeto como sendo de outra pessoa. Consulte `LICENSE`
e `paginas/termos.html`. O arquivo `REGISTRO_DE_VERSAO.txt` contem os hashes SHA-256 desta
versao para verificacao de integridade.

## Compressor de PDF

### O que mudou

- Meta padrao de 15 MB por PDF.
- Motor adaptativo com orcamento de bytes por pagina.
- Analise previa de complexidade para preservar mais qualidade onde ela importa.
- Busca binaria da melhor qualidade JPEG que cabe no limite.
- Resolucao ajustada somente quando reduzir a qualidade JPEG nao e suficiente.
- Processamento binario, sem Base64, para reduzir o consumo de memoria.
- Um arquivo grande por vez, com liberacao de canvas entre paginas.
- Progresso real, cancelamento seguro e relatorio de reducao.
- Arrastar e soltar, interface responsiva e novo layout profissional.
- Um PDF gera um PDF; varios PDFs geram um ZIP.
- Nomes de arquivo sao exibidos com seguranca, sem injecao de HTML.

### Como usar

1. Abra `index.html` em um navegador moderno com acesso a internet, pois PDF.js,
   jsPDF e JSZip sao carregados por CDN.
2. Arraste um ou mais PDFs para a area de selecao.
3. Informe o tamanho desejado por arquivo (15 MB por padrao).
4. Selecione um perfil:
   - **Maxima nitidez:** comeca em resolucao e qualidade mais altas.
   - **Equilibrado:** bom compromisso entre nitidez, velocidade e tamanho.
   - **Ultra compacto:** privilegia documentos leves.
5. Mantenha **Priorizar a meta exata** marcado quando o limite for obrigatorio.
6. Clique em **Comprimir agora**.

Para evitar restricoes de navegadores ao abrir arquivos locais, tambem e possivel
servir a pasta com um servidor HTTP simples e acessar o endereco local.

```powershell
python -m http.server 8765
```

Depois, abra `http://127.0.0.1:8765`.

### Sobre 170 MB para 15 MB

Uma reducao de aproximadamente 91% pode ficar visualmente excelente em PDFs
digitalizados, apostilas e documentos cheios de imagens. Entretanto, nenhum
compressor pode garantir essa proporcao **sem qualquer perda** para todo PDF.

- Se o arquivo ja estiver abaixo da meta, o original e devolvido sem alteracoes.
- Se precisar comprimir, cada pagina e rasterizada e codificada de forma adaptativa.
- Texto, links, formularios, assinaturas digitais e camadas vetoriais deixam de ser
  interativos no PDF recomprimido, embora continuem visiveis na pagina.
- A opcao de meta exata permite que o motor reduza mais a resolucao em casos extremos.

Para compressao estrutural realmente sem perdas e preservacao integral de texto,
links e assinaturas, seria necessario um backend especializado (por exemplo,
Ghostscript/qpdf) e o ganho normalmente seria bem menor.

## Tecnologias

- PDF.js 3.11.174: leitura e renderizacao.
- jsPDF 2.5.1: montagem do PDF final.
- JSZip 3.10.1: pacote para multiplos resultados.
- SheetJS 0.18.5: leitura de arquivos Excel e CSV.
- pdf-lib 1.17.1 e jsQR 1.4.0: insercao e leitura de QR Codes.

## Arquivos

- `index.html`: estrutura e interface.
- `css/styles.css`: identidade visual e responsividade.
- `js/app.js`: analise, compressao adaptativa, progresso e downloads.
- `paginas/conversor.html`: estrutura da ferramenta de planilhas.
- `css/conversor.css`: layout do conversor.
- `js/conversor.js`: leitura, mapeamento, validacao, transformacao e exportacao.
- `css/tools-suite.css`: interface compartilhada dos fluxos de documentos e QR.
- `js/docalunos.js`: auditoria, categorizacao e geracao segura dos lotes de alunos.
- `js/extratordeqr.js`: editor visual, pareamento em lote e extracao de QR.
- `js/gerador-presenca.js`: analise da planilha e ZIP de sessoes para Moodle.

## Certificados e QR Codes

No processamento em lote, a ferramenta aceita um conjunto de certificados em PDF
e um ou mais PDFs de origem contendo os QRs. Cada pagina do PDF de origem e lida
separadamente. O campo `Aluno:` e o QR da pagina sao extraidos e comparados com o
nome do certificado. Antes da geracao, o primeiro certificado e aberto para definir
visualmente a pagina, posicao e tamanho do QR. Essa configuracao proporcional e
aplicada aos demais certificados que tiveram correspondencia segura.

O pareamento nao usa aproximacao: o nome do arquivo do certificado deve ser igual
ao valor encontrado no campo `Aluno:`. A comparacao apenas desconsidera acentos,
maiusculas/minusculas, espacos, hifens e sublinhados. Itens diferentes, duplicados
ou sem QR sao exibidos e ignorados. O ZIP final inclui relatorios completos em PDF
e CSV com os casados, ignorados, nao encontrados e eventuais erros de geracao.

O modo em lote suporta ate 300 certificados. A leitura dos PDFs de QR e feita
pagina a pagina, e cada certificado e gerado sequencialmente para reduzir o consumo
de memoria. Os PDFs sao armazenados no ZIP sem recompressao desnecessaria.
