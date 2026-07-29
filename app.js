let workbook;
let sourceRows = [];
let headers = [];
let preparedRows = [];
let deferredPrompt;

const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput');
const controls = $('controls');
const resultsCard = $('resultsCard');
const resultsBody = $('resultsBody');
const stats = $('stats');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  $('installBtn').hidden = false;
});

$('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('installBtn').hidden = true;
});

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $('fileName').textContent = file.name;
  const buffer = await file.arrayBuffer();
  workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  sourceRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  headers = sourceRows.length ? Object.keys(sourceRows[0]) : [];
  populateColumns();
  controls.hidden = false;
});

function populateColumns() {
  for (const id of ['nameColumn', 'jurisdictionColumn']) {
    const select = $(id);
    select.innerHTML = '';
    headers.forEach((header) => {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      select.appendChild(option);
    });
  }
  const nameGuess = headers.find(h => /name|official|member/i.test(h));
  const jurisdictionGuess = headers.find(h => /county|jurisdiction|district|agency|board|city|town/i.test(h));
  if (nameGuess) $('nameColumn').value = nameGuess;
  if (jurisdictionGuess) $('jurisdictionColumn').value = jurisdictionGuess;
}

function normalizeWhitespace(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function getSurname(fullName) {
  const clean = normalizeWhitespace(fullName)
    .replace(/^(hon\.?|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '')
    .replace(/,?\s+(jr\.?|sr\.?|ii|iii|iv)$/i, '');
  if (!clean) return '';
  if (clean.includes(',')) return clean.split(',')[0].trim();
  const parts = clean.split(' ');
  return parts[parts.length - 1];
}

$('prepareBtn').addEventListener('click', () => {
  const nameKey = $('nameColumn').value;
  const jurisdictionKey = $('jurisdictionColumn').value;
  const year = Number($('yearInput').value) || 2026;
  preparedRows = sourceRows.map((row, index) => ({
    ...row,
    __index: index,
    __name: normalizeWhitespace(row[nameKey]),
    __jurisdiction: normalizeWhitespace(row[jurisdictionKey]),
    __surname: getSurname(row[nameKey]),
    __year: year,
    __status: 'Pending',
    __matchedName: '',
    __notes: ''
  }));
  renderRows(preparedRows);
  resultsCard.hidden = false;
  stats.hidden = false;
  updateStats();
});

function renderRows(rows) {
  resultsBody.innerHTML = '';
  const template = $('rowTemplate');
  rows.forEach((row) => {
    const fragment = template.content.cloneNode(true);
    const tr = fragment.querySelector('tr');
    tr.dataset.index = row.__index;
    fragment.querySelector('.name').textContent = row.__name;
    fragment.querySelector('.jurisdiction').textContent = row.__jurisdiction;
    fragment.querySelector('.surname').textContent = row.__surname;
    const status = fragment.querySelector('.status');
    const match = fragment.querySelector('.match');
    const notes = fragment.querySelector('.notes');
    status.value = row.__status;
    match.value = row.__matchedName;
    notes.value = row.__notes;
    applyStatusClass(tr, row.__status);
    status.addEventListener('change', () => {
      row.__status = status.value;
      applyStatusClass(tr, row.__status);
      updateStats();
      persist();
    });
    match.addEventListener('input', () => { row.__matchedName = match.value; persist(); });
    notes.addEventListener('input', () => { row.__notes = notes.value; persist(); });
    resultsBody.appendChild(fragment);
  });
}

function applyStatusClass(tr, status) {
  tr.classList.remove('status-filed', 'status-review', 'status-not-filed');
  if (status === 'Filed') tr.classList.add('status-filed');
  if (status === 'Manual Review') tr.classList.add('status-review');
  if (status === 'Not Filed') tr.classList.add('status-not-filed');
}

function updateStats() {
  $('totalCount').textContent = preparedRows.length;
  $('filedCount').textContent = preparedRows.filter(r => r.__status === 'Filed').length;
  $('reviewCount').textContent = preparedRows.filter(r => r.__status === 'Manual Review').length;
  $('notFiledCount').textContent = preparedRows.filter(r => r.__status === 'Not Filed').length;
}

$('filterInput').addEventListener('input', (event) => {
  const q = event.target.value.toLowerCase().trim();
  const rows = q ? preparedRows.filter(r => `${r.__name} ${r.__jurisdiction} ${r.__surname}`.toLowerCase().includes(q)) : preparedRows;
  renderRows(rows);
});

$('exportBtn').addEventListener('click', () => {
  const output = preparedRows.map((row) => {
    const clean = { ...row };
    Object.keys(clean).filter(k => k.startsWith('__')).forEach(k => delete clean[k]);
    clean[`SEI ${row.__year}`] = row.__status;
    clean['Matched Filing Name'] = row.__matchedName;
    clean['SEI Match Notes'] = row.__notes;
    clean['SEI Search Surname'] = row.__surname;
    return clean;
  });
  const ws = XLSX.utils.json_to_sheet(output);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SEI Results');
  XLSX.writeFile(wb, `SC_SEI_Check_${preparedRows[0]?.__year || 2026}.xlsx`);
});

function persist() {
  try {
    localStorage.setItem('seiPreparedRows', JSON.stringify(preparedRows));
  } catch (_) {}
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js');
}
