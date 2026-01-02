const { app, BrowserWindow, ipcMain, dialog } = require('electron'); 
const path = require('path');
const { execFile } = require('child_process');

let extractionWindow = null;
let categoriesWindow = null;
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
// Create Categories Window
// -----------------------------
function createCategoriesWindow() {
    if (categoriesWindow) {
        categoriesWindow.focus();
        return;
    }

    // Close extraction window when opening categories
    if (extractionWindow) {
        extractionWindow.close();
        extractionWindow = null;
    }

    categoriesWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    categoriesWindow.maximize(); // optional, fills the screen
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
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
});

// -----------------------------
// Run Parser Handler
// -----------------------------
ipcMain.handle('run-parser', async (event, filePath, firstName, lastName) => {
    // IMPORTANT: In packaged apps, __dirname points inside app.asar (not executable).
    // parser.exe is shipped via extraResources, which ends up under process.resourcesPath.
    const parserName = process.platform === 'win32' ? 'parser.exe' : 'parser';
    const parserPath = app.isPackaged
        ? path.join(process.resourcesPath, parserName)
        : path.join(__dirname, parserName);

    return new Promise((resolve, reject) => {
        execFile(parserPath, [filePath, firstName, lastName], (error, stdout, stderr) => {
            if (error) return reject(stderr || error.message);
            try {
                // Store JSON in main process
                extractedData = JSON.parse(stdout);
                resolve();
            } catch (err) {
                reject('Parser output is not valid JSON: ' + err);
            }
        });
    });
});

// -----------------------------
// Expose Extracted Data to Renderer
// -----------------------------
ipcMain.handle('get-extracted-data', () => {
    return extractedData;
});

// -----------------------------
// Open Categories Page
// -----------------------------
ipcMain.on('open-categories-page', () => {
    createCategoriesWindow();
});
