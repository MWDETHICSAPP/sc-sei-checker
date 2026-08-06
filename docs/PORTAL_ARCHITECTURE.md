# Ethics Compliance Portal
## System Architecture

**Version:** 1.0 (Working Draft)

---

# Mission

The Ethics Compliance Portal performs objective compliance reviews by determining filing obligations, locating required filings, comparing those filings against statutory requirements, and producing person-centered Compliance Profiles for Commission staff.

---

# System Overview

The Portal is composed of three primary engines:

1. Rules Engine
2. Compliance Engine
3. Staff Workflow

Each engine has a distinct responsibility.

---

# Rules Engine

## Purpose

Determine every filing obligation that exists for a person during the selected reporting year.

## Inputs

- Reporting Year
- Filing Basis
- Office(s)
- Jurisdiction(s)
- Campaign(s)

## Outputs

- Required SEIs
- Required Campaign Reports
- Manual Review Flags

---

# Compliance Engine

## Purpose

Determine whether every required filing exists and whether it was timely.

## Possible Results

- Filed
- Filed Late
- Missing
- Manual Review Required

The Compliance Engine performs objective comparisons only.

---

# Compliance Profile

Every reviewed person receives one Compliance Profile.

The Compliance Profile serves as the single source of truth for:

- Portal Screen
- Work Queue
- Excel Export
- Deficiency Letter
- Dashboard Statistics

---

# Staff Workflow

The Staff Workflow begins after the Compliance Profile has been created.

Staff responsibilities include:

- Reviewing deficiencies
- Determining just cause
- Evaluating legal defenses
- Making enforcement decisions
- Approving correspondence

These responsibilities are intentionally not automated.

---

# Outputs

The Portal generates multiple outputs from the same Compliance Profile.

## Work Queue

Operational spreadsheet used by Commission staff.

One row represents one person.

---

## Deficiency Letter

One person.

One letter.

Every objective deficiency.

---

## Dashboard

Management reporting.

Examples include:

- People Reviewed
- Compliant
- Potential Deficiencies
- Manual Reviews
- Letters Ready

---

# Design Philosophy

The Portal shall:

- automate objective determinations
- preserve one source of truth
- separate compliance from enforcement
- support Commission workflow
- remain adaptable as statutes and Commission procedures evolve
