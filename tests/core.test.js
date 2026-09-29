const test = require('node:test');
const assert = require('node:assert/strict');

const conversor = require('../js/core/conversor.js');
const documentos = require('../js/core/documentos.js');
const pdf = require('../js/core/pdf.js');
const qr = require('../js/core/qr.js');
const presenca = require('../js/core/presenca.js');

test('conversor gera o contrato Moodle sem senha e preserva máscaras', () => {
  const values = {
    nome_completo: 'Ana da Silva', matricula_esap: '12345', turma: 'turma_a',
    email: 'ana@example.invalid', cpf: '000.000.000-00', sexo: 'Feminino',
    dtnasc: '07/12/1977', celular: '71 6531-9863', docidentif: 'RG123',
    dataexpedicao: '30/10/2021', endereco: 'Rua Um, 21', cep: '66267517',
  };
  const mapping = new Map(conversor.FIELDS.map((field, index) => [field.key, index]));
  const row = conversor.FIELDS.map((field) => values[field.key] || '');
  const selected = new Set(conversor.FIELDS.filter((field) => !field.required).map((field) => field.key));
  const { matrix, skipped } = conversor.convertRows([row], mapping, selected);
  assert.equal(skipped, 0);
  assert.equal(matrix[0].length, 19);
  assert.deepEqual(matrix[0].slice(0, 4), ['firstname', 'lastname', 'username', 'cohort1']);
  assert.equal(matrix[0].includes('Password'), false);
  const field = (name) => matrix[1][matrix[0].indexOf(name)];
  assert.equal(field('profile_field_genero'), 'FEMININO');
  assert.equal(field('profile_field_Data'), '1977-12-07');
  assert.equal(field('profile_field_DataExpedicao'), '2021-10-30');
  assert.equal(field('profile_field_Telefone'), '71 6531-9863');
  assert.equal(field('profile_field_CEP'), '66267-517');
  const csv = conversor.matrixToCsv(matrix, true);
  assert.match(csv, /"1977-12-07"/);
  assert.match(csv, /"Rua Um, 21"/);
});

test('conversor respeita seleção e ignora linhas incompletas', () => {
  const mapping = new Map([['nome_completo', 0], ['matricula_esap', 1], ['turma', 2]]);
  const { matrix, skipped } = conversor.convertRows([
    ['Ana Silva', '1', 'A'], ['Sem Turma', '2', ''],
  ], mapping, new Set());
  assert.deepEqual(matrix, [
    ['firstname', 'lastname', 'username', 'cohort1'],
    ['Ana', 'Silva', '1', 'A'],
  ]);
  assert.equal(skipped, 1);
  assert.equal(conversor.formatDate('07/12/77'), '1977-12-07');
  assert.throws(() => conversor.formatDate('31/02/2021'), /Data inválida/);
});

test('conversor detecta cabeçalho e mapeia uma planilha fictícia completa', () => {
  const matrix = [
    ['Relatório de alunos'],
    ['Nome Completo', 'Matrícula ESAP', 'Turma', 'Sexo', 'Data de Nascimento', 'Data de Expedição', 'CEP'],
    ['Ana da Silva', '12345', 'turma_a', 'F', '07/12/1977', '30/10/2021', '66267517'],
    ['Sem matrícula', '', 'turma_a', 'M', '', '', ''],
  ];
  const headerIndex = conversor.detectHeaderRow(matrix);
  assert.equal(headerIndex, 1);
  const headers = conversor.makeHeaders(matrix[headerIndex]);
  const { mapping, selectedFields } = conversor.suggestMapping(headers);
  assert.equal(mapping.get('matricula_esap'), 1);
  assert.equal(mapping.get('dataexpedicao'), 5);
  assert.ok(selectedFields.has('dataexpedicao'));
  const { matrix: result, skipped } = conversor.convertRows(matrix.slice(headerIndex + 1), mapping, selectedFields);
  assert.equal(skipped, 1);
  assert.equal(result[1][result[0].indexOf('profile_field_genero')], 'FEMININO');
  assert.equal(result[1][result[0].indexOf('profile_field_DataExpedicao')], '2021-10-30');
  assert.equal(result[1][result[0].indexOf('profile_field_CEP')], '66267-517');
});

test('documentos classifica, normaliza e evita nomes duplicados', () => {
  assert.equal(documentos.classify('Certidão de Nascimento.pdf'), 'Principal');
  assert.equal(documentos.classify('atestado médico.pdf'), 'Atestado');
  const used = new Set();
  assert.equal(documentos.uniqueName('RG.pdf', used), 'RG.pdf');
  assert.equal(documentos.uniqueName('RG.pdf', used), 'RG (2).pdf');
});

test('QR casa nomes normalizados e extrai o campo Aluno', () => {
  assert.equal(qr.strictNameKey('João da Silva.pdf'), qr.strictNameKey('Joao_da-Silva'));
  assert.equal(qr.extractStudentName('Aluno: João da Silva Curso: Teste'), 'João da Silva');
});

test('PDF aplica limites e cria nomes distintos', () => {
  assert.equal(pdf.safeTargetMb('0.1'), 1);
  assert.equal(pdf.safeTargetMb('900'), 500);
  const used = new Set();
  assert.equal(pdf.uniqueOutputName('teste', used), 'teste_comprimido.pdf');
  assert.equal(pdf.uniqueOutputName('teste', used), 'teste_comprimido_1.pdf');
});

test('presença escapa delimitador e aspas', () => {
  assert.equal(presenca.toCsv([['a;b', 'a"b']], ';'), '"a;b";"a""b"');
  assert.equal(presenca.withBom('x'), '\uFEFFx');
});

test('presença interpreta cabeçalho, virada do ano e códigos de frequência', () => {
  assert.deepEqual(presenca.parseSessionHeader('Aula 2 - 07/12/2024'), {
    title: 'Aula 2 - 07/12/2024', lesson: 'Aula 2', day: 7, month: 12, year: 2024,
  });
  assert.equal(
    presenca.formatIsoDate(presenca.chooseDate(5, 1, null, new Date('2024-12-20'), 2024)),
    '2025-01-05',
  );
  const settings = {
    blankAsPresent: false, specialAsExcused: true,
    presentStatus: 'Pr', absentStatus: 'Au', lateStatus: 'At', specialStatus: 'Di',
  };
  assert.equal(presenca.interpretStatus('0', settings).kind, 'present');
  assert.equal(presenca.interpretStatus('1', settings).kind, 'absent');
  assert.equal(presenca.interpretStatus('Atraso', settings).kind, 'late');
  assert.equal(presenca.interpretStatus('Dispensa', settings).kind, 'special');
});

test('pacote de sessões contém um CSV por módulo, sem frequência ou PDF', () => {
  const modules = [
    { title: 'Módulo Um', sessions: [{ date: new Date('2026-10-05T00:00:00Z'), dateDisplay: '05/10/2026', lesson: 'Aula 1', from: '13:40', to: '16:10' }] },
    { title: 'Módulo Dois', sessions: [{ date: new Date('2026-10-06T00:00:00Z'), dateDisplay: '06/10/2026', lesson: 'Aula 2', from: '16:30', to: '19:00' }] },
  ];
  const files = presenca.createSessionFiles(modules, { delimiter: ';', groupName: '', courseShortname: 'curso_teste' });
  assert.equal(files.length, 2);
  assert.notEqual(files[0].path, files[1].path);
  assert.ok(files.every((file) => file.path.endsWith('/IMPORTAR_SESSOES_NO_MOODLE.csv')));
  assert.ok(files.every((file) => !/presenca|relatorio|\.pdf/i.test(file.path)));
  assert.match(files[0].content, /^\uFEFFcourse;groups;sessiondate;from;to;description;studentscanmark;calendarevent/);
  assert.match(files[0].content, /curso_teste;;2026-10-05;13:40;16:10/);
});
