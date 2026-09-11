// ===== 配置：替换成你的 Worker URL =====
const API_BASE = 'https://word-cd1.你的子域.workers.dev';

const TOKEN_KEY = 'flashcard_token';
let token = localStorage.getItem(TOKEN_KEY) || '';
let username = '';

let wordList = [];
let currentIndex = 0;
let currentLevel = 'primary';

// ===== DOM =====
const authPage = document.getElementById('authPage');
const mainPage = document.getElementById('mainPage');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const welcome = document.getElementById('welcome');
const logoutBtn = document.getElementById('logoutBtn');

const card = document.getElementById('flashcard');
const wordEl = document.getElementById('word');
const phoneticEl = document.getElementById('phonetic');
const definitionEl = document.getElementById('definition');
const exampleEl = document.getElementById('example');
const levelSelect = document.getElementById('levelSelect');
const wordCount = document.getElementById('wordCount');

let authMode = 'login';

// ===== 请求封装 =====
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
}

// ===== 认证页交互 =====
loginTab.addEventListener('click', () => setAuthMode('login'));
registerTab.addEventListener('click', () => setAuthMode('register'));

function setAuthMode(mode) {
    authMode = mode;
    loginTab.classList.toggle('active', mode === 'login');
    registerTab.classList.toggle('active', mode === 'register');
    authSubmitBtn.textContent = mode === 'login' ? '登录' : '注册';
    authPassword.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    authError.textContent = '';
}

authSubmitBtn.addEventListener('click', async () => {
    const u = authUsername.value.trim();
    const p = authPassword.value;
    if (!u || !p) {
        authError.textContent = '请输入用户名和密码';
        return;
    }
    authSubmitBtn.disabled = true;
    authError.textContent = '';
    try {
        const data = await api('/' + authMode, {
            method: 'POST',
            body: JSON.stringify({ username: u, password: p }),
        });
        token = data.token;
        username = data.username;
        localStorage.setItem(TOKEN_KEY, token);
        authPassword.value = '';
        enterMain();
    } catch (e) {
        authError.textContent = e.message;
    } finally {
        authSubmitBtn.disabled = false;
    }
});

authPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authSubmitBtn.click();
});

// ===== 主界面 =====
function enterMain() {
    authPage.style.display = 'none';
    mainPage.style.display = 'block';
    welcome.textContent = `你好，${username}`;
    loadLevel(levelSelect.value);
}

function showAuth() {
    authPage.style.display = 'flex';
    mainPage.style.display = 'none';
    setAuthMode('login');
}

logoutBtn.addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch {}
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    showAuth();
});

// ===== 渲染卡片 =====
function renderCard() {
    if (wordList.length === 0) {
        wordEl.textContent = '暂无单词';
        phoneticEl.textContent = '';
        definitionEl.textContent = '该词库暂时为空，可点击下方批量导入';
        exampleEl.textContent = '';
        return;
    }
    const item = wordList[currentIndex];
    wordEl.textContent = item.word;
    phoneticEl.textContent = item.phonetic || '';
    definitionEl.textContent = item.definition || '';
    exampleEl.textContent = item.example || '';
    card.classList.remove('flipped');
}

async function loadLevel(level) {
    currentLevel = level;
    currentIndex = 0;
    wordEl.textContent = '加载中...';
    phoneticEl.textContent = '';
    definitionEl.textContent = '';
    exampleEl.textContent = '';
    wordCount.textContent = '';

    try {
        const data = await api(`/words?level=${encodeURIComponent(level)}`);
        wordList = data;
        wordCount.textContent = `共 ${wordList.length} 个单词`;
        renderCard();
    } catch (e) {
        if (String(e.message).includes('未登录')) {
            localStorage.removeItem(TOKEN_KEY);
            token = '';
            showAuth();
            return;
        }
        wordList = [];
        wordEl.textContent = '加载失败';
        definitionEl.textContent = e.message;
    }
}

// ===== 翻卡与切换 =====
document.getElementById('flipBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    card.classList.toggle('flipped');
});
card.addEventListener('click', () => {
    card.classList.toggle('flipped');
});
document.getElementById('nextBtn').addEventListener('click', () => {
    if (wordList.length === 0) return;
    currentIndex = (currentIndex + 1) % wordList.length;
    renderCard();
});
document.getElementById('prevBtn').addEventListener('click', () => {
    if (wordList.length === 0) return;
    currentIndex = (currentIndex - 1 + wordList.length) % wordList.length;
    renderCard();
});
levelSelect.addEventListener('change', (e) => loadLevel(e.target.value));

// ===== 批量导入 =====
const importModal = document.getElementById('importModal');
const showImportBtn = document.getElementById('showImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const submitImportBtn = document.getElementById('submitImportBtn');
const importLevel = document.getElementById('importLevel');
const importText = document.getElementById('importText');
const importResult = document.getElementById('importResult');

showImportBtn.addEventListener('click', () => {
    importLevel.value = currentLevel;
    importResult.textContent = '';
    importResult.className = 'import-result';
    importModal.classList.add('show');
});
cancelImportBtn.addEventListener('click', () => importModal.classList.remove('show'));
importModal.addEventListener('click', (e) => {
    if (e.target === importModal) importModal.classList.remove('show');
});

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
            result.push(current); current = '';
        } else current += c;
    }
    result.push(current);
    return result.map(s => s.trim());
}

function parseImportText(text) {
    text = text.trim();
    if (!text) throw new Error('内容为空');
    if (text.startsWith('[')) {
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error('JSON 必须是数组');
        return arr.map(item => ({
            word: (item.word || '').trim(),
            phonetic: (item.phonetic || '').trim(),
            definition: (item.definition || '').trim(),
            example: (item.example || '').trim(),
        }));
    }
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const items = [];
    for (const line of lines) {
        if (/^word\s*,\s*phonetic/i.test(line)) continue;
        const parts = parseCSVLine(line);
        if (parts.length < 2) continue;
        items.push({
            word: parts[0] || '',
            phonetic: parts[1] || '',
            definition: parts[2] || '',
            example: parts[3] || '',
        });
    }
    return items;
}

submitImportBtn.addEventListener('click', async () => {
    let items;
    try {
        items = parseImportText(importText.value);
    } catch (err) {
        importResult.textContent = '解析失败：' + err.message;
        importResult.className = 'import-result error';
        return;
    }
    if (items.length === 0) {
        importResult.textContent = '没有解析到有效单词';
        importResult.className = 'import-result error';
        return;
    }

    const level = importLevel.value;
    submitImportBtn.disabled = true;
    let success = 0, fail = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        importResult.textContent = `正在导入 ${i + 1}/${items.length} ...`;
        importResult.className = 'import-result progress';
        if (!item.word || !item.definition) { fail++; continue; }
        try {
            await api('/words', {
                method: 'POST',
                body: JSON.stringify({ level, ...item }),
            });
            success++;
        } catch { fail++; }
    }

    submitImportBtn.disabled = false;
    importResult.textContent = `导入完成：成功 ${success} 条，失败 ${fail} 条`;
    importResult.className = 'import-result ' + (fail === 0 ? 'success' : 'error');

    if (success > 0) {
        importText.value = '';
        if (level === currentLevel) await loadLevel(currentLevel);
    }
});

// ===== 初始化 =====
(async function init() {
    if (!token) {
        showAuth();
        return;
    }
    try {
        const me = await api('/me');
        username = me.username;
        enterMain();
    } catch {
        token = '';
        localStorage.removeItem(TOKEN_KEY);
        showAuth();
    }
})();
