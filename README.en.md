<h1 align="center">
  <img src="assets/brand/zhijian.svg" alt="Zhijian logo" width="48" height="48">
  纸间 Zhijian
</h1>

<p align="center"><strong>Your experience deserves to be seen.</strong></p>
<p align="center">A local résumé studio for your story, your layout, and every direction you want to take.</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-30455e?style=flat-square" alt="MIT License"></a>
  <a href="https://nodejs.org/en/download"><img src="https://img.shields.io/badge/Node.js-%3E%3D22-526b52?style=flat-square" alt="Node.js 22 or later"></a>
  <a href="#data"><img src="https://img.shields.io/badge/Data-Local-68796b?style=flat-square" alt="Résumé data stored locally"></a>
</p>

<p align="center">
  <a href="#preview">Preview</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#first-resume">Your first résumé</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="https://github.com/MarkSSH/zhijian-resume/issues">Report an issue</a> ·
  <a href="README.md">中文</a>
</p>

<a id="preview"></a>

## Meet Zhijian

Organize content on the left and edit the résumé on the right. Adjust the whole document or just a few words that deserve emphasis.

[![Zhijian editor showing project fields and a live fictional résumé preview](assets/readme/editor.png)](assets/readme/editor.png)

<details>
<summary>See the cover and multi-résumé workspace</summary>

**Start with a fresh page**

![Zhijian cover with the workspace entry button](assets/readme/cover.png)

**Keep a version for each direction**

![Fictional workspace with separate engineering and research application résumés](assets/readme/workspace.png)

</details>

*All screenshots use the built-in fictional demo. The interface may change between releases; click the main screenshot to view it at full size.*

## What you can do

| Your goal | How Zhijian helps |
| --- | --- |
| Prepare résumés for different applications | Create, duplicate, and name independent versions, with a short note about each one's purpose. |
| Make the layout fit your content | Form and on-page editing, field ordering and inline layouts, partial-text formatting, and paragraph / bullet / numbered blocks. |
| Export something ready to send | Selectable-text A4 PDFs, two-page fitting checked against actual pagination, plus JSON and standalone HTML exports. |
| Keep your work and recover from mistakes | Local autosave, browser drafts, undo / redo, previous-save recovery, and a recycle bin. |

The interface and default layout are primarily Chinese, suited to student, research, and technical résumés. Sections include education, projects, publications, patents, internships, and awards; they can be reordered, renamed, or hidden. English text uses Georgia with system fallbacks. No login, subscription, or AI service is needed.

### Why Zhijian?

The same experience needs different emphasis for different applications. Research opportunities call for a research narrative; job applications call for relevant skills. A fixed template does not always leave room for both.

Zhijian brings version management, text editing, and layout into one workspace. You supply the real experience; the app helps you present it. It does not invent or automatically rewrite your résumé.

<a id="quick-start"></a>

## Install and start

**Already have Node.js 22+?** Download and extract the project, then run these commands in the folder containing `package.json`:

~~~sh
npm ci
npm run server
~~~

Wait for the first command to finish successfully before running the second. Open <http://127.0.0.1:4173/>. PDF export and two-page fitting also require Chrome or Edge installed locally.

**New to the terminal?** Expand the setup guide, then follow the steps below.

<details>
<summary>First-time setup: install Node.js, check versions, and prepare a browser</summary>

Node.js runs the local application; npm installs its dependencies. No coding experience or code editor is required. This project needs **Node.js 22 or later**, with **Node.js 24 LTS** recommended. LTS means long-term support. If Node.js is already installed, check its version below and skip to the steps below.

Download an installer from the [official Node.js download page](https://nodejs.org/en/download):

- **Windows:** Choose Windows, 24 LTS, and the `.msi` installer. Use x64 for most Intel / AMD PCs or ARM64 for an ARM PC; check Settings → System → About → System type if unsure. Run the installer and keep the npm and **Add to PATH** options enabled. Optional native-module build tools are not needed for this project.
- **macOS:** Choose macOS and the LTS `.pkg` installer, then follow its installation prompts.
- **Linux:** Select Linux and LTS on the download page and follow the instructions for your installation method. The [npm installation guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/) also links to available options.

After installation, close any old terminal windows. On Windows, press `Win + R`, type `cmd`, and press Enter to open Command Prompt. On macOS / Linux, open Terminal. Run each line separately:

~~~sh
node -v
npm -v
~~~

Both commands should print version numbers. The Node.js major version must be at least 22; npm has its own version number. If a command is not found, reopen the terminal and check the installation.

PDF export and two-page fitting also require **Chrome or Edge** installed locally. An existing Windows Edge installation is sufficient. Without a supported browser, you can still edit résumés but cannot use these two features.

</details>

### 1. Download and open the project

On the [project repository](https://github.com/MarkSSH/zhijian-resume), select **Code → Download ZIP** and extract the archive. Open the extracted folder containing `package.json`, `package-lock.json`, and `README.md`. This is the project root; downloading a ZIP does not require Git.

- **Windows:** Type `cmd` in that folder's File Explorer address bar and press Enter. This opens Command Prompt in the correct directory.
- **macOS / Linux:** In Terminal, type `cd `, then drag the extracted folder into the window or enter its full path, and press Enter. For example, `cd "/Users/your-name/Downloads/zhijian-resume-main"`; replace this with your actual path.

Run the commands below in the terminal, not the browser address bar. Do not run from inside the ZIP or open the HTML files directly: saving and exporting require the local server.

### 2. Install dependencies and start

On first use, run this from the project root with an internet connection:

~~~sh
npm ci
~~~

Wait for installation to finish and the command prompt to return, then run:

~~~sh
npm run server
~~~

The terminal should display a startup message containing `http://127.0.0.1:4173`.

### 3. Open the workspace

Open <http://127.0.0.1:4173/> in your browser. Enter the workspace and create a résumé. A fresh installation starts with an empty collection and creates its own local data directory. No account or AI service is needed.

Keep the terminal window open while using the app. The running server does not return to a command prompt; this is normal. Press `Ctrl + C` to stop it, and confirm with `Y` if Windows asks. Next time, open the same project folder and run `npm run server` again. After updating the project, run `npm ci` again before starting.

<details>
<summary>Optional: choose another port and other startup options</summary>


To use another port, run `npm run server 8080` and open <http://127.0.0.1:8080/>. Explicit flags also work: `npm run server -- --port 8080`. The standalone `--` tells npm to forward flags to the application; using a bare port avoids this separator. The existing `npm start` and `npm run preview` aliases remain available. CLI arguments override `PORT`, then the default `4173`; the valid range is 1–65535. Run `npm run server -- --help` for help.

Changing ports keeps the same data directory, but browser drafts are isolated by port: wait for autosave before switching. Do not run concurrent servers against one data directory; use separate `ZHIJIAN_DATA_DIR` values when running multiple instances.

</details>

### Choose a starting point

When creating a résumé, choose the blank preset, a clearly fictional demo, or a copy of an existing résumé. The interface and default sections are primarily Chinese; English text uses Georgia with system fallbacks.

Built-in presets are separate from your saved documents. Editing a résumé does not change the preset, and existing documents are never replaced by demo content.

<a id="first-resume"></a>

## Write your first résumé

1. **Try the demo first.** Create a résumé and select the fictional demo, or choose the blank preset when you are ready to write.
2. **Add your own experience.** Fill in the content panel, show or hide sections, and mix paragraphs with bullet points in project and internship entries.
3. **Make the important parts stand out.** Use global styles for the document, local formatting for individual words, and field layouts for order and alignment.
4. **Check saving and pagination.** Wait for the saved indicator. If needed, try two-page fitting and inspect the actual PDF through the pagination preview.
5. **Export and keep a backup.** Send the PDF and keep a JSON copy so you can edit or move the résumé later.

| Format | Use it for |
| --- | --- |
| **PDF** | Applications and printing, with A4 pagination and selectable text. |
| **JSON** | Backup and migration; preserves content, images, and editable formatting for re-import into Zhijian. |
| **HTML** | Offline viewing or sharing a standalone webpage with embedded images. Keep JSON for editing in Zhijian. |

<details>
<summary>More control: field formatting, internship logos, and pagination</summary>

Edit using the left panel or directly on the preview. Changes autosave after about 0.75 seconds of inactivity. Formatting and layouts belong to each individual résumé.

Field layouts support ordering, continuous inline text, line breaks, and right-aligned fields. Local formatting applies to whole fields or selected text. Projects and internships can mix paragraph, bullet, and numbered blocks.

Internships appear after education and before projects in the blank preset and legacy migration; the demo uses its own section order. The default heading reads “Organization　Department · Role”, with dates aligned right. Each entry can upload, replace, or remove a logo; images are included in JSON, HTML, and PDF exports. Older documents gain a hidden empty internship section, shown automatically when the first entry is added.

Two-page fitting adjusts spacing and margins first, then font size if needed. It does not rewrite or trim content. Body text generally stays at least 11 px; smaller existing text keeps its original size. If the content cannot reasonably fit exactly two pages, the original layout is kept. Already-two-page documents may have spare space redistributed. Changes can be undone.

Orange preview guides estimate document length. Green markers shown after export or fitting use actual PDF page starts. Always inspect the exported PDF when entries are long or formatting is complex.

</details>

<a id="faq"></a>

## Frequently asked questions

**Do I have to install everything again next time?**

No. Open the same project folder, run `npm run server`, and visit the displayed address. Keep the terminal running while using the app.

**Is my résumé uploaded? Can I use it offline?**

Editing, saving, and PDF generation run on your computer; the app has no cloud account or synchronization service. Initial dependency installation needs internet access. Once installed, and with Chrome or Edge available, editing and export work offline.

**Does two-page fitting always produce two pages?**

No. It adjusts typography within supported limits and checks a real PDF. If the content is too long or too short, it keeps the original layout instead of cutting content. The adjustment is undoable; check the PDF before sending it.

**How do I move to another computer?**

For one résumé, export JSON and import it into a new document on the other computer. To move the whole collection and recycle bin, stop the server and copy the complete data directory, including any separately referenced legacy images. See [Data and privacy](#data).

**Will an update erase my résumés?**

Code and user data are separate; updates do not replace existing résumés with examples. Stop the server and back up your data before updating. If you extract a fresh ZIP into another folder, migrate your data or import JSON. Run `npm ci` after updating, then restart.

**What if I delete or change something by mistake?**

Undo recent edits, restore the previous successful save, or recover a deleted résumé from the recycle bin. Permanent deletion cannot be undone in the app.

<details>
<summary>Startup or export errors: troubleshooting table</summary>

| Problem | What to do |
| --- | --- |
| `node` or `npm` is not recognized | Reopen the terminal after installation. If needed, rerun the Node.js installer and ensure npm and PATH support are enabled. |
| PowerShell blocks `npm.ps1` | Use Command Prompt (`cmd`), or run `npm.cmd ci` and `npm.cmd run server` in PowerShell. There is no need to change the execution policy. |
| Missing `package.json` or an `ENOENT` error | Open the terminal in the extracted project root containing both `package.json` and `package-lock.json`. |
| `npm ci` times out or cannot connect | Check your network connection and retry. Complete dependency installation before starting the server. |
| Port `4173` is already in use | Run `npm run server 8080` and open `http://127.0.0.1:8080/`. |
| The page will not open | Keep the server running, check its terminal for errors, and use the exact port printed in the startup message. |
| PDF export cannot find a browser | Install Chrome or Edge. For a custom installation path, set `RESUME_BROWSER_PATH` under [Configuration](#configuration) and restart the server. |

</details>

<a id="data"></a>

## Data and privacy

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

<details>
<summary>How the recycle bin works</summary>

Delete a résumé from its workspace card to move it to the recycle bin. Restoring preserves its ID, contents, styles, and existing backups. Editors opened before deletion must reload the restored version before saving.

Permanent deletion requires a separate confirmation and removes only that résumé's archived files and history. Independent exports and shared images remain untouched. There is no automatic expiry or cleanup.

The original résumé and even the final résumé can be deleted. An empty workspace can always create a new document from a public preset.

</details>

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

## Development and contribution

The app uses browser ES modules and a Node.js HTTP server without a bundler. `app/model.js` and `app/format.js` handle validation and schema migration; `app/render.js` is shared by preview and export. `scripts/store.mjs` owns persistence and recycling, while `scripts/presets.mjs` owns public presets. PDF generation and fitting live in `scripts/pdf.mjs` and `scripts/pagination.mjs`.

~~~sh
npm test
~~~

Tests use isolated temporary data. PDF tests require a supported browser. Windows with Chrome is the primary tested environment; platform fonts and browser versions can affect line wrapping and pagination. System fonts, including Georgia, are not bundled.

<details>
<summary>Project structure and screenshot maintenance</summary>

| Location | Responsibility |
| --- | --- |
| `home.html`, `app/home.*`, `app/cover.css` | Cover, workspace, recycle bin, and creation dialogs |
| `editor.html`, `app/editor.*`, `app/advanced.js` | Content editing, styles, and field layout controls |
| `app/model.js`, `app/format.js` | Validation, migration, and stable formatting keys |
| `app/render.js`, `app/icons.js`, `styles.css` | Shared résumé rendering and print styles |
| `scripts/preview.mjs`, `scripts/cli.mjs` | HTTP server and startup options |
| `scripts/store.mjs`, `scripts/presets.mjs` | Persistence, recovery, and public presets |
| `scripts/pdf.mjs`, `scripts/pagination.mjs`, `app/pagination.js` | PDF rendering and pagination |
| `assets/brand/`, `assets/readme/` | Public logo and fictional product screenshots |
| `test/` | Tests using isolated temporary data |

To refresh the README screenshots with Chrome or Edge installed:

~~~sh
node scripts/capture-readme.mjs
~~~

The script creates an isolated temporary collection from the fictional demo, captures the cover, workspace, and editor, then removes its own temporary data. It never reads your personal résumés.

</details>

### Help make Zhijian better

- **Found a problem?** Search [existing issues](https://github.com/MarkSSH/zhijian-resume/issues), then [open an issue](https://github.com/MarkSSH/zhijian-resume/issues/new) with steps, expected and actual behavior, and your OS, browser, and Node.js versions.
- **Have an idea?** Describe the task you are trying to accomplish and what gets in the way. You do not need a technical solution.
- **Want to contribute?** Improvements to wording, translations, examples, and code are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

For layout bugs, a screenshot with personal details removed or a minimal fictional JSON example makes diagnosis much easier. Do not post real contact details, photos, or unpublished research in public issues.

If Zhijian helps you, a Star helps other people discover it too.

## License and acknowledgements

Code is licensed under MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency, font and VibeResume reference notices. Personal résumés, photos and institutional logos are not granted a public license by this repository.
