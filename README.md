# SC SEI Checker — iPad Prototype

This is an installable web app (PWA) designed for iPad.

## Current working features
- Import XLSX, XLS, or CSV
- Choose name and jurisdiction columns
- Extract surname for last-name-first checking
- Record Filed / Manual Review / Not Filed
- Record matched filing name and notes
- Filter results
- Export completed XLSX
- Install to iPad Home Screen when hosted over HTTPS

## Next integration
Connect the app to an authorized server-side search adapter for ethicsfiling.sc.gov. A server-side adapter is necessary because direct browser automation may be blocked by CORS and because the public site is a JavaScript application.

## Run locally
Serve the folder with any static HTTPS-capable host. For development:

    python3 -m http.server 8000

Then open http://localhost:8000 on a computer. For installation on iPad, deploy to an HTTPS host.
