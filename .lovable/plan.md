Plan:

1. Update `ChecklistExecutionDialog.tsx` so PDF.js uses the local worker bundled with `react-pdf` / its nested `pdfjs-dist`, instead of the CDN URL that fails to load on the blob/iPhone path.
2. Keep the existing `react-pdf` rendering in the checklist dialog, but make the worker import resolve to the same PDF.js version as `react-pdf` (`5.4.296`) to avoid both CDN fetch failures and API/worker version mismatch.
3. Ensure PDF load errors show the Norwegian fallback message with the existing “Åpne i ny fane” option.
4. Verify with TypeScript/build signal after implementation.

Technical detail:
- Replace `pdfjs.GlobalWorkerOptions.workerSrc = https://cdnjs...` with a Vite `?url` import from `react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, then assign that imported URL to `pdfjs.GlobalWorkerOptions.workerSrc`.