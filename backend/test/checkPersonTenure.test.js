const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getEthicsProfileFirstOfficeYear
} = require("../src/services/checkPerson");

test("uses the matching Ethics candidate year when SC Votes has no winner", () => {
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

  assert.equal(year, 2024);
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

  assert.equal(year, 2024);
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
