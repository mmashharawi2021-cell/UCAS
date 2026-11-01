---
name: lecture-processing
description: Process imported PDF, DOCX, PPTX and TXT lectures into safe searchable units while preserving local-first privacy.
---
# Workflow

1. Use existing js/drive.js import validation and js/office.js, js/pdf-text.js, js/ocr.js extractors where supported.
2. Separate file metadata from blob storage and do not upload a file automatically.
3. Normalize course, module, filename and source location without losing the raw resource reference.
4. Sanitize untrusted file text, prevent HTML injection, and avoid storing extraction results outside authorized local storage.
5. For OCR, show confidence and limitations; do not assign page labels not provided by extractors.
6. Benchmark large files on memory-limited mobile; test duplicates, unsupported types, scans and offline fallback.

Deliver: extraction coverage, indexing strategy, fallback errors and test fixtures with nonpersonal data.
