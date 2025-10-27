// Wait for the page to load
document.addEventListener('DOMContentLoaded', () => {

    // Get all the elements we need
    const nameInput = document.getElementById('name-input');
    const surnameInput = document.getElementById('surname-input');
    const fileSelectBtn = document.getElementById('file-select-btn');
    const pdfFileInput = document.getElementById('pdf-file-input');
    const fileNameDisplay = document.getElementById('file-name');
    const startBtn = document.getElementById('start-btn');
    
    let selectedFile; // Variable to store the selected file object

    // --- File Input Logic ---
    // When the user clicks our styled "Choose File" button...
    fileSelectBtn.addEventListener('click', () => {
        pdfFileInput.click(); // ...trigger the hidden file input
    });

    // When the user selects a file in the hidden input...
    pdfFileInput.addEventListener('change', (event) => {
        // Get the selected file
        selectedFile = event.target.files[0];
        
        if (selectedFile) {
            // Display the file name
            fileNameDisplay.textContent = selectedFile.name;
        } else {
            fileNameDisplay.textContent = 'No file selected...';
        }
    });

    // --- Start Button Logic ---
    startBtn.addEventListener('click', () => {
        const firstName = nameInput.value;
        const lastName = surnameInput.value;

        // --- Validation ---
        if (!firstName) {
            alert('Please enter your first name.');
            return;
        }
        if (!lastName) {
            alert('Please enter your last name.');
            return;
        }
        if (!selectedFile) {
            alert('Please select a PDF file.');
            return;
        }
        
        // --- This is where you will call your C++ program ---
        
        // 1. Get the file path
        //    NOTE: In Tauri/Electron, `selectedFile.path` gives you the *actual* path
        //    on the user's computer, not just the name.
        const filePath = selectedFile.path;

        console.log('--- Processing ---');
        console.log('First Name:', firstName);
        console.log('Last Name:', lastName);
        console.log('File Path:', filePath);
        
        alert('Processing started! (Check the console)');

        /*
        // --- TAURI: How you will call your C++ code ---
        // (This is a simplified example for later)
        
        const { invoke } = window.__TAURI__.tauri;
        const { Command } = window.__TAURI__.shell;

        // 1. Setup the command
        const sidecar = Command.sidecar('path/to/your/parser');
        
        // 2. Run the command with arguments
        sidecar.execute([filePath, firstName, lastName])
            .then(() => {
                console.log('C++ program finished!');
                // Now you would read the "_extracted.txt" file
                // and show the results on a new page.
            })
            .catch((error) => {
                console.error('C++ program failed:', error);
                alert('Error: Could not process the file.');
            });
        */
    });
});