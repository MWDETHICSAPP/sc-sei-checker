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

    const validRows = batchRows.filter((row) => {
    if (!row.__name || !row.__name.trim()) {
        row.__status = "Manual Review";
        row.__notes = "No official name provided.";
        return false;
    }

    return true;
});
if (validRows.length === 0) {
  renderRows(preparedRows);
  updateStats();
  continue;
}
    
const people = validRows.map((row) => ({
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
      payload.results.length !== validRows.length
    ) {
      throw new Error(
        `The server returned an incomplete response for batch ${batchNumber}.`
      );
    }

    payload.results.forEach((result, index) => {
      const row = validRows[index];

      row.__status = result.status || 'Manual Review';
      row.__surname = result.search?.surname || row.__surname;
      row.__matchedName = result.matchedFilingName || '';
      row.__filedDate = result.filedDate || '';
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
    clean['SEI Filed / Updated Date'] = row.__filedDate || '';
    clean['SEI Match Notes'] = row.__notes;
    clean['SEI Search Surname'] = row.__surname;
    clean['Review Status'] = row.__status;
clean['Manual Review Required'] = row.__status === 'Manual Review' ? 'Yes' : 'No';
clean['Letter Required'] = row.__status === 'Not Filed' ? 'Yes' : 'No';
clean['Staff Notes'] = '';
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildAnnualSeiLetterDraft(row) {
  const filingYear = row.__year || new Date().getFullYear();
  const recipientName =
    row.Name ||
    row['Full Name'] ||
    row['Official Name'] ||
    row['Last Name'] ||
    '';

  const municipality =
    row.Municipality ||
    row.Jurisdiction ||
    row['County / Jurisdiction'] ||
    '';

  const letterDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const dueDate = '[DUE DATE]';
  const address = '[ADDRESS]';
  const cityStateZip = '[CITY, STATE ZIP]';
  const salutation = '[MR./MS./MRS. LAST NAME]';
  const position = '[POSITION]';

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>SEI Compliance Letter - ${escapeHtml(recipientName)}</title>
<style>
  body {
    font-family: "Times New Roman", serif;
    font-size: 12pt;
    line-height: 1.2;
    margin: 1in;
    color: #000;
  }
  p {
    margin: 0 0 12pt 0;
  }
  .page-break {
    page-break-before: always;
  }
</style>
</head>
<body>

<p>${escapeHtml(letterDate)}</p>

<p>
${escapeHtml(recipientName)}<br>
${escapeHtml(address)}<br>
${escapeHtml(cityStateZip)}
</p>

<p>Dear ${escapeHtml(salutation)}:</p>

<p>
The ${escapeHtml(filingYear)} Statement of Economic Interests, which was due on
${escapeHtml(dueDate)}, has not been filed.
</p>

<div class="page-break"></div>

<p>
${escapeHtml(recipientName)}<br>
${escapeHtml(letterDate)}<br>
Page 2 of 2
</p>

<p>
This is not a form letter. You are receiving this letter because you are currently
in violation of the Ethics Reform Act. As a ${escapeHtml(position)}${municipality ? ` for ${escapeHtml(municipality)}` : ''},
you are subject to the Ethics Reform Act, which is the body of laws that govern
public officials, public members, and public employees.
</p>

<p>
Continued delays in filing the ${escapeHtml(filingYear)} Statement of Economic Interests
could result in accrual of late filing penalties with a maximum penalty of $5,000.00.
While reviewing your Campaign Disclosures and Statements of Economic Interests,
the following deficiencies were discovered:
</p>

<p>
In accordance with Section 8-13-1510, South Carolina Code Ann., 1976, as amended,
a late filing penalty is hereby levied. If the required report is not filed
electronically within ten calendar days of receipt of this letter, additional
penalties could be levied at $10 per day per report for the first ten days and
$100 per day per report for each additional day until the penalty reaches $5,000
per report, and a complaint could be filed against you.
</p>

<p>
If extenuating circumstances prevented you from filing the reports as required,
you may file a written appeal of this late filing penalty. To file an appeal,
you must do the following within ten (10) days of receipt of this letter:
</p>

<p>
• Send a personal check or money order made payable to the State Ethics Commission<br>
• File all missing reports online at https://ethicsfiling.sc.gov/filing/home<br>
• Provide a written statement describing any extenuating circumstances and include
any supporting documentation.
</p>

<p>
Please be advised that all appeals must be in writing and must follow the above
directions. NO phone or e-mail appeals will be accepted. Failure to file is a
misdemeanor. After the maximum civil penalty has been levied, this matter could
be referred to Magistrate’s Court for criminal prosecution. This matter will also
be referred to the South Carolina Department of Revenue for collection, and the
penalty amount and your name, city, and position will be posted on the State Ethics
Commission's website. Please contact this office if we can provide further information.
</p>

<p>
Sincerely,
</p>

<p>
[SIGNATURE]<br>
[TITLE]
</p>

</body>
</html>`;
}
