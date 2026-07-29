# SC SEI Checker Backend

This folder contains the server-side API for the SC SEI Checker.

## Current endpoints

- `GET /health`
- `POST /check-person`
- `POST /check-batch`

## Current behavior

The API validates requests and prepares surname-first checks. Until an authorized
live public-search adapter is connected, it returns `Manual Review` rather than
incorrectly reporting `Not Filed`.

## Example single-person request

```json
{
  "name": "T. Brian Moon",
  "jurisdiction": "Abbeville County",
  "year": 2026
}
```

## Privacy

Do not commit passwords, private keys, internal records, confidential data, or
environment files. The application is intended to process public official names,
public jurisdictions, and public filing information.
