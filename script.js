/* ============================================
   GearVault — Firebase-Powered Electronics Tracker
   ============================================ */

// ─── Constants ──────────────────────────────
const CONFIG_KEY = 'gearvault_firebase_config';

const CATEGORIES = [
    'Microcontroller', 'Sensor', 'Display', 'Motor / Servo',
    'Power Supply', 'Communication Module', 'Passive Component',
    'Connector / Cable', 'Tool / Instrument', 'Development Board',
    'Audio', 'LED / Lighting', 'Battery', 'IC / Chip', 'Other'
];

const CATEGORY_ICONS = {
    'Microcontroller': '🔲',
    'Sensor': '📡',
    'Display': '🖥️',
    'Motor / Servo': '⚙️',
    'Power Supply': '🔌',
    'Communication Module': '📶',
    'Passive Component': '🔩',
    'Connector / Cable': '🔗',
    'Tool / Instrument': '🔧',
    'Development Board': '💻',
    'Audio': '🔊',
    'LED / Lighting': '💡',
    'Battery': '🔋',
    'IC / Chip': '🧩',
    'Other': '📦'
};

const AVATAR_COLORS = [
    'linear-gradient(135deg, #8b5cf6, #6366f1)',
    'linear-gradient(135deg, #3b82f6, #06b6d4)',
    'linear-gradient(135deg, #10b981, #34d399)',
    'linear-gradient(135deg, #f59e0b, #f97316)',
    'linear-gradient(135deg, #ec4899, #f43f5e)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #06b6d4, #3b82f6)',
    'linear-gradient(135deg, #f97316, #f59e0b)',
];

const CATEGORY_COLORS = [
    { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
    { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' },
    { bg: 'rgba(16,185,129,0.15)', text: '#34d399' },
    { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24' },
    { bg: 'rgba(236,72,153,0.15)', text: '#f472b6' },
    { bg: 'rgba(6,182,212,0.15)', text: '#22d3ee' },
    { bg: 'rgba(244,63,94,0.15)', text: '#fb7185' },
];

// ─── App State ──────────────────────────────
let db = null;     // Firebase database reference
let appData = { members: [], items: [] };
let isConnected = false;

// ─── Firebase Setup ─────────────────────────
function getSavedConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
}

function saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
}

function parseConfigInput(text) {
    let cleaned = text.trim();

    // Handle if they pasted with "const firebaseConfig = {...}" or "var firebaseConfig = {...}"
    const match = cleaned.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (match) {
        cleaned = match[1];
    }

    // Try parsing as JSON
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // Try converting JS object literal to JSON (unquoted keys)
        try {
            // Replace unquoted keys with quoted keys
            const jsonStr = cleaned
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']');
            return JSON.parse(jsonStr);
        } catch (e2) {
            throw new Error('Invalid JSON format. Please paste the firebaseConfig object as shown in Firebase console.');
        }
    }
}

function validateConfig(config) {
    const required = ['apiKey', 'databaseURL', 'projectId'];
    const missing = required.filter(k => !config[k]);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}. Make sure you have a Realtime Database URL.`);
    }
    if (!config.databaseURL.includes('firebaseio.com') && !config.databaseURL.includes('firebasedatabase.app')) {
        throw new Error('databaseURL doesn\'t look like a valid Firebase Realtime Database URL.');
    }
    return true;
}

function initFirebase(config) {
    // If Firebase was already initialized, use existing app
    if (firebase.apps.length > 0) {
        firebase.apps.forEach(app => app.delete());
    }

    // Wait for apps to be deleted then initialize
    const app = firebase.initializeApp(config);
    db = firebase.database();
    return db;
}

function setupRealtimeListeners() {
    // Listen for members
    db.ref('members').on('value', (snapshot) => {
        const data = snapshot.val();
        appData.members = data ? Object.values(data) : [];
        renderAll();
    }, (err) => {
        console.error('Members listener error:', err);
        showToast('Error loading members: ' + err.message, 'error');
    });

    // Listen for items
    db.ref('items').on('value', (snapshot) => {
        const data = snapshot.val();
        appData.items = data ? Object.values(data) : [];
        renderAll();
    }, (err) => {
        console.error('Items listener error:', err);
        showToast('Error loading items: ' + err.message, 'error');
    });

    // Listen for connection state
    db.ref('.info/connected').on('value', (snapshot) => {
        isConnected = snapshot.val() === true;
        updateConnectionStatus();
    });
}

function updateConnectionStatus() {
    const bar = document.getElementById('connectionBar');
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');

    bar.classList.add('visible');

    if (isConnected) {
        dot.className = 'connection-dot connected';
        text.textContent = 'Connected — syncing in real-time';
    } else {
        dot.className = 'connection-dot error';
        text.textContent = 'Disconnected — trying to reconnect...';
    }
}

// ─── Firebase CRUD ──────────────────────────
async function generateId() {
    const ref = db.ref('meta/lastId');
    const result = await ref.transaction((current) => {
        return (current || 0) + 1;
    });
    return result.snapshot.val();
}

async function addMember(name) {
    const id = await generateId();
    const member = {
        id,
        name,
        addedAt: new Date().toISOString()
    };
    await db.ref(`members/${id}`).set(member);
    return member;
}

async function updateMember(memberId, newName) {
    await db.ref(`members/${memberId}/name`).set(newName);
}

async function removeMember(memberId) {
    // Remove member
    await db.ref(`members/${memberId}`).remove();
    // Remove their items
    const itemsSnapshot = await db.ref('items').orderByChild('ownerId').equalTo(memberId).once('value');
    const updates = {};
    itemsSnapshot.forEach(child => {
        updates[`items/${child.key}`] = null;
    });
    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }
}

async function addItem(itemData) {
    const id = await generateId();
    const item = {
        id,
        ...itemData,
        addedAt: new Date().toISOString()
    };
    await db.ref(`items/${id}`).set(item);
    return item;
}

async function updateItem(itemId, updates) {
    await db.ref(`items/${itemId}`).update(updates);
}

async function removeItem(itemId) {
    await db.ref(`items/${itemId}`).remove();
}

// ─── Background Particles ──────────────────
function createParticles() {
    const container = document.getElementById('bgParticles');
    const colors = ['rgba(139,92,246,0.4)', 'rgba(59,130,246,0.3)', 'rgba(236,72,153,0.25)', 'rgba(16,185,129,0.2)'];
    for (let i = 0; i < 25; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        const size = Math.random() * 4 + 2;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDuration = (Math.random() * 20 + 15) + 's';
        particle.style.animationDelay = (Math.random() * 15) + 's';
        container.appendChild(particle);
    }
}

// ─── Navigation ─────────────────────────────
function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            switchSection(section);
        });
    });
}

function switchSection(sectionName) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    const btn = document.querySelector(`.nav-btn[data-section="${sectionName}"]`);
    const section = document.getElementById('section' + capitalize(sectionName));
    if (btn) btn.classList.add('active');
    if (section) {
        section.classList.add('active');
        section.style.animation = 'none';
        section.offsetHeight;
        section.style.animation = '';
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Modal ──────────────────────────────────
function openModal(contentHTML) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    content.innerHTML = contentHTML;
    content.classList.add('anim-pop-in');
    overlay.classList.add('active');
    setTimeout(() => {
        const firstInput = content.querySelector('input, select');
        if (firstInput) firstInput.focus();
    }, 200);
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function initModal() {
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// ─── Toast ──────────────────────────────────
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };
    toast.innerHTML = `<span>${icons[type] || '✓'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Member UI Actions ──────────────────────
function showAddMemberModal() {
    openModal(`
        <h2>Add New Member</h2>
        <form id="addMemberForm">
            <div class="form-group">
                <label class="form-label" for="memberName">Name</label>
                <input type="text" class="form-input" id="memberName" placeholder="Enter friend's name" required autocomplete="off">
            </div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-primary" id="addMemberSubmit">Add Member</button>
            </div>
        </form>
    `);
    document.getElementById('addMemberForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('memberName').value.trim();
        if (!name) return;
        if (appData.members.find(m => m.name.toLowerCase() === name.toLowerCase())) {
            showToast('Member already exists', 'error');
            return;
        }
        const btn = document.getElementById('addMemberSubmit');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> Adding...';
        try {
            await addMember(name);
            closeModal();
            showToast(`${name} added to the group!`);
        } catch (err) {
            showToast('Error adding member: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Add Member';
        }
    });
}

function showEditMemberModal(memberId) {
    const member = appData.members.find(m => m.id === memberId);
    if (!member) return;
    openModal(`
        <h2>Edit Member</h2>
        <form id="editMemberForm">
            <div class="form-group">
                <label class="form-label" for="editMemberName">Name</label>
                <input type="text" class="form-input" id="editMemberName" value="${escapeHTML(member.name)}" required autocomplete="off">
            </div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-primary" id="editMemberSubmit">Save Changes</button>
            </div>
        </form>
    `);
    document.getElementById('editMemberForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('editMemberName').value.trim();
        if (!newName) return;
        if (appData.members.find(m => m.id !== memberId && m.name.toLowerCase() === newName.toLowerCase())) {
            showToast('A member with that name already exists', 'error');
            return;
        }
        const btn = document.getElementById('editMemberSubmit');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> Saving...';
        try {
            await updateMember(memberId, newName);
            closeModal();
            showToast('Member updated!');
        } catch (err) {
            showToast('Error updating member: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });
}

function deleteMember(memberId) {
    const member = appData.members.find(m => m.id === memberId);
    if (!member) return;
    const itemCount = appData.items.filter(i => i.ownerId === memberId).length;
    const itemsMsg = itemCount > 0 ? ` and their ${itemCount} item${itemCount > 1 ? 's' : ''}` : '';

    openModal(`
        <h2>Delete Member</h2>
        <p style="color: var(--text-secondary); margin-bottom: 24px; line-height: 1.6;">
            Are you sure you want to remove <strong style="color: var(--text-primary);">${escapeHTML(member.name)}</strong>${itemsMsg}? This action cannot be undone.
        </p>
        <div class="form-actions">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn-danger" id="confirmDeleteMember">Delete Member</button>
        </div>
    `);
    document.getElementById('confirmDeleteMember').addEventListener('click', async () => {
        const btn = document.getElementById('confirmDeleteMember');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> Deleting...';
        try {
            await removeMember(memberId);
            closeModal();
            showToast(`${member.name} has been removed`);
        } catch (err) {
            showToast('Error deleting member: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Delete Member';
        }
    });
}

// ─── Item UI Actions ────────────────────────
function showAddItemModal() {
    if (appData.members.length === 0) {
        showToast('Add a member first before adding items', 'info');
        switchSection('members');
        return;
    }
    const memberOptions = appData.members.map(m =>
        `<option value="${m.id}">${escapeHTML(m.name)}</option>`
    ).join('');
    const categoryOptions = CATEGORIES.map(c =>
        `<option value="${c}">${c}</option>`
    ).join('');

    openModal(`
        <h2>Add Electronics Item</h2>
        <form id="addItemForm">
            <div class="form-group">
                <label class="form-label" for="itemName">Item Name</label>
                <input type="text" class="form-input" id="itemName" placeholder="e.g. Arduino Uno, Raspberry Pi" required autocomplete="off">
            </div>
            <div class="form-group">
                <label class="form-label" for="itemCategory">Category</label>
                <select class="form-select" id="itemCategory" required>
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="itemOwner">Owner</label>
                <select class="form-select" id="itemOwner" required>
                    ${memberOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="itemQty">Quantity</label>
                <input type="number" class="form-input" id="itemQty" value="1" min="1" required>
            </div>
            <div class="form-group">
                <label class="form-label" for="itemNotes">Notes (optional)</label>
                <textarea class="form-input" id="itemNotes" placeholder="Model, specs, condition..."></textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-primary" id="addItemSubmit">Add Item</button>
            </div>
        </form>
    `);
    document.getElementById('addItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('addItemSubmit');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> Adding...';
        try {
            const itemData = {
                name: document.getElementById('itemName').value.trim(),
                category: document.getElementById('itemCategory').value,
                ownerId: parseInt(document.getElementById('itemOwner').value),
                quantity: parseInt(document.getElementById('itemQty').value) || 1,
                notes: document.getElementById('itemNotes').value.trim()
            };
            if (!itemData.name) return;
            await addItem(itemData);
            closeModal();
            showToast(`${itemData.name} added to inventory!`);
        } catch (err) {
            showToast('Error adding item: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Add Item';
        }
    });
}

function showEditItemModal(itemId) {
    const item = appData.items.find(i => i.id === itemId);
    if (!item) return;
    const memberOptions = appData.members.map(m =>
        `<option value="${m.id}" ${m.id === item.ownerId ? 'selected' : ''}>${escapeHTML(m.name)}</option>`
    ).join('');
    const categoryOptions = CATEGORIES.map(c =>
        `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`
    ).join('');

    openModal(`
        <h2>Edit Item</h2>
        <form id="editItemForm">
            <div class="form-group">
                <label class="form-label" for="editItemName">Item Name</label>
                <input type="text" class="form-input" id="editItemName" value="${escapeHTML(item.name)}" required autocomplete="off">
            </div>
            <div class="form-group">
                <label class="form-label" for="editItemCategory">Category</label>
                <select class="form-select" id="editItemCategory" required>
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="editItemOwner">Owner</label>
                <select class="form-select" id="editItemOwner" required>
                    ${memberOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="editItemQty">Quantity</label>
                <input type="number" class="form-input" id="editItemQty" value="${item.quantity}" min="1" required>
            </div>
            <div class="form-group">
                <label class="form-label" for="editItemNotes">Notes</label>
                <textarea class="form-input" id="editItemNotes">${escapeHTML(item.notes || '')}</textarea>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn-primary" id="editItemSubmit">Save Changes</button>
            </div>
        </form>
    `);
    document.getElementById('editItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('editItemSubmit');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> Saving...';
        try {
            await updateItem(itemId, {
                name: document.getElementById('editItemName').value.trim(),
                category: document.getElementById('editItemCategory').value,
                ownerId: parseInt(document.getElementById('editItemOwner').value),
                quantity: parseInt(document.getElementById('editItemQty').value) || 1,
                notes: document.getElementById('editItemNotes').value.trim()
            });
            closeModal();
            showToast('Item updated!');
        } catch (err) {
            showToast('Error updating item: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });
}

function deleteItem(itemId) {
    const item = appData.items.find(i => i.id === itemId);
    if (!item) return;
    openModal(`
        <h2>Delete Item</h2>
        <p style="color: var(--text-secondary); margin-bottom: 24px; line-height: 1.6;">
            Are you sure you want to delete <strong style="color: var(--text-primary);">${escapeHTML(item.name)}</strong>?
        </p>
        <div class="form-actions">
            <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="button" class="btn-danger" id="confirmDeleteItem">Delete Item</button>
        </div>
    `);
    document.getElementById('confirmDeleteItem').addEventListener('click', async () => {
        const btn = document.getElementById('confirmDeleteItem');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> Deleting...';
        try {
            await removeItem(itemId);
            closeModal();
            showToast(`${item.name} removed from inventory`);
        } catch (err) {
            showToast('Error deleting item: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Delete Item';
        }
    });
}

// ─── Rendering ──────────────────────────────
function renderAll() {
    renderDashboard();
    renderMembers();
    renderInventory(
        document.getElementById('filterCategory')?.value || '',
        document.getElementById('filterMember')?.value || '',
        document.getElementById('searchInput')?.value?.trim() || ''
    );
    updateFilters();
}

function renderDashboard() {
    // Stats
    document.getElementById('totalMembers').textContent = appData.members.length;
    document.getElementById('totalItems').textContent = appData.items.reduce((sum, i) => sum + (i.quantity || 1), 0);
    const uniqueCategories = [...new Set(appData.items.map(i => i.category))];
    document.getElementById('totalCategories').textContent = uniqueCategories.length;

    // Top collector
    if (appData.members.length > 0 && appData.items.length > 0) {
        const counts = {};
        appData.items.forEach(i => {
            counts[i.ownerId] = (counts[i.ownerId] || 0) + (i.quantity || 1);
        });
        const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (topId) {
            const topMember = appData.members.find(m => m.id === parseInt(topId[0]));
            document.getElementById('topOwner').textContent = topMember ? topMember.name.split(' ')[0] : '—';
        }
    } else {
        document.getElementById('topOwner').textContent = '—';
    }

    // Recent activity
    const recentContainer = document.getElementById('recentActivity');
    if (appData.items.length === 0) {
        recentContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                <p>No items added yet</p>
                <button class="btn-primary" onclick="showAddItemModal()" style="margin-top: 16px;">Add Your First Item</button>
            </div>`;
    } else {
        const recentItems = [...appData.items]
            .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
            .slice(0, 8);
        recentContainer.innerHTML = recentItems.map((item, idx) => {
            const owner = appData.members.find(m => m.id === item.ownerId);
            const time = getRelativeTime(item.addedAt);
            return `
                <div class="activity-item anim-slide-up" style="animation-delay: ${idx * 0.05}s; cursor: pointer;" onclick="showEditItemModal(${item.id})">
                    <div class="activity-dot"></div>
                    <div class="activity-text">
                        <strong>${escapeHTML(owner ? owner.name : 'Unknown')}</strong> added
                        <strong>${escapeHTML(item.name)}</strong>
                        ${item.quantity > 1 ? `(×${item.quantity})` : ''}
                    </div>
                    <span class="activity-time">${time}</span>
                </div>`;
        }).join('');
    }

    // Category breakdown
    const catContainer = document.getElementById('categoryBreakdown');
    if (uniqueCategories.length === 0) {
        catContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                <p>No categories yet</p>
                <span>Categories appear when you add electronics</span>
            </div>`;
    } else {
        const catCounts = {};
        appData.items.forEach(i => {
            catCounts[i.category] = (catCounts[i.category] || 0) + (i.quantity || 1);
        });
        const maxCount = Math.max(...Object.values(catCounts));
        const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
        catContainer.innerHTML = sortedCats.map(([cat, count]) => {
            const pct = (count / maxCount * 100).toFixed(0);
            return `
                <div class="category-bar-item">
                    <span class="category-bar-label">${CATEGORY_ICONS[cat] || '📦'} ${cat}</span>
                    <div class="category-bar-track">
                        <div class="category-bar-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="category-bar-count">${count}</span>
                </div>`;
        }).join('');
    }
}

function renderMembers() {
    const grid = document.getElementById('membersGrid');
    if (appData.members.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                <p>No members yet</p>
                <button class="btn-primary" onclick="showAddMemberModal()" style="margin-top: 16px;">Add Member</button>
            </div>`;
        return;
    }
    
    // Gamification
    const memberScores = appData.members.map(member => {
        const items = appData.items.filter(i => i.ownerId === member.id);
        const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
        return { member, items, totalQty, score: totalQty * 10 };
    });
    
    // Sort by score for ranking
    const sortedByScore = [...memberScores].sort((a, b) => b.score - a.score);
    const top3Ids = sortedByScore.slice(0, 3).filter(m => m.score > 0).map(m => m.member.id);

    grid.innerHTML = memberScores.map((data, idx) => {
        const { member, items, totalQty, score } = data;
        const initials = getInitials(member.name);
        const color = getAvatarColor(idx);

        const itemTags = items.slice(0, 6).map(i =>
            `<span class="member-item-tag">${CATEGORY_ICONS[i.category] || '📦'} ${escapeHTML(i.name)}${i.quantity > 1 ? ` <span class="qty">×${i.quantity}</span>` : ''}</span>`
        ).join('');
        const moreCount = items.length > 6 ? items.length - 6 : 0;
        
        let rankBadge = '';
        if (top3Ids[0] === member.id) rankBadge = '<span class="badge-rank" title="1st Place">🥇</span>';
        else if (top3Ids[1] === member.id) rankBadge = '<span class="badge-rank" title="2nd Place">🥈</span>';
        else if (top3Ids[2] === member.id) rankBadge = '<span class="badge-rank" title="3rd Place">🥉</span>';

        return `
            <div class="member-card anim-slide-up" style="animation-delay: ${idx * 0.05}s">
                <div class="member-card-actions">
                    <button class="icon-btn" onclick="showEditMemberModal(${member.id})" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="icon-btn danger" onclick="deleteMember(${member.id})" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
                <div class="member-card-top">
                    <div class="member-avatar" style="background: ${color}">${initials}</div>
                    <div>
                        <div class="member-name">${rankBadge}${escapeHTML(member.name)}</div>
                        <div class="member-item-count">${totalQty} item${totalQty !== 1 ? 's' : ''} <span class="score-tag">${score} pts</span></div>
                    </div>
                </div>
                <div class="member-items-list">
                    ${itemTags}
                    ${moreCount > 0 ? `<span class="member-item-tag" style="color: var(--text-tertiary);">+${moreCount} more</span>` : ''}
                    ${items.length === 0 ? '<span style="font-size: 0.8rem; color: var(--text-tertiary);">No items yet</span>' : ''}
                </div>
            </div>`;
    }).join('');
}

function renderInventory(filterCat = '', filterMember = '', searchQuery = '') {
    const body = document.getElementById('inventoryBody');
    const emptyState = document.getElementById('inventoryEmpty');
    const tableWrapper = document.getElementById('inventoryTableWrapper');

    let filteredItems = [...appData.items];

    if (filterCat) {
        filteredItems = filteredItems.filter(i => i.category === filterCat);
    }
    if (filterMember) {
        filteredItems = filteredItems.filter(i => i.ownerId === parseInt(filterMember));
    }
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredItems = filteredItems.filter(i => {
            const owner = appData.members.find(m => m.id === i.ownerId);
            return i.name.toLowerCase().includes(q) ||
                   i.category.toLowerCase().includes(q) ||
                   (owner && owner.name.toLowerCase().includes(q)) ||
                   (i.notes && i.notes.toLowerCase().includes(q));
        });
    }

    filteredItems.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    if (filteredItems.length === 0) {
        tableWrapper.style.display = 'none';
        emptyState.style.display = 'flex';
    } else {
        tableWrapper.style.display = '';
        emptyState.style.display = 'none';
        body.innerHTML = filteredItems.map(item => {
            const owner = appData.members.find(m => m.id === item.ownerId);
            const ownerIdx = appData.members.indexOf(owner);
            const catColor = CATEGORY_COLORS[CATEGORIES.indexOf(item.category) % CATEGORY_COLORS.length] || CATEGORY_COLORS[0];
            const icon = CATEGORY_ICONS[item.category] || '📦';

            return `
                <tr>
                    <td>
                        <div class="item-name-cell">
                            <div class="item-icon" style="background: ${catColor.bg};">${icon}</div>
                            <span>${escapeHTML(item.name)}</span>
                        </div>
                    </td>
                    <td>
                        <span class="category-badge" style="background: ${catColor.bg}; color: ${catColor.text};">
                            ${item.category}
                        </span>
                    </td>
                    <td>
                        <div class="owner-cell">
                            <div class="owner-avatar-sm" style="background: ${owner ? getAvatarColor(ownerIdx) : '#555'}">${owner ? getInitials(owner.name) : '?'}</div>
                            <span>${owner ? escapeHTML(owner.name) : 'Unknown'}</span>
                        </div>
                    </td>
                    <td><span class="qty-badge">${item.quantity || 1}</span></td>
                    <td><span class="notes-cell">${item.notes ? escapeHTML(item.notes) : '—'}</span></td>
                    <td>
                        <div class="actions-cell">
                            <button class="icon-btn" onclick="showEditItemModal(${item.id})" title="Edit">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="icon-btn danger" onclick="deleteItem(${item.id})" title="Delete">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }
}

function updateFilters() {
    const catSelect = document.getElementById('filterCategory');
    const memberSelect = document.getElementById('filterMember');
    if (!catSelect || !memberSelect) return;

    const currentCat = catSelect.value;
    const currentMember = memberSelect.value;

    const usedCategories = [...new Set(appData.items.map(i => i.category))].sort();
    catSelect.innerHTML = '<option value="">All Categories</option>' +
        usedCategories.map(c => `<option value="${c}" ${c === currentCat ? 'selected' : ''}>${c}</option>`).join('');

    memberSelect.innerHTML = '<option value="">All Members</option>' +
        appData.members.map(m => `<option value="${m.id}" ${m.id.toString() === currentMember ? 'selected' : ''}>${escapeHTML(m.name)}</option>`).join('');
}

// ─── Search ─────────────────────────────────
function initSearch() {
    const input = document.getElementById('searchInput');
    let debounce;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const query = input.value.trim();
            if (query) {
                switchSection('inventory');
            }
            renderInventory(
                document.getElementById('filterCategory').value,
                document.getElementById('filterMember').value,
                query
            );
        }, 250);
    });
}

// ─── Filter Handlers ────────────────────────
function initFilters() {
    document.getElementById('filterCategory').addEventListener('change', applyFilters);
    document.getElementById('filterMember').addEventListener('change', applyFilters);
}

function applyFilters() {
    renderInventory(
        document.getElementById('filterCategory').value,
        document.getElementById('filterMember').value,
        document.getElementById('searchInput').value.trim()
    );
}

// ─── Settings ───────────────────────────────
function showSettingsModal() {
    openModal(`
        <h2>Settings</h2>
        <div style="margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <div class="connection-dot ${isConnected ? 'connected' : 'error'}" style="position:static;"></div>
                <span style="font-size: 0.85rem; color: var(--text-secondary);">${isConnected ? 'Connected to Firebase' : 'Disconnected'}</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 4px;">
                Project: <code style="background: var(--bg-glass); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-purple); border: 1px solid var(--border);">${getSavedConfig()?.projectId || 'unknown'}</code>
            </p>
            <p style="font-size: 0.8rem; color: var(--text-tertiary);">
                Members: <strong style="color: var(--text-primary);">${appData.members.length}</strong> · Items: <strong style="color: var(--text-primary);">${appData.items.length}</strong>
            </p>
        </div>
        <div class="form-actions" style="flex-direction: column;">
            <button type="button" class="btn-danger" id="resetConfigBtn" style="width:100%; justify-content: center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                Reset Firebase Connection
            </button>
            <button type="button" class="btn-secondary" onclick="closeModal()" style="width:100%; justify-content: center;">Close</button>
        </div>
    `);
    document.getElementById('resetConfigBtn').addEventListener('click', () => {
        if (confirm('This will disconnect from Firebase. You\'ll need to re-enter your config. Continue?')) {
            clearConfig();
            location.reload();
        }
    });
}

// ─── Buttons ────────────────────────────────
function initButtons() {
    document.getElementById('addMemberBtn').addEventListener('click', showAddMemberModal);
    document.getElementById('addItemBtn').addEventListener('click', showAddItemModal);
    document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
    const fab = document.getElementById('fabAdd');
    if (fab) fab.addEventListener('click', showAddItemModal);
}

// ─── Setup Wizard ───────────────────────────
function initSetupWizard() {
    const overlay = document.getElementById('setupOverlay');
    const connectBtn = document.getElementById('setupConnectBtn');
    const configInput = document.getElementById('firebaseConfigInput');
    const errorEl = document.getElementById('setupError');

    // Check if config already exists
    const savedConfig = getSavedConfig();
    if (savedConfig) {
        overlay.classList.add('hidden');
        connectToFirebase(savedConfig);
        return;
    }

    connectBtn.addEventListener('click', async () => {
        errorEl.textContent = '';
        const text = configInput.value.trim();
        if (!text) {
            errorEl.textContent = 'Please paste your Firebase config.';
            return;
        }

        try {
            const config = parseConfigInput(text);
            validateConfig(config);

            connectBtn.disabled = true;
            connectBtn.innerHTML = '<div class="loading-spinner"></div> Connecting...';

            await connectToFirebase(config);
            saveConfig(config);

            overlay.classList.add('hidden');
            showToast('Connected to Firebase! 🎉');
        } catch (err) {
            errorEl.textContent = err.message;
            connectBtn.disabled = false;
            connectBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg> Connect & Start`;
        }
    });
}

async function connectToFirebase(config) {
    try {
        initFirebase(config);

        // Test connection by reading a small value
        await db.ref('meta').once('value');

        setupRealtimeListeners();
        isConnected = true;
        updateConnectionStatus();
    } catch (err) {
        isConnected = false;
        updateConnectionStatus();
        throw new Error('Failed to connect: ' + err.message);
    }
}

// ─── Utility ────────────────────────────────
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(index) {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getRelativeTime(isoStr) {
    const now = new Date();
    const date = new Date(isoStr);
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
}

// ─── Initialize ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    initNav();
    initModal();
    initSearch();
    initFilters();
    initButtons();
    initSetupWizard();
});
