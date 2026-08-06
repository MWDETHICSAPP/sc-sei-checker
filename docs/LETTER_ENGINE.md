# Ethics Compliance Portal
## Letter Engine

**Version:** 1.0 (Working Draft)

---

# Purpose

The Letter Engine generates one draft deficiency letter for each person whose Compliance Profile contains objective filing deficiencies.

---

# Official Template Requirement

The Ethics Compliance Portal shall use the Commission’s existing approved deficiency letter as the controlling template.

The Portal shall preserve the template’s:

- wording
- formatting
- paragraph order
- legal citations
- signature block
- overall structure

The Portal shall not rewrite, summarize, modernize, or otherwise alter the approved template unless expressly authorized by the Commission.

---

# Source of Letter Data

The Letter Engine shall populate the approved template using the person’s Compliance Profile.

The Compliance Profile is the single source of truth for:

- filer name
- address
- office
- jurisdiction
- filing type
- report year or reporting period
- original due date
- grace-period deadline
- filing date
- whether the filing is missing
- whether the filing was late
- manual review status

---

# Person-Centered Letter

The Portal shall generate one letter per person.

A single letter may contain:

- multiple missing SEIs
- multiple late SEIs
- multiple campaign-report deficiencies
- deficiencies from more than one campaign
- both SEI and campaign deficiencies

---

# Objective Findings Only

The Letter Engine may state objective filing facts identified by the Portal.

The Letter Engine shall not determine or state:

- just cause
- legal defenses
- investigative findings
- enforcement conclusions

Commission staff must review and approve every letter before it is sent.

---

# Manual Review

The Portal shall not generate a final draft letter when unresolved matching or filing issues require manual review.

The Portal may instead mark the record:

**Manual Review Before Letter**

---

# Template Changes

Changes to the Commission’s approved letter template must be made separately from changes to the compliance rules or compliance engine.

Updating the official template shall not require rewriting the compliance logic.
