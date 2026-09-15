# Zhijian · Resume Studio

[中文](README.md) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)

**纸间 (Zhijian)** is a local résumé workspace built with HTML, CSS and JavaScript. Maintain separate versions for different applications, edit text and layout in the browser, and export a selectable-text A4 PDF.

## Start locally

Install Node.js **22 or later** (24 LTS recommended). PDF export and two-page fitting also require an installed Chrome or Edge browser.

~~~sh
npm ci
npm run server
~~~

To use another port, run `npm run server 8080` and open <http://127.0.0.1:8080/>. Explicit flags also work: `npm run server -- --port 8080`. The standalone `--` tells npm to forward flags to the application; using a bare port avoids this separator. The existing `npm start` and `npm run preview` aliases remain available. CLI arguments override `PORT`, then the default `4173`; the valid range is 1–65535. Run `npm run server -- --help` for help.

Changing ports keeps the same data directory, but browser drafts are isolated by port: wait for autosave before switching. Do not run concurrent servers against one data directory; use separate `ZHIJIAN_DATA_DIR` values when running multiple instances.

With the default port, open <http://127.0.0.1:4173/>. A fresh installation starts with an empty collection and creates its own local data directory. No account or AI service is needed.

When creating a résumé, choose the blank preset, a clearly fictional demo, or a copy of an existing résumé. The interface and default sections are primarily Chinese; English text uses Georgia with system fallbacks.

## Features

- A paper-inspired cover and a collection with names and short descriptions.
- Forms and direct text editing, field ordering, inline layouts, and paragraph / bullet / numbered content blocks.
- Global styles and formatting for individual fields or text selections.
- Autosave, browser drafts, undo / redo, previous-save recovery, and stale-window conflict checks.
- JSON import / export, standalone HTML export, PDF export, and two-page fitting checked against actual PDF pagination.
- A recycle bin with restore and separately confirmed permanent deletion. There is no automatic expiry.

Restoring preserves the résumé ID, contents, styles, and existing backup files. Editors opened before deletion must reload the restored version before saving. Permanent deletion removes that résumé's archived files; separate exports and shared image files remain independent.

Two-page fitting adjusts spacing, margins and, when necessary, font size. It does not rewrite or trim your content. If two pages cannot be achieved within the supported limits, the current layout is preserved. Always inspect pagination before sending a résumé.

Internships appear after education and before projects by default. Each entry has an organization, department, role, dates and rich content blocks. Older documents gain a hidden, empty internship section; adding the first entry shows it automatically. The default heading uses “Organization　Department · Role”, with dates aligned right. Each entry supports uploading, replacing or removing a logo before its organization name; logos are included in JSON, HTML and PDF exports. Its order, visibility, field layout and text formatting remain editable.

## Public code and private data

| Location | Purpose |
| --- | --- |
| `presets/blank.json` | Public default layout with empty personal fields |
| `presets/demo.json` | Public, fictional sample content |
| `data/library.json` | Active and deleted résumé catalog; keep this file |
| `data/resumes/<id>/` | Each résumé's data, generated HTML, and backups |
| `data/deleted/<id>/` | Recycle bin archives |
| `data/resume.json` | Backward-compatible storage for an existing main résumé |

Public presets are read-only inputs to creation. Personal edits never change them. Existing installations keep using their own data; demo content does not replace it.

The default data directory, legacy personal images, generated files, local documents and development output are ignored by Git. Add ignore rules for any new private resources you introduce. Check the actual files and history before publishing; do not distribute a raw archive of your working directory.

Back up the whole data directory for a complete migration, plus any externally referenced local images. For one résumé, JSON export embeds the images and can be imported into a new document. `resume.previous.json` powers previous-save recovery; `resume.original.json` and `resume.pre-v*.json` are historical snapshots. The obsolete `data/blank-template.json` is no longer read or generated.

The server binds to loopback only and has no multi-user authentication or isolation. PDF generation runs locally. Hosting a public editing service requires additional isolation and is outside the current local application design.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4173` | Local HTTP port |
| `ZHIJIAN_DATA_DIR` | `data/` | Data directory; relative paths resolve from the project root |
| `RESUME_BROWSER_PATH` | Auto-detected | Chrome / Edge executable |

PowerShell:

~~~powershell
$env:ZHIJIAN_DATA_DIR = 'D:/MyResumes'
npm run server
~~~

macOS / Linux:

~~~sh
ZHIJIAN_DATA_DIR="$HOME/.local/share/zhijian" npm run server
~~~

Changing the data directory does not move existing data automatically. Copy your complete data directory first, or import a JSON export into the new workspace.

## Development

The app uses browser ES modules and a Node.js HTTP server without a bundler. `app/model.js` and `app/format.js` handle validation and schema migration; `app/render.js` is shared by preview and export. `scripts/store.mjs` owns persistence and recycling, while `scripts/presets.mjs` owns public presets. PDF generation and fitting live in `scripts/pdf.mjs` and `scripts/pagination.mjs`.

~~~sh
npm test
~~~

Tests use isolated temporary data. PDF tests require a supported browser. Windows with Chrome is the primary tested environment; platform fonts and browser versions can affect line wrapping and pagination. System fonts, including Georgia, are not bundled.

## License and acknowledgements

Code is licensed under MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency, font and VibeResume reference notices. Personal résumés, photos and institutional logos are not granted a public license by this repository.
