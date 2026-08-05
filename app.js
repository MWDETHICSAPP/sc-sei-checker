const API_BASE_URL = 'https://sc-sei-checker.onrender.com';

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

  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    sourceRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
    headers = sourceRows.length ? Object.keys(sourceRows[0]) : [];

    if (!sourceRows.length) {
      throw new Error('The first worksheet does not contain any rows.');
    }

    populateColumns();
    controls.hidden = false;
  } catch (error) {
    alert(`The spreadsheet could not be opened: ${error.message}`);
    controls.hidden = true;
  }
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

  const nameGuess = headers.find((h) => /name|official|member|solicitor/i.test(h));
  const jurisdictionGuess = headers.find(
    (h) => /county|jurisdiction|district|agency|board|city|town|counties served/i.test(h)
  );

  if (nameGuess) $('nameColumn').value = nameGuess;
  if (jurisdictionGuess) $('jurisdictionColumn').value = jurisdictionGuess;
}

function normalizeWhitespace(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function getSurname(fullName) {
  const clean = normalizeWhitespace(fullName)
    .replace(/^(hon\.?|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '')
    .replace(/,?\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '');

  if (!clean) return '';
  if (clean.includes(',')) return clean.split(',')[0].trim();

  const parts = clean.split(' ');
  return parts[parts.length - 1];
}

$('prepareBtn').addEventListener('click', async () => {
  const button = $('prepareBtn');
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
    __notes: 'Waiting for backend response.'
  }));

  renderRows(preparedRows);
  resultsCard.hidden = false;
  stats.hidden = false;
  updateStats();

  button.disabled = true;
  button.textContent = 'Checking…';

  try {
    await runBackendChecks(year);
  } catch (error) {
    preparedRows.forEach((row) => {
      if (row.__status === 'Pending') {
        row.__status = 'Manual Review';
        row.__notes = `Backend connection failed: ${error.message}`;
      }
    });

    renderRows(preparedRows);
    updateStats();
    persist();
    alert('The spreadsheet was imported, but the backend could not be reached. No person was marked Not Filed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Run checks';
  }
});

async function runBackendChecks(year) {
  const batchSize = 250;
  const totalBatches = Math.ceil(preparedRows.length / batchSize);
  const button = $('prepareBtn');

  for (let start = 0; start < preparedRows.length; start += batchSize) {
    const batchNumber = Math.floor(start / batchSize) + 1;
    const batchRows = preparedRows.slice(start, start + batchSize);

    button.textContent = `Checking batch ${batchNumber} of ${totalBatches}…`;

    const people = batchRows.map((row) => ({
      name: row.__name,
      jurisdiction: row.__jurisdiction,
      year
    }));

    const response = await fetch(`${API_BASE_URL}/check-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ people, year })
    });

    let payload;

    try {
      payload = await response.json();
    } catch (_) {
      throw new Error(
        `The server returned an unreadable response for batch ${batchNumber} (${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        payload.error ||
          `The server returned status ${response.status} for batch ${batchNumber}.`
      );
    }

    if (
      !Array.isArray(payload.results) ||
      payload.results.length !== batchRows.length
    ) {
      throw new Error(
        `The server returned an incomplete response for batch ${batchNumber}.`
      );
    }

    payload.results.forEach((result, index) => {
      const row = preparedRows[start + index];

      row.__status = result.status || 'Manual Review';
      row.__surname = result.search?.surname || row.__surname;
      row.__matchedName = result.matchedFilingName || '';
      row.__notes = result.notes || '';
    });

    renderRows(preparedRows);
    updateStats();
    persist();
  }
}

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

    match.addEventListener('input', () => {
      row.__matchedName = match.value;
      persist();
    });

    notes.addEventListener('input', () => {
      row.__notes = notes.value;
      persist();
    });

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
  $('filedCount').textContent = preparedRows.filter((r) => r.__status === 'Filed').length;
  $('reviewCount').textContent = preparedRows.filter((r) => r.__status === 'Manual Review').length;
  $('notFiledCount').textContent = preparedRows.filter((r) => r.__status === 'Not Filed').length;
}

$('filterInput').addEventListener('input', (event) => {
  const q = event.target.value.toLowerCase().trim();
  const rows = q
    ? preparedRows.filter((r) =>
        `${r.__name} ${r.__jurisdiction} ${r.__surname}`.toLowerCase().includes(q)
      )
    : preparedRows;

  renderRows(rows);
});

$('exportBtn').addEventListener('click', () => {
  if (!preparedRows.length) return;

  const output = preparedRows.map((row) => {
    const clean = { ...row };
    Object.keys(clean)
      .filter((key) => key.startsWith('__'))
      .forEach((key) => delete clean[key]);

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
