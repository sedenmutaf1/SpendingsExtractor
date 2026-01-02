const { ipcRenderer } = require('electron');

let selectedFile = null;
const selectedFileSpan = document.getElementById('selected-file');

// ------------------------
// Select file button
// ------------------------
document.getElementById('select-file-btn').addEventListener('click', async () => {
    selectedFile = await ipcRenderer.invoke('select-file');
    selectedFileSpan.textContent = selectedFile || 'No file selected';
});

// ------------------------
// Extract payments button
// ------------------------
document.getElementById('extract-btn').addEventListener('click', async () => {
    if (!selectedFile) {
        alert('Select a file first');
        return;
    }

    const firstName = document.getElementById('name-input').value.trim();
    const lastName = document.getElementById('surname-input').value.trim();

    if (!firstName || !lastName) {
        alert('Enter first and last name');
        return;
    }

    try {
        // Run parser and store JSON in main process
        await ipcRenderer.invoke('run-parser', selectedFile, firstName, lastName);

        // Open categories page
        ipcRenderer.send('open-categories-page');
    } catch (err) {
        alert('Error running parser: ' + err);
    }
});
