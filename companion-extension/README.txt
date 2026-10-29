# UCAS Moodle Companion 0.2.0

Desktop Chrome extension for user-authorized import of their own Moodle UCAS course attachments.

## Use
1. Unzip the archive in a permanent folder.
2. Open `chrome://extensions` in Chrome Desktop, turn on **Developer mode**, select **Load unpacked**, and choose this folder. If you already installed v0.1, remove its old copy or replace the files inside the original folder, then click **Reload**.
3. Sign in to `https://moodle.ucas.edu.ps` normally in the same Chrome browser; do not share your password with UCAS.
4. Open `https://mmashharawi2021-cell.github.io/UCAS/`, visit **ربط Moodle**, then click **مزامنة من Moodle** to link course IDs.
5. Click **فحص ملفات المساقات** to see a preview, choose which files you want, then click **استيراد الملفات المحددة**.
6. Leave the UCAS tab open until the transfer completes. All downloaded files are stored in the local IndexedDB study library of **that desktop browser**, not in the public GitHub repository. Optional account cloud sync may later upload records to a user-authorized private backend; review its separate settings first.

## Security and limits
- Uses the signed-in student's permitted view and browser cookies locally; DOES NOT read, export or store passwords, session cookies, Moodle tokens or HTML source.
- Does not bypass permissions or login; inaccessible items and expired sessions are reported as errors.
- Only Moodle UCAS lecture resource activity and folder/page/book attachment links are discovered; private submissions, feedback, grades, external sites and protected activity content are not collected.
- Never downloads without an explicit import click. The periodic schedule only refreshes *course metadata*, not files.
- Supported: PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT/MD/CSV, ZIP, PNG/JPG/WEBP; maximum 35 MiB/file. Maximum 1200 indexed attachments per discovery. Space quotas on the user's browser can also limit imports.
- Moodle page or server changes may affect discovery, authorization or downloads. Some files may require additional clicks or permission not accessible to the extension.
- Chrome for Android does not support ordinary Chrome extensions. A desktop session is necessary; files imported locally on desktop will not appear automatically on Android unless the existing optional account cloud sync is separately configured.
- The user must have permission to download the materials. Do not redistribute copyright-protected lecture files.

Version: 0.2.0 · UCAS app: 1.7.0
