const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let extractionWindow = null;
let cardholdersWindow = null;
let extractedData = null; // store JSON data from parser

// -----------------------------
// Create Extraction Window
// -----------------------------
function createExtractionWindow() {
  if (extractionWindow) {
    extractionWindow.focus();
    return;
  }

  extractionWindow = new BrowserWindow({
    width: 500,
    height: 550,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  extractionWindow.loadFile(path.join(__dirname, 'index.html'));

  extractionWindow.on('closed', () => {
    extractionWindow = null;
  });
}

// -----------------------------
// Create Cardholders Window
// -----------------------------
function createCardholdersWindow() {
  if (cardholdersWindow) {
    cardholdersWindow.focus();
    return;
  }

  // Close extraction window when opening cardholders
  if (extractionWindow) {
    extractionWindow.close();
    extractionWindow = null;
  }

  cardholdersWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  cardholdersWindow.maximize();
  cardholdersWindow.loadFile(path.join(__dirname, 'cardholders.html'));

  cardholdersWindow.on('closed', () => {
    cardholdersWindow = null;
  });
}

// -----------------------------
// App Ready
// -----------------------------
app.whenReady().then(createExtractionWindow);

// -----------------------------
// File Picker Handler
// -----------------------------
ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF files', extensions: ['pdf'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

// -----------------------------
// Run Parser Handler (package-ready)
// -----------------------------
ipcMain.handle('run-parser', async (event, pdfPath) => {
  const exeName = process.platform === 'win32' ? 'parser.exe' : 'parser';

  // DEV: <project>/release/parser.exe (+ DLLs)
  // PACKAGED: <installed>/resources/parser/parser.exe (+ DLLs)
  const parserDir = app.isPackaged
    ? path.join(process.resourcesPath, 'parser')
    : path.join(__dirname, 'release');

  const parserPath = path.join(parserDir, exeName);

  if (!fs.existsSync(parserPath)) {
    throw new Error(`Parser not found: ${parserPath}`);
  }

  return new Promise((resolve, reject) => {
    execFile(
      parserPath,
      [pdfPath],
      { cwd: parserDir, maxBuffer: 80 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) return reject(stderr || error.message);

        try {
          extractedData = JSON.parse(stdout);
          resolve();
        } catch (err) {
          reject('Parser output is not valid JSON. Ensure parser prints ONLY JSON to stdout.\n' + err);
        }
      }
    );
  });
});

// -----------------------------
// Expose Extracted Data to Renderer
// -----------------------------
ipcMain.handle('get-extracted-data', () => extractedData);

// -----------------------------
// Open Cardholders Page
// -----------------------------
ipcMain.on('open-cardholders-page', () => {
  createCardholdersWindow();
});
