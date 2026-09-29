# Verificação da versão 2.1

Execute `npm run check` antes de distribuir os arquivos. A rotina cobre:

- sintaxe de todos os scripts JavaScript;
- referências locais e ordem de carregamento dos núcleos nas páginas;
- ausência de planilhas, CSVs, PDFs e ZIPs de dados no projeto;
- transformação Moodle com seleção de campos, datas, máscaras e linhas incompletas;
- classificação e nomes de documentos, associação de QR por nome, limites do
  compressor, interpretação de presença e conteúdo do ZIP de sessões;
- inicialização dos cinco controladores em um DOM simulado.

Os testes usam somente dados fictícios. Para a validação final no navegador,
use arquivos sintéticos representativos e confira os downloads produzidos:
CSV Moodle, ZIP de documentos, PDFs comprimidos, PDFs com QR e ZIP de presença.
Essa etapa é necessária porque renderização de PDF, comportamento do seletor de
arquivos e bibliotecas carregadas por CDN dependem do navegador real.
