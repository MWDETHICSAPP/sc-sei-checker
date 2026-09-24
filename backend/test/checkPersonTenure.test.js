const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getEthicsProfileFirstOfficeYear,
  requiresSeiForYear,
  getPartisanCandidateYearsFromHistory,
  selectSeiMatchesForPerson
} = require("../src/services/checkPerson");

test("candidate year does not stand in for first elected year", () => {
  const year = getEthicsProfileFirstOfficeYear({
    jurisdiction: "Lexington County",
    office: "Lexington County Council District 1",
    campaignProfile: {
      allPositions: [
        {
          reportYear: "2026",
          position: "County Council",
          entity: "Lexington County",
          positionType: "Elected"
        },
        {
          reportYear: "2024",
          position: "County Council",
          entity: "Lexington County",
          positionType: "Candidate"
        },
        {
          reportYear: "2022",
          position: "Mayor",
          entity: "Springdale",
          positionType: "Elected"
        }
      ]
    }
  });

  assert.equal(year, 2026);
});

test("does not use an unrelated office in the same filer profile", () => {
  const year = getEthicsProfileFirstOfficeYear({
    jurisdiction: "Lexington County",
    office: "Lexington County Council District 1",
    campaignProfile: {
      allPositions: [
        {
          reportYear: "2020",
          position: "Coroner",
          entity: "Lexington County",
          positionType: "Elected"
        },
        {
          reportYear: "2024",
          position: "County Council",
          entity: "Lexington County",
          positionType: "Candidate"
        }
      ]
    }
  });

  assert.equal(year, null);
});

test("SC Votes partisan primary establishes the candidate SEI year for the matching office", () => {
  const history = { contests: [
    { year: 2024, contest: { division: { displayName: "Richland County Council District 3" }, eventTypeDisplayName: "Democratic Primary" } },
    { year: 2022, contest: { division: { displayName: "Richland County Council District 4" }, eventTypeDisplayName: "Republican Primary" } },
    { year: 2020, contest: { division: { displayName: "Richland County Council District 3" }, eventTypeDisplayName: "General" } }
  ] };
  assert.deepEqual([...getPartisanCandidateYearsFromHistory(history, "Richland County Council District 3")], [2024]);
});

test("uses elected term start rather than the SEI report year", () => {
  const year = getEthicsProfileFirstOfficeYear({
    jurisdiction: "Richland County", office: "Richland County Council District 3",
    campaignProfile: { allPositions: [
      { reportYear: "2026", startYear: "2025", position: "County Council",
        entity: "Richland County", positionType: "Elected" },
      { reportYear: "2024", startYear: "2025", position: "County Council",
        entity: "Richland County", positionType: "Candidate" }
    ] }
  });
  assert.equal(year, 2025);
});

test("normalizes school district jurisdiction names", () => {
  const year = getEthicsProfileFirstOfficeYear({
    jurisdiction: "Richland County School District 2",
    office: "School Board Member",
    campaignProfile: {
      allPositions: [
        {
          reportYear: "2024",
          position: "School Board Member",
          entity: "Richland County School 2",
          positionType: "Elected"
        }
      ]
    }
  });

  assert.equal(year, 2024);
});

test("returns null when no profile position matches the requested office", () => {
  const year = getEthicsProfileFirstOfficeYear({
    jurisdiction: "Lexington County",
    office: "Lexington County Council District 1",
    campaignProfile: {
      allPositions: [
        {
          reportYear: "2020",
          position: "Mayor",
          entity: "Springdale",
          positionType: "Elected"
        }
      ]
    }
  });

  assert.equal(year, null);
});

test("matches the trustee spreadsheet title to the elected school board position", () => {
  const year = getEthicsProfileFirstOfficeYear({
    jurisdiction: "Richland County School 2",
    office: "School Board Trustee District RICHLAND #2",
    campaignProfile: { allPositions: [
      { reportYear: "2022", position: "School Board Member", entity: "Richland School District 2", positionType: "Candidate" },
      { reportYear: "2024", position: "School Board Member", entity: "Richland School District 2", positionType: "Elected" }
    ] }
  });
  assert.equal(year, 2024);
});

test("does not start school-board tenure from a losing candidacy", () => {
  const year = getEthicsProfileFirstOfficeYear({
    jurisdiction: "Richland County School 2",
    office: "School Board Trustee District RICHLAND #2",
    campaignProfile: { allPositions: [
      { reportYear: "2022", position: "School Board Member", entity: "Richland County School 2", positionType: "Candidate" }
    ] }
  });
  assert.equal(year, null);
});

test("unknown elected tenure does not invent earlier annual SEI obligations", () => {
  const basis = { isElectedOfficial: true, firstWinningYearForOffice: null,
    historicalPartisanCandidateYears: new Set([2024]),
    isCandidate: false, candidateRequiresSei: false, candidateElectionYear: null };
  assert.equal(requiresSeiForYear({ ...basis, seiYear: 2023 }), false);
  assert.equal(requiresSeiForYear({ ...basis, seiYear: 2024 }), true);
});

test("confirmed elected tenure requires annual SEIs from election year onward", () => {
  const basis = { isElectedOfficial: true, firstWinningYearForOffice: 2024,
    historicalPartisanCandidateYears: new Set(),
    isCandidate: false, candidateRequiresSei: false, candidateElectionYear: null };
  assert.equal(requiresSeiForYear({ ...basis, seiYear: 2023 }), false);
  assert.equal(requiresSeiForYear({ ...basis, seiYear: 2025 }), true);
});

test("full first and last name exclude another filer with the same surname", () => {
  const reports = [
    { filerName: "Alice W. Morgan", reportYear: 2025 },
    { filerName: "Beth Morgan", reportYear: 2025 },
    { filerName: "Alice W. Morgan", reportYear: 2024 }
  ];
  assert.deepEqual(selectSeiMatchesForPerson("Alice Morgan", reports),
    [reports[0], reports[2]]);
  assert.deepEqual(selectSeiMatchesForPerson("A Morgan", reports), reports);
});
