function normalizeOfficeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+for\s+[a-z.' -]+county$/i, "")
    .replace(/\s+/g, " ");
}

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function officeNamesMatch(a, b) {
  const left = normalizeOfficeName(a);
  const right = normalizeOfficeName(b);

  if (!left || !right) return false;

  return left === right;
}

function campaignRunContainsElectionDate(run, electionDate) {
  const election = normalizeDate(electionDate);

  if (!election) return false;

  const start = normalizeDate(run?.start);
  const end = normalizeDate(run?.end);

  if (start && election < start) return false;
  if (end && election > end) return false;

  return true;
}

function findMatchingCampaignRuns(runs, officeName, electionDate) {
  const runList = Array.isArray(runs) ? runs : [];

  return runList.filter((run) => {
    if (!officeNamesMatch(run?.name, officeName)) {
      return false;
    }

    if (!electionDate) {
      return true;
    }

    return campaignRunContainsElectionDate(run, electionDate);
  });
}

module.exports = {
  findMatchingCampaignRuns,
  officeNamesMatch
};
