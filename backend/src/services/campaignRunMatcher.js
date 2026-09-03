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
  if (left === right) return true;

  const districtSuffix = /\s+district\s+\d+$/i;
  const leftHasDistrict = districtSuffix.test(left);
  const rightHasDistrict = districtSuffix.test(right);

  // Never treat two different numbered districts as the same office.
  if (leftHasDistrict && rightHasDistrict) return false;

  // The filing system sometimes stores a district office under its
  // districtless parent name (for example, "Richland County Council").
  return (
    left.replace(districtSuffix, "") ===
    right.replace(districtSuffix, "")
  );
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
