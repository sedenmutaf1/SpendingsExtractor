const { ipcRenderer } = require('electron');

let selectedFile = null;
const selectedFileSpan = document.getElementById('selected-file');

document.getElementById('select-file-btn').addEventListener('click', async () => {
  selectedFile = await ipcRenderer.invoke('select-file');
  selectedFileSpan.textContent = selectedFile || 'No file selected';
});

document.getElementById('extract-btn').addEventListener('click', async () => {
  if (!selectedFile) {
    alert('Select a PDF first');
    return;
  }

  try {
    await ipcRenderer.invoke('run-parser', selectedFile);
    ipcRenderer.send('open-categories-page');
  } catch (err) {
    alert('Error running parser: ' + err);
  }
});
