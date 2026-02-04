const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let extractionWindow = null;
let categoriesWindow = null;

let extractedData = null;         // RAW parser JSON
let selectedUserIndexes = [];     // which users are selected

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
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  extractionWindow.loadFile(path.join(__dirname, 'index.html'));
  extractionWindow.on('closed', () => (extractionWindow = null));
}

// -----------------------------
// Create Categories Window (single page after index)
// -----------------------------
function createCategoriesWindow() {
  if (categoriesWindow) {
    categoriesWindow.focus();
    return;
  }

  if (extractionWindow) {
    extractionWindow.close();
    extractionWindow = null;
  }

  categoriesWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  categoriesWindow.maximize();
  categoriesWindow.loadFile(path.join(__dirname, 'categories.html'));

  categoriesWindow.on('closed', () => {
    categoriesWindow = null;
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
          selectedUserIndexes = []; // reset selection
          resolve();
        } catch (err) {
          reject('Parser output is not valid JSON. Ensure parser prints ONLY JSON to stdout.\n' + err);
        }
      }
    );
  });
});

// -----------------------------
// Open Categories Page (single page)
// -----------------------------
ipcMain.on('open-categories-page', () => {
  createCategoriesWindow();
});

// -----------------------------
// RAW extracted data (for sidebar)
// -----------------------------
ipcMain.handle('get-raw-extracted-data', () => extractedData);

// -----------------------------
// Selection state
// -----------------------------
ipcMain.handle('set-selected-users', (event, indexes) => {
  selectedUserIndexes = Array.isArray(indexes) ? indexes : [];
});

ipcMain.handle('get-selected-users', () => selectedUserIndexes);

// -----------------------------
// OLD-FORMAT data for categories list: { payments, total }
// (filtered by selection; if none selected => all users)
// -----------------------------
ipcMain.handle('get-categories-data', () => {
  if (!extractedData || !extractedData.users) return { payments: [], total: 0 };

  const idxs =
    selectedUserIndexes && selectedUserIndexes.length > 0
      ? selectedUserIndexes
      : extractedData.users.map((_, i) => i);

  const payments = [];
  let total = 0;

  idxs.forEach(idx => {
    const user = extractedData.users[idx];
    if (!user || !user.transactions) return;

    user.transactions.forEach(tx => {
      if (tx.sign === 'credit') return;

      payments.push({
        date: tx.date,
        description: `${tx.description} (${user.name})`,
        amount: tx.amount
      });

      total += tx.amount;
    });
  });

  return { payments, total };
});
