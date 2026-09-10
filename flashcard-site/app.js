// 1. 单词数据（纯静态方案，直接内嵌）
const wordList = [
    { word: "Ephemeral", phonetic: "/ɪˈfem(ə)rəl/", definition: "短暂的，瞬息的", example: "Fame in the internet age is often ephemeral." },
    { word: "Serendipity", phonetic: "/ˌserənˈdipədē/", definition: "意外发现珍宝的运气", example: "Finding this cafe was pure serendipity." },
    { word: "Resilience", phonetic: "/rɪˈzɪliəns/", definition: "恢复力，韧性", example: "She showed great resilience in the face of adversity." }
];

let currentIndex = 0;
const card = document.getElementById('flashcard');
const wordEl = document.getElementById('word');
const phoneticEl = document.getElementById('phonetic');
const definitionEl = document.getElementById('definition');
const exampleEl = document.getElementById('example');

// 2. 渲染当前单词
function renderCard() {
    const item = wordList[currentIndex];
    wordEl.textContent = item.word;
    phoneticEl.textContent = item.phonetic;
    definitionEl.textContent = item.definition;
    exampleEl.textContent = item.example;
    card.classList.remove('flipped'); // 切换单词时，确保卡片回到正面
}

// 3. 事件绑定
document.getElementById('flipBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    card.classList.toggle('flipped');
});

card.addEventListener('click', () => {
    card.classList.toggle('flipped');
});

document.getElementById('nextBtn').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % wordList.length;
    renderCard();
});

document.getElementById('prevBtn').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + wordList.length) % wordList.length;
    renderCard();
});

// 初始化
renderCard();