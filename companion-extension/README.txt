# UCAS Moodle Companion 0.3.0

Desktop Chrome extension for user-authorized import of their own Moodle UCAS course attachments.

## Use
1. Unzip the archive in a permanent folder. If you work from the UCAS repository, you can load the `companion-extension` folder directly instead.
2. Open `chrome://extensions` in Chrome Desktop, turn on **Developer mode**, select **Load unpacked**, and choose this folder. To update from 0.1 or 0.2, replace the files inside the original folder (or remove the old copy), then click **Reload** on the extension card.
3. Sign in to `https://moodle.ucas.edu.ps` normally in the same Chrome browser; do not share your password with UCAS.
4. Open `https://mmashharawi2021-cell.github.io/UCAS/`, visit **ربط Moodle**, then click **مزامنة من Moodle** to link course IDs.
5. Click **فحص ملفات المساقات** to see a preview and the per-course scan report, choose which files you want, then click **استيراد الملفات المحددة**.
6. Leave the UCAS tab open until the transfer completes. All downloaded files are stored in the local IndexedDB study library of **that desktop browser**, not in the public GitHub repository. Optional account cloud sync may later upload records to a user-authorized private backend; review its separate settings first.

## What's new in 0.3.0
- Per-course scan report (counts only): which activity types the course page shows, how many content pages were opened, and which links were skipped (unsupported formats, untrusted links, pages that could not be opened). UCAS uses it to explain courses that show no files.
- Word, PowerPoint and Excel files sent with their standard Office MIME types are accepted; 0.2.0 refused them as unsafe. HTML, SVG, XML and script types are still refused.
- Resources whose display setting is embed, frame or pop-up download through Moodle's own `redirect=1` link, with a fallback to the file link on Moodle's resource page.
- Files embedded in pages (PDF viewers, Office embeds) and links with a `#page` fragment are discovered.
- Scans wait for each course page to load before reading it (0.2.0 could read the previous page), retry while the page script loads, and stop once with a clear message when the Moodle session has expired.
- Transfer tabs left open by a timed-out download are closed before the next transfer or scan.

## Security and limits
- Uses the signed-in student's permitted view and browser cookies locally; DOES NOT read, export or store passwords, session cookies, Moodle tokens or HTML source.
- Does not bypass permissions or login; inaccessible items and expired sessions are reported as errors.
- Only Moodle UCAS lecture resource activity and folder/page/book attachment links are discovered; private submissions, feedback, grades, external sites and protected activity content are not collected. Links to external sites (Google Drive, YouTube), forum attachments, assignment description files and book chapters after the first are not scanned; the scan report counts these activity types so the student knows where to look.
- The scan report and file catalog never contain Moodle URLs or page text; the UCAS site receives opaque file IDs.
- The file type UCAS stores comes from the file's extension, never from Moodle's response header; a header declaring HTML, SVG, XML, XSL or script refuses the file.
- Opening folders, pages and books to look for files, and downloading a resource, are ordinary visits for Moodle: they appear in its logs and can mark "view" activity completion, as if the student opened them. Page requests are paced and stop when Moodle answers 429/503.
- Never downloads without an explicit import click. The periodic schedule only refreshes *course metadata*, not files.
- Supported: PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT/MD/CSV, ZIP, PNG/JPG/WEBP; maximum 35 MiB/file. Maximum 1200 indexed attachments per discovery. Space quotas on the user's browser can also limit imports.
- Moodle page or server changes may affect discovery, authorization or downloads. Some files may require additional clicks or permission not accessible to the extension.
- Chrome for Android does not support ordinary Chrome extensions. A desktop session is necessary; files imported locally on desktop will not appear automatically on Android unless the existing optional account cloud sync is separately configured.
- The user must have permission to download the materials. Do not redistribute copyright-protected lecture files.

Version: 0.3.0 · UCAS app: 1.7.0
