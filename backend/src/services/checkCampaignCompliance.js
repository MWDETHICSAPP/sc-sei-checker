/**
 * Campaign Disclosure Compliance Service
 *
 * This module will eventually:
 * 1. Locate a person's campaign-disclosure run for office.
 * 2. Determine whether the run is still open.
 * 3. Build the rolling four-year list of required reports.
 * 4. Compare required reports with reports actually filed.
 * 5. Return filing dates, missing reports, and late reports.
 *
 * It is not connected to the live application yet.
 */
const { findMatchingCampaignRuns } = require("./campaignRunMatcher");
const {
  searchCandidates,
  getCandidateHistory
} = require("./electionHistoryService");

const CAMPAIGN_REPORTS_URL =
  "https://ethicsfiling.sc.gov/api/Candidate/Report/Public/Campaign/Get/Reports";
const CAMPAIGN_PROFILE_URL =
  "https://ethicsfiling.sc.gov/api/Candidate/Campaign/Get/Personal/Profile";
async function getCampaignProfile(candidateFilerId, seiFilerId) {
  if (!candidateFilerId || !seiFilerId) return null;

  const response = await fetch(CAMPAIGN_PROFILE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      candidateFilerId,
      seiFilerId
    })
  });

  if (!response.ok) {
    throw new Error(
      `Campaign profile search failed with status ${response.status}`
    );
  }

  return response.json();
}
function isDueWithinFourYears(dueDate, asOfDate = new Date()) {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;

  const cutoff = new Date(asOfDate);
  cutoff.setFullYear(cutoff.getFullYear() - 4);

  return due >= cutoff && due <= asOfDate;
}
function getQuarterlyDueDate(reportName) {
  const match = String(reportName || "").match(
    /Quarter\s+([1-4]),\s*(\d{4})\s+Report/i
  );

  if (!match) return null;

  const quarter = Number(match[1]);
  const year = Number(match[2]);

  const dueDates = {
    1: new Date(year, 3, 10),      // April 10
    2: new Date(year, 6, 10),      // July 10
    3: new Date(year, 9, 10),      // October 10
    4: new Date(year + 1, 0, 10),  // January 10 of following year
  };

  return dueDates[quarter] || null;
}
function isObservedFixedHoliday(date, month, day) {
  const targetTime = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  const yearsToCheck = [
    date.getFullYear() - 1,
    date.getFullYear(),
    date.getFullYear() + 1
  ];

  return yearsToCheck.some((year) => {
    const holiday = new Date(year, month, day);

    if (holiday.getDay() === 6) {
      holiday.setDate(holiday.getDate() - 1);
    } else if (holiday.getDay() === 0) {
      holiday.setDate(holiday.getDate() + 1);
    }

    return holiday.getTime() === targetTime;
  });
}

function isNthWeekday(date, month, weekday, nth) {
  return (
    date.getMonth() === month &&
    date.getDay() === weekday &&
    Math.ceil(date.getDate() / 7) === nth
  );
}

function isLastMonday(date, month) {
  if (date.getMonth() !== month || date.getDay() !== 1) return false;

  const nextWeek = new Date(date);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return nextWeek.getMonth() !== month;
}

function isStateOrFederalHoliday(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Fixed-date state/federal holidays, including observed dates
  if (
    isObservedFixedHoliday(date, 0, 1) ||   // New Year's Day
    isObservedFixedHoliday(date, 5, 19) ||  // Juneteenth
    isObservedFixedHoliday(date, 6, 4) ||   // Independence Day
    isObservedFixedHoliday(date, 10, 11) || // Veterans Day
    isObservedFixedHoliday(date, 11, 24) || // Christmas Eve
    isObservedFixedHoliday(date, 11, 25) || // Christmas Day
    isObservedFixedHoliday(date, 11, 26)    // Day after Christmas
  ) {
    return true;
  }

  // Monday-based state/federal holidays
  if (
    isNthWeekday(date, 0, 1, 3) ||  // MLK Day
    isNthWeekday(date, 1, 1, 3) ||  // Washington's Birthday
    isLastMonday(date, 4) ||         // Memorial Day
    isNthWeekday(date, 8, 1, 1) ||  // Labor Day
    isNthWeekday(date, 9, 1, 2)     // Columbus Day
  ) {
    return true;
  }

  // Confederate Memorial Day: May 10, observed under SC rules
  if (isObservedFixedHoliday(date, 4, 10)) {
  return true;
}

  // Day after Thanksgiving
  const thanksgiving = new Date(year, 10, 1);
  while (
    thanksgiving.getDay() !== 4 ||
    Math.ceil(thanksgiving.getDate() / 7) !== 4
  ) {
    thanksgiving.setDate(thanksgiving.getDate() + 1);
  }

  const dayAfterThanksgiving = new Date(thanksgiving);
  dayAfterThanksgiving.setDate(dayAfterThanksgiving.getDate() + 1);

  if (
    month === dayAfterThanksgiving.getMonth() &&
    day === dayAfterThanksgiving.getDate()
  ) {
    return true;
  }

  return false;
}
function getGracePeriodDeadline(
  dueDate,
  isHoliday = isStateOrFederalHoliday
) {
  if (!dueDate) return null;

  const deadline = new Date(dueDate);
  deadline.setDate(deadline.getDate() + 5);

  while (
    deadline.getDay() === 0 ||
    deadline.getDay() === 6 ||
    isHoliday(deadline)
  ) {
    deadline.setDate(deadline.getDate() + 1);
  }

  return deadline;
}
async function getCampaignReportDetail(reportId) {
  if (!reportId) return null;

  const response = await fetch(
    `https://ethicsfiling.sc.gov/api/Ethics/Get/Public/Candidate/Report/Details/${reportId}`
  );

  if (!response.ok) {
    throw new Error(
      `Campaign report detail search failed with status ${response.status}`
    );
  }

  return response.json();
}
async function getOriginalSubmissionDate(reportId) {
  const detail = await getCampaignReportDetail(reportId);

  if (!detail) return null;

  const versions = Array.isArray(detail?.versions) ? detail.versions : [];

  const originalVersion = versions.find(
    (version) =>
      String(version?.name || "").trim().toLowerCase() === "original report"
  );

  if (originalVersion?.id && originalVersion.id !== reportId) {
    const originalDetail = await getCampaignReportDetail(originalVersion.id);
    return originalDetail?.overview?.submittedDate || null;
  }

  return detail?.overview?.submittedDate || null;
}
async function getCampaignFundEndingBalance(reportId) {
  const detail = await getCampaignReportDetail(reportId);

  if (!detail) return null;

  const totals = Array.isArray(detail?.overview?.totals)
    ? detail.overview.totals
    : [];

  const campaignFunds = totals.find(
    (total) =>
      String(total?.totalType || "").trim().toLowerCase() === "campaign funds"
  );

  if (campaignFunds?.endingBalance === undefined) return null;

  const endingBalance = Number(campaignFunds.endingBalance);

  return Number.isNaN(endingBalance) ? null : endingBalance;
}
async function checkCampaignCompliance(input) {
  const candidate = String(input?.candidate || input?.lastName || "")
    .trim()
    .toLowerCase();

  const reportingYear = Number(input?.reportingYear || input?.year);

  if (!candidate || !reportingYear) {
    return {
      input,
      status: "Manual Review",
      reviewType: "Campaign Disclosure",
      reports: [],
      notes: "Candidate last name and reporting year are required."
    };
  }

  const response = await fetch(CAMPAIGN_REPORTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      candidate,
      office: input?.office || "",
      reportType: input?.reportType || "Any",
      electionType: input?.electionType || "Any",
        })
  });

  if (!response.ok) {
    throw new Error(
      `Campaign report search failed with status ${response.status}`
    );
  }

  const reports = await response.json();
const reportList = Array.isArray(reports) ? reports : [];

const profileSeedReport = reportList.find(
  (report) => report?.candidateFilerId && report?.seiFilerId
);

let campaignProfile = null;

if (profileSeedReport) {
  campaignProfile = await getCampaignProfile(
    profileSeedReport.candidateFilerId,
    profileSeedReport.seiFilerId
  );
}
  console.log(
  "CAMPAIGN PROFILE:",
  JSON.stringify(campaignProfile, null, 2)
);
  const requestedOffice = String(input?.office || "")
  .trim()
  .toLowerCase();

const openOffices = Array.isArray(campaignProfile?.openOffices)
  ? campaignProfile.openOffices
  : [];

const closedOffices = Array.isArray(campaignProfile?.closedOffices)
  ? campaignProfile.closedOffices
  : [];

const allOfficeRuns = [...openOffices, ...closedOffices];

const relevantOfficeRuns = input?.electionDate
  ? findMatchingCampaignRuns(
      allOfficeRuns,
      requestedOffice,
      input.electionDate
    )
  : allOfficeRuns.filter((office) => {
      const officeMatches =
        String(office?.name || "").trim().toLowerCase() === requestedOffice;

      if (!officeMatches) return false;

      if (!office?.isClosed) return true;

      return isDueWithinFourYears(office?.end);
    });
console.log(
  "RELEVANT OFFICE RUNS:",
  JSON.stringify(relevantOfficeRuns, null, 2)
);
const relevantFilerIds = new Set(
  relevantOfficeRuns
    .map((office) => office?.filerId)
    .filter(Boolean)
);

const relevantReports = reportList.filter(
  (report) =>
    relevantFilerIds.has(report?.candidateFilerId) &&
    String(report?.office || "").trim().toLowerCase() === requestedOffice
);
  const reportsWithinFourYears = relevantReports.filter((report) => {
  const dueDate = getQuarterlyDueDate(report?.reportName);

  if (!dueDate) return false;

  return isDueWithinFourYears(dueDate);
});
  reportsWithinFourYears.sort((a, b) => {
  const aDueDate = getQuarterlyDueDate(a?.reportName);
  const bDueDate = getQuarterlyDueDate(b?.reportName);

  if (!aDueDate && !bDueDate) return 0;
  if (!aDueDate) return 1;
  if (!bDueDate) return -1;

  return aDueDate - bDueDate;
});
  const evaluatedQuarterlyReports = [];
let enforcementCutoffReached = false;
for (const report of reportsWithinFourYears) {
  if (enforcementCutoffReached) break;
  const dueDate = getQuarterlyDueDate(report?.reportName);
  const originalSubmittedDate = await getOriginalSubmissionDate(report?.reportId);
  const endingBalance = await getCampaignFundEndingBalance(report?.reportId);
const gracePeriodDeadline = getGracePeriodDeadline(dueDate);
const submittedDate = originalSubmittedDate ? new Date(originalSubmittedDate) : null;
  evaluatedQuarterlyReports.push({
    ...report,
    dueDate: dueDate ? dueDate.toISOString() : null,
gracePeriodDeadline: gracePeriodDeadline
  ? gracePeriodDeadline.toISOString()
  : null,
originalSubmittedDate,
    endingBalance,
timely:
  submittedDate && gracePeriodDeadline
    ? submittedDate <= gracePeriodDeadline
    : null
  });
  if (endingBalance === 0) {
  enforcementCutoffReached = true;
}
}
  return {
    input,
    status: "Search Complete",
    reviewType: "Campaign Disclosure",
   reports: reportList,
    campaignProfile,
    relevantOfficeRuns,
relevantReports,
    reportsWithinFourYears,
    evaluatedQuarterlyReports,
    notes: "Campaign disclosure reports retrieved from the public filing system."
  };
}

module.exports = { checkCampaignCompliance };
