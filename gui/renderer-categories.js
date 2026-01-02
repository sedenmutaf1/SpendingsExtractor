const { ipcRenderer } = require('electron');

const paymentsContainer = document.getElementById('payments-container');
const totalDisplay = document.getElementById('total-display');
const categoriesContainer = document.getElementById('categories-container');

const modalOverlay = document.getElementById('category-modal');
const modalContentContainer = document.getElementById('modal-category-container');
const modalCloseBtn = document.getElementById('modal-close-btn');

let payments = [];
let categories = [];
let categoryCounter = 0;

// ------------------------
// Load payments
// ------------------------
async function loadPayments() {
    const data = await ipcRenderer.invoke('get-extracted-data');
    if (!data || !data.payments || data.payments.length === 0) {
        paymentsContainer.textContent = 'No extracted payments found.';
        totalDisplay.textContent = 'Total: 0.00';
        return;
    }
    payments = data.payments.map((p, i) => ({ ...p, id: i }));
    totalDisplay.textContent = `Total: ${data.total.toFixed(2)}`;
    renderPayments();
}

// ------------------------
// Render payments list
// ------------------------
function renderPayments() {
    paymentsContainer.innerHTML = '';
    const header = document.createElement('div');
    header.classList.add('payment-item');
    header.style.fontWeight = 'bold';
    header.style.backgroundColor = '#e0e8f5';
    ['Date', 'Description', 'Amount'].forEach(text => {
        const span = document.createElement('span');
        span.textContent = text;
        header.appendChild(span);
    });
    paymentsContainer.appendChild(header);

    payments.forEach((p) => {
        const div = createPaymentDiv(p);
        div.draggable = true;
        div.dataset.source = 'payments';
        div.dataset.id = p.id;

        div.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                source: 'payments',
                paymentId: p.id
            }));
        });

        paymentsContainer.appendChild(div);
    });
}

// ------------------------
// Create payment div
// ------------------------
function createPaymentDiv(payment) {
    const div = document.createElement('div');
    div.classList.add('payment-item');

    const dateCol = document.createElement('span');
    dateCol.textContent = payment.date;
    const descCol = document.createElement('span');
    descCol.textContent = payment.description;
    const amtCol = document.createElement('span');
    amtCol.textContent = payment.amount.toFixed(2);

    div.appendChild(dateCol);
    div.appendChild(descCol);
    div.appendChild(amtCol);

    return div;
}

// ------------------------
// Add category
// ------------------------
document.getElementById('add-category-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('new-category-input');
    const categoryName = nameInput.value.trim();
    if (!categoryName) return;

    const categoryId = `cat-${categoryCounter++}`;
    const cat = { id: categoryId, name: categoryName, payments: [], subtotal: 0 };
    categories.push(cat);

    createCategoryDiv(cat);
    nameInput.value = '';
});

// ------------------------
// Create category DOM
// ------------------------
function createCategoryDiv(cat) {
    const catDiv = document.createElement('div');
    catDiv.classList.add('category');
    catDiv.dataset.id = cat.id;

    // Title + zoom button
    const title = document.createElement('div');
    title.classList.add('category-title');
    title.textContent = cat.name;

    const zoomBtn = document.createElement('button');
    zoomBtn.textContent = '🔍';
    zoomBtn.classList.add('zoom-btn');
    title.appendChild(zoomBtn);

    zoomBtn.addEventListener('click', () => {
        openCategoryModal(cat.id);
    });

    // Scrollable container
    const scrollContainer = document.createElement('div');
    scrollContainer.classList.add('category-scroll');
    scrollContainer.style.maxHeight = '200px';
    scrollContainer.style.overflowY = 'auto';

    const itemsContainer = document.createElement('div');
    itemsContainer.classList.add('category-items');
    itemsContainer.style.display = 'flex';
    itemsContainer.style.flexDirection = 'column';

    // Header row
    const header = document.createElement('div');
    header.classList.add('payment-item');
    header.style.fontWeight = 'bold';
    header.style.backgroundColor = '#f0f4fa';
    ['Date', 'Description', 'Amount'].forEach(text => {
        const span = document.createElement('span');
        span.textContent = text;
        header.appendChild(span);
    });
    itemsContainer.appendChild(header);

    scrollContainer.appendChild(itemsContainer);

    // Subtotal
    const subtotal = document.createElement('div');
    subtotal.classList.add('subtotal');
    subtotal.textContent = 'Subtotal: 0.00';

    catDiv.appendChild(title);
    catDiv.appendChild(scrollContainer);
    catDiv.appendChild(subtotal);

    // Allow drop
    catDiv.addEventListener('dragover', (e) => e.preventDefault());
    catDiv.addEventListener('drop', (e) => {
        e.preventDefault();
        handleDrop(e, cat.id);
    });

    categoriesContainer.appendChild(catDiv);
}

// ------------------------
// Drop handler
// ------------------------
function handleDrop(e, targetCategoryId = null) {
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    let payment;

    if (data.source === 'payments') {
        const index = payments.findIndex(p => p.id === data.paymentId);
        if (index === -1) return;
        payment = payments.splice(index, 1)[0];
        renderPayments();
    } else if (data.source === 'category') {
        const sourceCat = categories.find(c => c.id === data.categoryId);
        if (!sourceCat) return;
        const index = sourceCat.payments.findIndex(p => p.id === data.paymentId);
        if (index === -1) return;
        payment = sourceCat.payments.splice(index, 1)[0];
        updateCategorySubtotal(sourceCat);
        renderCategory(sourceCat);
    }

    if (targetCategoryId) {
        const targetCat = categories.find(c => c.id === targetCategoryId);
        targetCat.payments.push(payment);
        updateCategorySubtotal(targetCat);
        renderCategory(targetCat);
    } else {
        payments.push(payment);
        renderPayments();
    }
}

// ------------------------
// Render category
// ------------------------
function renderCategory(cat) {
    const catDiv = categoriesContainer.querySelector(`.category[data-id="${cat.id}"]`);
    if (!catDiv) return;
    const itemsContainer = catDiv.querySelector('.category-items');
    const subtotalDiv = catDiv.querySelector('.subtotal');

    const header = itemsContainer.querySelector('.payment-item');
    itemsContainer.innerHTML = '';
    if (header) itemsContainer.appendChild(header);

    cat.payments.forEach(p => {
        const div = createPaymentDiv(p);
        div.draggable = true;
        div.dataset.source = 'category';
        div.dataset.categoryId = cat.id;
        div.dataset.id = p.id;

        div.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                source: 'category',
                categoryId: cat.id,
                paymentId: p.id
            }));
        });

        itemsContainer.appendChild(div);
    });

    subtotalDiv.textContent = `Subtotal: ${cat.subtotal.toFixed(2)}`;
}

// ------------------------
// Update subtotal
// ------------------------
function updateCategorySubtotal(cat) {
    cat.subtotal = cat.payments.reduce((sum, p) => sum + p.amount, 0);
}

// ------------------------
// Enable drop to payments container
// ------------------------
paymentsContainer.addEventListener('dragover', (e) => e.preventDefault());
paymentsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    handleDrop(e, null);
});

// ------------------------
// Modal functions
// ------------------------
function openCategoryModal(categoryId) {
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return;

    modalContentContainer.innerHTML = '';

    // Clone the existing category node to avoid duplicating it in the main view
    const originalCatDiv = categoriesContainer.querySelector(`.category[data-id="${cat.id}"]`);
    if (!originalCatDiv) return;

    const catDiv = originalCatDiv.cloneNode(true);
    catDiv.style.width = '97%';
    catDiv.style.maxWidth = '97%';
    catDiv.style.height = '100%';
    catDiv.querySelector('.category-scroll').style.maxHeight = '100%'; 
    modalContentContainer.appendChild(catDiv);

    // Fix drag listeners for cloned payments
    catDiv.querySelectorAll('.payment-item').forEach(item => {
        const paymentId = parseInt(item.dataset.id);
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                source: 'category',
                categoryId: cat.id,
                paymentId
            }));
        });
    });

    modalOverlay.style.display = 'flex';
}

modalCloseBtn.addEventListener('click', () => {
    modalOverlay.style.display = 'none';
});

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.style.display = 'none';
});

// ------------------------
// Initialize
// ------------------------
document.addEventListener('DOMContentLoaded', loadPayments);
