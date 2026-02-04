const { ipcRenderer } = require('electron');

const paymentsContainer = document.getElementById('payments-container');
const totalDisplay = document.getElementById('total-display');
const categoriesContainer = document.getElementById('categories-container');

const modalOverlay = document.getElementById('category-modal');
const modalContentContainer = document.getElementById('modal-category-container');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Sidebar
const sidebar = document.getElementById('cardholders-sidebar');
const toggleSidebarBtn = document.getElementById('toggle-cardholders-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const sidebarList = document.getElementById('sidebar-cardholders-list');
const applySelectionBtn = document.getElementById('apply-selection-btn');
const selectedChipsEl = document.getElementById('selected-chips');

let payments = [];
let categories = [];
let categoryCounter = 0;

let rawData = null;
let sidebarSelected = new Set();

// ------------------------
// Load raw users into sidebar
// ------------------------
async function loadSidebarCardholders() {
  rawData = await ipcRenderer.invoke('get-raw-extracted-data');
  const selected = await ipcRenderer.invoke('get-selected-users');

  if (!rawData || !rawData.users) rawData = { users: [] };

  // ✅ Default = ALL selected (so default "all transactions" matches UI)
  // If main process returns an empty/invalid selection, we treat it as "no saved filter"
  // and select everyone in the sidebar UI.
  const saved = Array.isArray(selected) ? selected : null;

  sidebarSelected =
    saved && saved.length > 0
      ? new Set(saved)
      : new Set(rawData.users.map((_, idx) => idx));

  renderSidebarCardholders();
  renderSelectedChips();
}

function renderSidebarCardholders() {
  sidebarList.innerHTML = '';

  if (!rawData || !rawData.users || rawData.users.length === 0) {
    sidebarList.innerHTML = '<div class="sidebar-empty">No cardholders found.</div>';
    return;
  }

  rawData.users.forEach((u, idx) => {
    const row = document.createElement('div');
    row.className = 'sidebar-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = sidebarSelected.has(idx);

    cb.addEventListener('change', () => {
      if (cb.checked) sidebarSelected.add(idx);
      else sidebarSelected.delete(idx);

      renderSelectedChips();
      // NOTE: You currently re-load payments only when Apply is clicked.
      // Keeping that behavior as-is (no reset while user is still picking).
    });

    const info = document.createElement('div');
    info.className = 'sidebar-row-info';
    info.innerHTML = `
      <div class="sidebar-name">
        ${u.name} ${u.is_main ? '<span class="badge-main">MAIN</span>' : ''}
      </div>
      <div class="sidebar-card">${u.card}</div>
    `;

    row.appendChild(cb);
    row.appendChild(info);
    sidebarList.appendChild(row);
  });
}

function renderSelectedChips() {
  selectedChipsEl.innerHTML = '';
  if (!rawData || !rawData.users) return;

  const idxs = [...sidebarSelected];

  // ✅ Empty selection means NONE selected (not "all")
  if (idxs.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'chip chip-muted';
    chip.textContent = 'No cardholders selected';
    selectedChipsEl.appendChild(chip);
    return;
  }

  idxs.forEach(i => {
    const u = rawData.users[i];
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = u ? u.name : `User ${i}`;
    selectedChipsEl.appendChild(chip);
  });
}

// ------------------------
// Load payments (OLD format) filtered by selection
// ------------------------
async function loadPayments() {
  const data = await ipcRenderer.invoke('get-categories-data');

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

  const scrollContainer = document.createElement('div');
  scrollContainer.classList.add('category-scroll');
  scrollContainer.style.maxHeight = '200px';
  scrollContainer.style.overflowY = 'auto';

  const itemsContainer = document.createElement('div');
  itemsContainer.classList.add('category-items');
  itemsContainer.style.display = 'flex';
  itemsContainer.style.flexDirection = 'column';

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

  const subtotal = document.createElement('div');
  subtotal.classList.add('subtotal');
  subtotal.textContent = 'Subtotal: 0.00';

  catDiv.appendChild(title);
  catDiv.appendChild(scrollContainer);
  catDiv.appendChild(subtotal);

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

function updateCategorySubtotal(cat) {
  cat.subtotal = cat.payments.reduce((sum, p) => sum + p.amount, 0);
}

// Drop back to payments list
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

  const originalCatDiv = categoriesContainer.querySelector(`.category[data-id="${cat.id}"]`);
  if (!originalCatDiv) return;

  const catDiv = originalCatDiv.cloneNode(true);
  catDiv.style.width = '97%';
  catDiv.style.maxWidth = '97%';
  catDiv.style.height = '100%';
  catDiv.querySelector('.category-scroll').style.maxHeight = '100%';
  modalContentContainer.appendChild(catDiv);

   const modalBtn = catDiv.querySelector('.zoom-btn');
  if (modalBtn) {
    modalBtn.textContent = '✕';
    modalBtn.title = 'Close';
    modalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      modalOverlay.classList.remove('open');
    });
  }

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

  modalOverlay.style.display = '';
  modalOverlay.classList.add('open');
}

modalCloseBtn.addEventListener('click', () => {
  modalOverlay.classList.remove('open');
});

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('open');
});

// ------------------------
// Sidebar open/close + apply
// ------------------------
function openSidebar() { sidebar.classList.remove('sidebar-closed'); }
function closeSidebar() { sidebar.classList.add('sidebar-closed'); }

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.contains('sidebar-closed') ? openSidebar() : closeSidebar();
});
closeSidebarBtn.addEventListener('click', closeSidebar);

applySelectionBtn.addEventListener('click', async () => {
  // ✅ Empty means NONE selected (block)
  if (sidebarSelected.size === 0) {
    alert('Please select at least one cardholder.');
    return;
  }

  const ok = confirm('Applying selection will reset current categorization. Continue?');
  if (!ok) return;

  await ipcRenderer.invoke('set-selected-users', Array.from(sidebarSelected));

  // Reset categorization state
  payments = [];
  categories = [];
  categoryCounter = 0;
  categoriesContainer.innerHTML = '';

  await loadSidebarCardholders();
  await loadPayments();
  closeSidebar();
});

// ------------------------
// Init
// ------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebarCardholders();
  await loadPayments();
});
