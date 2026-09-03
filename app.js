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
  for (const id of ['nameColumn', 'jurisdictionColumn', 'roleColumn']) {
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
const roleGuess = headers.find((h) => /role|filing basis|status|type/i.test(h));
  if (nameGuess) $('nameColumn').value = nameGuess;
  if (jurisdictionGuess) $('jurisdictionColumn').value = jurisdictionGuess;
  if (roleGuess) $('roleColumn').value = roleGuess;
}

function normalizeWhitespace(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeElectionDate(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  // Excel stores dates as serial numbers (for example, 45601 = 11/5/2024).
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86400000);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const text = String(value).trim();

  // Handle numeric Excel dates that may already have been converted to strings.
  if (/^\d{5}$/.test(text)) {
    const serial = Number(text);
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + serial * 86400000);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const date = new Date(text);

  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return text;
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
  const roleKey = $('roleColumn').value;

  const electionDateKey = Object.keys(sourceRows[0] || {}).find(
    key => normalizeWhitespace(key).toLowerCase() === 'election date'
  );

  const officeKey = Object.keys(sourceRows[0] || {}).find(
    key => normalizeWhitespace(key).toLowerCase() === 'office'
  );

  const year = Number($('yearInput').value) || 2026;

preparedRows = sourceRows.map((row, index) => ({
  ...row,
  __index: index,
  __name: normalizeWhitespace(row[nameKey]),
  __jurisdiction: normalizeWhitespace(row[jurisdictionKey]),
  __role: normalizeWhitespace(row[roleKey]),
  __office: officeKey
    ? normalizeWhitespace(row[officeKey])
    : '',
  __electionDate: electionDateKey
    ? normalizeElectionDate(row[electionDateKey])
    : "",
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
  role: row.__role,
  office: row.__office,
  year,
  electionDate: row.__electionDate || null
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
      row.__deficiencies = Array.isArray(result.deficiencies)
  ? result.deficiencies
  : [];
console.log("DEFICIENCIES FOR", row.__name, row.__deficiencies);
      
const campaignAddress =
  result.campaignCompliance?.campaignProfile?.address || null;

const candidateContactAddress =
  [
    campaignAddress?.addressLine1,
    campaignAddress?.addressLine2,
    campaignAddress?.city,
    campaignAddress?.state,
    campaignAddress?.zipCode
  ]
    .filter(Boolean)
    .join(', ');

row.__candidateAddress =
  normalizeWhitespace(candidateContactAddress);

if (row.__deficiencies.length > 0) {
  row.__notes =
    'Deficiencies: ' +
    row.__deficiencies
      .map((deficiency) => {
        const filing = String(deficiency?.filing || '').trim();
        const year =
          deficiency?.electionYear &&
          !filing.includes(String(deficiency.electionYear))
            ? ` (${deficiency.electionYear})`
            : '';

        return `${filing}${year}`;
      })
      .filter(Boolean)
      .join('; ');
} else {
  row.__notes = result.notes || '';
}
      const campaignOfficeNames = Array.isArray(
  result.campaignCompliance?.relevantOfficeRuns
)
  ? [
      ...new Set(
        result.campaignCompliance.relevantOfficeRuns
          .map((run) => String(run?.name || '').trim())
          .filter(Boolean)
      )
    ]
  : [];

  row.__campaignOffice =
  campaignOfficeNames.length === 1
    ? campaignOfficeNames[0]
    : '';    


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

  if (
  Array.isArray(row.__deficiencies) &&
  row.__deficiencies.length > 0
) {
  const letterButton = document.createElement("button");
  letterButton.type = "button";
  letterButton.textContent = "Generate Letter";
  letterButton.className = "individual-letter-btn";

  letterButton.addEventListener("click", async () => {
    letterButton.disabled = true;
    const originalText = letterButton.textContent;
    letterButton.textContent = "Generating...";

    try {
      const { doc, Packer, fullName, filingYear } =
        buildAnnualSeiWordDocument(row);

      const blob = await Packer.toBlob(doc);

      downloadBlob(
        blob,
        `${safeFileName(fullName)}_${filingYear}_Compliance_Letter.docx`
      );
    } catch (error) {
      console.error(error);
      alert(
        `The Word letter could not be generated: ${
          error.message || error
        }`
      );
    } finally {
      letterButton.disabled = false;
      letterButton.textContent = originalText;
    }
  });

  const actionCell = document.createElement("td");
actionCell.className = "action-cell";
actionCell.appendChild(letterButton);
tr.appendChild(actionCell);
}
    
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
$('notFiledCount').textContent = preparedRows.reduce(
  (total, row) =>
    total +
    (Array.isArray(row.__deficiencies)
      ? row.__deficiencies.length
      : 0),
  0
);
}


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
clean['Letter Required'] =
  Array.isArray(row.__deficiencies) && row.__deficiencies.length > 0
    ? 'Yes'
    : 'No';const campaignDeficiencies = Array.isArray(row.__deficiencies)
  ? row.__deficiencies.filter(
      (deficiency) => deficiency?.type === 'Campaign Disclosure'
    )
  : [];

clean['Campaign Disclosure Deficiencies'] = campaignDeficiencies
  .map((deficiency) => {
    const filing = String(deficiency?.filing || '').trim();
    const year = deficiency?.electionYear
      ? ` (${deficiency.electionYear})`
      : '';

    return `${filing}${year}`;
  })
  .filter(Boolean)
  .join('; ');

clean['Campaign Disclosure Due Dates'] = campaignDeficiencies
  .map((deficiency) => deficiency?.dueDate || '')
  .filter(Boolean)
  .join('; ');

clean['Campaign Disclosure Filed Dates'] = campaignDeficiencies
  .map((deficiency) => deficiency?.filedDate || '')
  .filter(Boolean)
  .join('; ');


    
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

function firstValue(row, names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function safeFileName(value) {
  return String(value || 'SEI_Recipient')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const LETTER_SIGNERS = {
  kristin: {
    name: 'Kristin S. Nabors',
    titleLine1: 'Director of Non-Compliance',
    titleLine2: ''
  },
  mel: {
    name: 'Mel Baldwin',
    titleLine1: 'Administrative Assistant',
    titleLine2: 'Non-Compliance'
  },
  lindsey: {
    name: 'Lindsey E. New',
    titleLine1: 'Assistant Director - Non-Compliance',
    titleLine2: ''
  }
};

function getSelectedLetterSigner() {
  const signerKey = $('letterSigner')?.value || '';
  return LETTER_SIGNERS[signerKey] || {
  name: '',
  titleLine1: '',
  titleLine2: ''
};
}
function buildAnnualSeiWordDocument(row) {
  if (!window.docx) {
    throw new Error('Word document library did not load.');
  }

 
  const {
  Document,
  Paragraph,
  TextRun,
    ExternalHyperlink,
   
  Packer,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType
} = window.docx;

  const filingYear = row.__year || new Date().getFullYear();
const selectedSigner = getSelectedLetterSigner();

const rawDeficiencies = Array.isArray(row.__deficiencies)
  ? row.__deficiencies
  : [];

const letterDeficiencies = rawDeficiencies.map((deficiency) => {
  const type = String(deficiency?.type || '').trim();
  const filing = String(deficiency?.filing || '').trim();

if (type === "SEI") {
  const dueDate = deficiency?.dueDate
    ? new Date(deficiency.dueDate).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC"
      })
    : "";

const filedDate = deficiency?.filedDate
  ? new Date(deficiency.filedDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    })
  : ""; 

  const status = String(deficiency?.status || "").trim().toLowerCase();

  let text;
const candidateLabel = deficiency?.asCandidate ? " as a candidate" : "";
  
 if (status === "late" && filedDate) {
  text = `The ${filing || `${filingYear} Statement of Economic Interests`}${candidateLabel}, which was due on ${dueDate}, was filed late on ${filedDate}.`;
} else if (dueDate) {
  text = `The ${filing || `${filingYear} Statement of Economic Interests`}${candidateLabel}, which was due on ${dueDate}, has not been filed.`;
} else {
  text = filing || `${filingYear} Statement of Economic Interests`;
} 
  

  return {
    ...deficiency,
    category: "SEI",
    text
  };
}

  

  if (type === 'Campaign Disclosure') {
  const year = deficiency?.electionYear || '';
   const dueDate = deficiency?.dueDate
    ? new Date(deficiency.dueDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
      })
    : '';
const startDate = deficiency?.startDate
  ? new Date(deficiency.startDate).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    })
  : '';
  let text = filing + (year ? ` (${year})` : '');
   if (filing.includes('Quarter') && dueDate) {
  const filedDate = deficiency?.filedDate
    ? new Date(deficiency.filedDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
      })
    : '';

  text = filedDate
    ? `The ${filing}, which was due on ${dueDate}, was filed late on ${filedDate}.`
    : `The ${filing}, which was due on ${dueDate}, has not been filed.`;
}

  if (filing.includes('Initial') && dueDate) {
    text = `A ${year} Initial Campaign Disclosure, which was due no later than ${dueDate}, has not been filed.`;
  }

if (filing.includes('Pre-Election') && startDate && dueDate) {
  const filedDate = deficiency?.filedDate
    ? new Date(deficiency.filedDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
      })
    : '';

  text = filedDate
    ? `A ${year} Pre-Election Campaign Disclosure, which was required to be filed between ${startDate} and ${dueDate}, was filed late on ${filedDate}.`
    : `A ${year} Pre-Election Campaign Disclosure, which was required to be filed between ${startDate} and ${dueDate}, has not been filed.`;
} 

  return {
    ...deficiency,
    category: 'Campaign Disclosure',
    text
  };
}

  return {
    ...deficiency,
    category: type || 'Other',
    text: filing || 'Required filing'
  };
});

row.__letterDeficiencies = letterDeficiencies;

const deficiencyCount =
  letterDeficiencies.length > 0
    ? letterDeficiencies.length
    : 1;

const deficiencyBoxText =
  letterDeficiencies.length > 0
    ? letterDeficiencies.map((deficiency) => deficiency.text).join('\n')
    : `${filingYear} Statement of Economic Interests`;

 const hasSeiDeficiency =
  letterDeficiencies.some(
    (deficiency) =>
      deficiency.category === 'SEI' ||
      deficiency.type === 'SEI'
  );

const hasCampaignDeficiency =
  letterDeficiencies.some(
    (deficiency) =>
      deficiency.category === 'Campaign Disclosure' ||
      deficiency.type === 'Campaign Disclosure'
  );

let deficiencyParagraphText = '';

if (hasSeiDeficiency && hasCampaignDeficiency) {
  deficiencyParagraphText =
    `Continued delays in filing the required Statements of Economic Interests and Campaign Disclosures could result in accrual of late filing penalties with a maximum penalty of $5,000.00. While reviewing your Campaign Disclosures and Statements of Economic Interests, the deficiencies identified below were discovered:`;
} else if (hasSeiDeficiency) {
  deficiencyParagraphText =
    `Continued delays in filing the required Statement of Economic Interests could result in accrual of late filing penalties with a maximum penalty of $5,000.00. While reviewing your Statement of Economic Interests, the deficiency identified below was discovered:`;
} else if (hasCampaignDeficiency) {
  deficiencyParagraphText =
    `Continued delays in filing the required Campaign Disclosures could result in accrual of late filing penalties with a maximum penalty of $5,000.00. While reviewing your Campaign Disclosures, the deficiencies identified below were discovered:`;
}
  
const initialPenalty = deficiencyCount * 100;

const formattedPenalty = initialPenalty.toLocaleString('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
});
  const fullName =
    firstValue(row, [
      'Name',
      'Full Name',
      'Official Name',
      'Recipient Name'
    ]) ||
    firstValue(row, ['Last Name']) ||
    '[RECIPIENT NAME]';

  const lastName =
    firstValue(row, ['Last Name']) ||
    fullName.split(/\s+/).slice(-1)[0] ||
    '[LAST NAME]';

 const address =
  firstValue(row, [
    'Address',
    'Street Address',
    'Mailing Address'
  ]) ||
  normalizeWhitespace(row.__candidateAddress || '') ||
  '[ADDRESS]';

  const city =
    firstValue(row, ['City', 'Mailing City']);

  const state =
    firstValue(row, ['State', 'Mailing State']);

  const zip =
    firstValue(row, [
      'Zip',
      'ZIP',
      'Zip Code',
      'ZIP Code',
      'Postal Code'
    ]);

  const candidateAddress =
  normalizeWhitespace(row.__candidateAddress || '');

const cityStateZip =
  candidateAddress
    ? ''
    : firstValue(row, ['City State Zip', 'City, State, Zip']) ||
      [city, state, zip].filter(Boolean).join(', ').replace(', ,', ',') ||
      '[CITY, STATE ZIP]';

  const jurisdiction =
    firstValue(row, [
      'Municipality',
      'Jurisdiction',
      'County / Jurisdiction',
      'County',
      'Entity'
    ]);

  const position =
    firstValue(row, [
      'Position',
      'Office',
      'Title',
      'Role',
      'Office / Position'
    ]) || '[POSITION]';

  const salutation =
    firstValue(row, ['Salutation']) ||
    `Mr./Ms./Mrs. ${lastName}`;

  const dueDate =
    firstValue(row, [
      'SEI Due Date',
      'Due Date',
      `${filingYear} SEI Due Date`
    ]) || '[DUE DATE]';

  const letterDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const normal = (text, options = {}) =>
    new Paragraph({
      spacing: {
        before: options.before ?? 0,
        after: options.after ?? 120,
        line: 240
      },
      alignment: options.alignment,
      indent: options.indent,
      children: [
        new TextRun({
          text,
          font: 'Times New Roman',
          size: 24,
          bold: options.bold || false
        })
      ]
    });
const body = (text, options = {}) =>
  normal(text, {
    alignment: AlignmentType.JUSTIFIED,
    ...options
  });
  const blank = () =>
  new Paragraph({
    spacing: { after: 0, line: 240 },
    children: [new TextRun({ text: '\u00A0', size: 24 })]
  });

  const bullet = (text) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 80, line: 240 },
      children: [
        new TextRun({
          text,
          font: 'Times New Roman',
          size: 24
        })
      ]
    });

const deficiencyBox = (text) =>
  new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 8 },
              bottom: { style: BorderStyle.SINGLE, size: 8 },
              left: { style: BorderStyle.SINGLE, size: 8 },
              right: { style: BorderStyle.SINGLE, size: 8 }
            },
            margins: {
              top: 60,
              bottom: 60,
              left: 120,
              right: 120
            },
            children: String(text)
              .split('\n')
              .filter((line) => line.trim())
              .map(
                (line) =>
                  new Paragraph({
                    spacing: {
                      after: 80,
                      line: 240
                    },
                    children: [
                      new TextRun({
                        text: line,
                        font: 'Times New Roman',
                        size: 24
                      })
                    ]
                  })
              )
          })
        ]
      })
    ]
  });
  
  const recipientBlock = new Paragraph({
    spacing: { after: 200, line: 240 },
    children: [
      new TextRun({
        text: fullName,
        break: 0,
        font: 'Times New Roman',
        size: 24
      }),
      new TextRun({
        text: address,
        break: 1,
        font: 'Times New Roman',
        size: 24
      }),
      ...(cityStateZip
  ? [
      new TextRun({
        text: cityStateZip,
        break: 1,
        font: 'Times New Roman',
        size: 24
      })
    ]
  : [])
  ]
});
  
 const campaignOffice =
  normalizeWhitespace(row.__campaignOffice || '');

const positionDescription = campaignOffice
  ? `member of ${campaignOffice}`
  : position;

const roleDescription =
  !campaignOffice && jurisdiction
    ? `${positionDescription} for ${jurisdiction}`
    : positionDescription;

const roleArticle =
  /^[aeiou]/i.test(roleDescription.trim()) ? 'an' : 'a';

  
  
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 24
          },
          paragraph: {
            spacing: {
              line: 240
            }
          }
        }
      }
    },

    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },

      children: [
          normal(letterDate, { alignment: AlignmentType.CENTER }),
          recipientBlock,

          normal(`Dear ${salutation}:`),
          
blank(),
          
       

       

          body(
            `This is not a form letter. You are receiving this letter because you are currently in violation of the Ethics Reform Act. As ${roleArticle} ${roleDescription}, you are subject to the Ethics Reform Act, which is the body of laws that govern public officials, public members, and public employees.`,
           { before: 120 }
), 

         body(deficiencyParagraphText),
         deficiencyBox(deficiencyBoxText),

       body(
  `In accordance with Section 8-13-1510, South Carolina Code Ann., 1976, as amended, a late filing penalty of $100.00 per late or missing filing, totaling ${formattedPenalty}, is hereby levied. If the required ${deficiencyCount === 1 ? 'report is' : 'reports are'} not filed electronically within ten calendar days of receipt of this letter, additional penalties could be levied.`
),

          body(
            `If extenuating circumstances prevented you from filing the reports as required, you may file a written appeal of this late filing penalty. To file an appeal, you must do the following within ten (10) days of receipt of this letter:`
          ),

          bullet(
            'Send a personal check or money order made payable to the State Ethics Commission'
          ),

          new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 0, line: 240 },
  children: [
    new TextRun({
      text: 'File all missing reports online at ',
      font: 'Times New Roman',
      size: 24
    }),
    new ExternalHyperlink({
      children: [
        new TextRun({
          text: 'https://ethicsfiling.sc.gov/filing/home',
          font: 'Times New Roman',
          size: 24,
          style: 'Hyperlink'
        })
      ],
      link: 'https://ethicsfiling.sc.gov/filing/home'
    })
  ]
}),

          bullet(
            'Provide a written statement describing any extenuating circumstances and include any supporting documentation. If you have closed your campaign account, please provide a copy of your last bank statement to consider a reduction in the late filing penalty.'
          ),
          

          
          body(
            `Please be advised that all appeals must be in writing and must follow the above directions. NO phone or e-mail appeals will be accepted. Failure to file is a misdemeanor. After the maximum civil penalty has been levied, this matter could be referred to Magistrate’s Court for criminal prosecution. This matter will also be referred to the South Carolina Department of Revenue for collection, and the penalty amount and your name, city, and position will be posted on the State Ethics Commission's website. Please contact this office if we can provide further information.`
          ),

          blank(),

          normal('Sincerely,', { after: 0, indent: { left: 4320 } }),
blank(),
blank(),
blank(),
normal(selectedSigner.name || '[SIGNATURE]', { after: 0, indent: { left: 4320 } }),
normal(selectedSigner.titleLine1 || '[TITLE]', { after: 0, indent: { left: 4320 } }),
...(selectedSigner.titleLine2
  ? [normal(selectedSigner.titleLine2, { after: 0, indent: { left: 4320 } })]
  : []),
        ]
      }
    ]
  });

  return { doc, Packer, fullName, filingYear };
}

const generateLettersBtn = $('generateLettersBtn');

if (generateLettersBtn) {
  generateLettersBtn.addEventListener('click', async () => {
    const letterRows = preparedRows.filter(
  (row) =>
    Array.isArray(row.__deficiencies) &&
    row.__deficiencies.length > 0
);

    if (!letterRows.length) {
      alert('There are no deficiency records requiring letters.');
      return;
    }

    generateLettersBtn.disabled = true;
    const originalText = generateLettersBtn.textContent;
    generateLettersBtn.textContent = 'Generating...';

    try {
      
      for (const row of letterRows) {
        const { doc, Packer, fullName, filingYear } =
            buildAnnualSeiWordDocument(row);

        const blob = await Packer.toBlob(doc);

        downloadBlob(
          blob,
          `${safeFileName(fullName)}_${filingYear}_Compliance_Letter.docx`
        );
      }

      alert(
        `${letterRows.length} editable Word letter${letterRows.length === 1 ? '' : 's'} generated.`
      );
    } catch (error) {
      console.error(error);
      alert(
        `The Word letters could not be generated: ${error.message || error}`
      );
    } finally {
      generateLettersBtn.disabled = false;
      generateLettersBtn.textContent = originalText;
    }
  });
}
