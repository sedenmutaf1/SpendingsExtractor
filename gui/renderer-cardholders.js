const { ipcRenderer } = require('electron');

const cardholdersListEl = document.getElementById('cardholders-list');
const transactionsContainer = document.getElementById('transactions-container');

let extractedData = null;
let selectedCardholders = new Set();

// -----------------------------
// Load extracted JSON
// -----------------------------
async function loadData() {
  extractedData = await ipcRenderer.invoke('get-extracted-data');

  if (!extractedData || !extractedData.users) {
    cardholdersListEl.innerHTML = '<p>No cardholders found.</p>';
    return;
  }

  renderCardholders();
}

// -----------------------------
// Render cardholders list
// -----------------------------
function renderCardholders() {
  cardholdersListEl.innerHTML = '';

  extractedData.users.forEach((user, index) => {
    const row = document.createElement('div');
    row.className = 'cardholder-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `cardholder-${index}`;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedCardholders.add(index);
      } else {
        selectedCardholders.delete(index);
      }
      renderTransactions();
    });

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.innerHTML = `
      <span class="cardholder-name">${user.name}</span>
      <span class="cardholder-card">${user.card}</span>
      ${user.is_main ? '<span class="main-badge">MAIN</span>' : ''}
    `;

    row.appendChild(checkbox);
    row.appendChild(label);
    cardholdersListEl.appendChild(row);
  });
}

// -----------------------------
// Render transactions
// -----------------------------
function renderTransactions() {
  transactionsContainer.innerHTML = '';

  if (selectedCardholders.size === 0) {
    transactionsContainer.innerHTML =
      '<p class="hint">Select cardholders to see transactions.</p>';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Cardholder</th>
        <th>Amount</th>
        <th>Installment</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  selectedCardholders.forEach(index => {
    const user = extractedData.users[index];

    user.transactions.forEach(tx => {
      const tr = document.createElement('tr');

      const installmentText = tx.installment
        ? (tx.installment.is_last
            ? 'Last installment'
            : tx.installment.plan_text)
        : '-';

      tr.innerHTML = `
        <td>${tx.date}</td>
        <td>${tx.description}</td>
        <td>${user.name}</td>
        <td class="amount ${tx.sign}">
          ${tx.sign === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
        </td>
        <td>${installmentText}</td>
      `;

      tbody.appendChild(tr);
    });
  });

  transactionsContainer.appendChild(table);
}

// Init
loadData();
