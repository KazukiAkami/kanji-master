let currentQuizIndex = 0;
let quizList = [];
let correctCount = 0;
let wrongList = [];
let userAnswers = [];
let lastQuizCorrectRate = 0;

let currentKanjiId = null;   // 選択中の問題集ID
let currentKanjiData = [];   // 選択中問題集の [{question, answer}]

const LAST_QUIZ_KEY = 'kanjiLastQuiz';

function progressKey(id) {
    return 'kanjiProgress:' + id;
}

// kanji-data.js の KANJI_DATA 文字列を問題集の配列に変換する。
// 「## タイトル」で問題集が始まり、以降の行は「問題,答え」（最初のカンマで分割）。
// 空行とカンマの無い行は無視する（壊れた行があってもアプリは動く）。
function parseKanjiData(text) {
    const blocks = [];
    let cur = null;
    for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
        if (line.startsWith('## ')) {
            const title = line.slice(3).trim();
            cur = { id: title, title: title, items: [] }; // id はタイトルから導出
            blocks.push(cur);
        } else if (!cur || line.trim() === '') {
            // 問題集が始まる前の行・空行はスキップ
        } else {
            const i = line.indexOf(','); // 最初のカンマで問題／答えに分割
            if (i < 0) continue;          // カンマの無い行は無視
            const q = line.slice(0, i).trim(), a = line.slice(i + 1).trim();
            if (q || a) cur.items.push({ question: q, answer: a });
        }
    }
    return blocks;
}

// 旧バージョンの単一キー進捗を、最初の問題集の進捗として1回だけ引き継ぐ
function migrateLegacyProgress() {
    const legacy = localStorage.getItem('kanjiProgress');
    if (!legacy) return;
    const firstId = (window.kanjiData && window.kanjiData[0]) ? window.kanjiData[0].id : null;
    if (firstId && !localStorage.getItem(progressKey(firstId))) {
        localStorage.setItem(progressKey(firstId), legacy);
    }
    localStorage.removeItem('kanjiProgress');
}

function loadProgress(id = currentKanjiId) {
    wrongList = [];
    lastQuizCorrectRate = 0;
    if (id) {
        const saved = localStorage.getItem(progressKey(id));
        if (saved) {
            const data = JSON.parse(saved);
            wrongList = data.wrongList || [];
            lastQuizCorrectRate = data.lastQuizCorrectRate || 0;
        }
    }
    updateStats();
}

function saveProgress(id = currentKanjiId) {
    if (!id) return;
    localStorage.setItem(progressKey(id), JSON.stringify({
        wrongList: wrongList,
        lastQuizCorrectRate: lastQuizCorrectRate
    }));
}

function updateStats() {
    const total = currentKanjiData.length;
    document.getElementById('progress').textContent = `問題数: ${total}問`;
    document.getElementById('score').textContent = `正解数: 0問`;

    const reviewBtn = document.getElementById('reviewBtn');
    reviewBtn.textContent = `復習する（まちがえた問題: ${wrongList.length}）`;
    reviewBtn.disabled = wrongList.length === 0;
}

// プルダウンに問題集の選択肢を並べる
function renderKanjiOptions() {
    const sel = document.getElementById('quizSelect');
    const kanjiDataList = window.kanjiData || [];
    sel.innerHTML = kanjiDataList.map(q => {
        const n = q.items.length;
        return `<option value="${q.id}">${q.title}（${n}問）</option>`;
    }).join('');
}

// 問題集を1つ選んで現在の問題集にする
function selectKanjiData(id) {
    const meta = (window.kanjiData || []).find(q => q.id === id);
    if (!meta) return;
    currentKanjiData = meta.items.slice();
    currentKanjiId = id;
    document.getElementById('quizSelect').value = id;
    localStorage.setItem(LAST_QUIZ_KEY, id);
    loadProgress(id);   // 内部で updateStats() を呼ぶ
}

// 問題文の先頭タグ（【読み】【四字熟語】）から出題種別を判定し、
// 画面見出しと、タグを除いた表示用の問題文を返す。タグが無ければ書き取り。
function classifyQuestion(question) {
    if (question.startsWith('【読み】')) {
        return { type: '読みを書こう', text: question.slice('【読み】'.length) };
    }
    if (question.startsWith('【四字熟語】')) {
        return { type: '四字熟語を答えよう', text: question.slice('【四字熟語】'.length) };
    }
    return { type: '漢字で書いてみよう', text: question };
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function showScreen(screenName) {
    document.querySelectorAll('#app > main').forEach(m => m.classList.add('hidden'));
    document.getElementById(screenName).classList.remove('hidden');
}

function showKanjiList() {
    const listEl = document.getElementById('kanjiList');
    listEl.innerHTML = currentKanjiData.map((item, i) => `
        <div class="kanji-list-item">
            <span class="list-number">${i + 1}</span>
            <span class="list-question">${classifyQuestion(item.question).text}</span>
            <span class="list-answer">${item.answer}</span>
        </div>
    `).join('');
    showScreen('listScreen');
}

function startQuiz(reviewMode = false) {
    currentQuizIndex = 0;
    correctCount = 0;
    userAnswers = [];
    document.getElementById('score').textContent = `正解数: 0問`;

    if (reviewMode) {
        quizList = shuffleArray(wrongList);
    } else {
        quizList = currentKanjiData.slice();
    }

    if (quizList.length === 0) {
        alert(reviewMode ? '復習する問題がありません' : '問題集が選ばれていません');
        return;
    }

    showScreen('quizScreen');
    showQuestion();
}

function showQuestion() {
    if (currentQuizIndex >= quizList.length) {
        showResult();
        return;
    }

    const current = quizList[currentQuizIndex];

    // 進捗表示を更新
    document.getElementById('quizProgress').textContent = `${currentQuizIndex + 1}/${quizList.length}`;

    // 答えセクションを非表示
    document.getElementById('answerSection').classList.add('hidden');

    // card-front全体を作り直す（タグから出題種別を判定）
    const { type, text } = classifyQuestion(current.question);
    const cardFront = document.querySelector('#card .card-front');
    cardFront.innerHTML = `
        <div class="question-type">${type}</div>
        <div class="kanji-large question-text">${text}</div>
        <div class="button-group-horizontal">
            <button class="show-answer-btn">答えを見る</button>
        </div>
    `;
}

function showAnswer(current) {
    const showAnswerBtn = document.querySelector('.show-answer-btn');
    showAnswerBtn.style.display = 'none';

    const answerDisplay = document.querySelector('.answer-display');
    answerDisplay.innerHTML = `<div class="answer-kanji">${current.answer}</div>`;

    document.getElementById('answerSection').classList.remove('hidden');
}

function handleAnswer(isCorrect) {
    const current = quizList[currentQuizIndex];

    userAnswers.push({
        question: current.question,
        answer: current.answer,
        isCorrect: isCorrect
    });

    if (isCorrect) {
        correctCount++;
        const index = wrongList.findIndex(q => q.question === current.question);
        if (index > -1) {
            wrongList.splice(index, 1);
        }
    } else {
        const exists = wrongList.some(q => q.question === current.question);
        if (!exists) {
            wrongList.push(current);
        }
    }

    updateLiveScore();
    saveProgress();

    currentQuizIndex++;
    showQuestion();
}

function updateLiveScore() {
    document.getElementById('score').textContent = `正解数: ${correctCount}問`;
}

function showResult() {
    const total = quizList.length;
    const percentage = Math.round((correctCount / total) * 100);

    lastQuizCorrectRate = percentage;
    saveProgress();
    updateStats();
    updateLiveScore(); // updateStats() が 0問 に戻すので、実際の正解数を表示し直す

    document.querySelector('.result-score').textContent = `正答数: ${correctCount}/${total}`;
    document.querySelector('.result-detail').textContent = `正答率: ${percentage}%`;

    // 全問正解のときはお祝いメッセージを出す
    const msgEl = document.querySelector('.result-message');
    msgEl.textContent = (correctCount === total) ? '🎉 全問正解です！すばらしい！' : '';

    showScreen('resultScreen');
}

// イベントリスナー設定
document.addEventListener('DOMContentLoaded', function() {
    // メインボタン
    document.getElementById('startBtn').addEventListener('click', () => startQuiz(false));
    document.getElementById('reviewBtn').addEventListener('click', () => startQuiz(true));
    document.getElementById('listBtn').addEventListener('click', () => showKanjiList());
    document.getElementById('listHomeBtn').addEventListener('click', () => showScreen('mainScreen'));
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('この問題集の進捗をリセットしますか？')) {
            wrongList = [];
            lastQuizCorrectRate = 0;
            saveProgress();
            updateStats();
        }
    });

    // 問題集の切り替え（プルダウン）
    document.getElementById('quizSelect').addEventListener('change', (e) => {
        selectKanjiData(e.target.value);
    });

    // クイズ画面ボタン
    document.getElementById('backBtn').addEventListener('click', () => {
        if (currentQuizIndex > 0) {
            currentQuizIndex--;
            showQuestion();
        } else {
            showScreen('mainScreen');
        }
    });
    document.getElementById('correctBtn').addEventListener('click', () => handleAnswer(true));
    document.getElementById('wrongBtn').addEventListener('click', () => handleAnswer(false));
    document.getElementById('quizHomeBtn').addEventListener('click', () => { updateStats(); showScreen('mainScreen'); });
    document.getElementById('titleBtn').addEventListener('click', () => { updateStats(); showScreen('mainScreen'); });

    // 結果画面ボタン
    document.getElementById('restartBtn').addEventListener('click', () => startQuiz(false));
    document.getElementById('homeBtn').addEventListener('click', () => showScreen('mainScreen'));

    // 問題画面のボタン（イベント委譲）
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('show-answer-btn')) {
            const current = quizList[currentQuizIndex];
            if (current) {
                showAnswer(current);
            }
        }
    });

    // 初期化（kanji-data.js の KANJI_DATA 文字列をここで配列に変換する）
    window.kanjiData = parseKanjiData(window.KANJI_DATA || '');
    const kanjiDataList = window.kanjiData;
    if (kanjiDataList.length === 0) {
        document.getElementById('progress').textContent = '問題集が読み込めませんでした';
        document.getElementById('startBtn').disabled = true;
        document.getElementById('reviewBtn').disabled = true;
        return;
    }

    migrateLegacyProgress();
    renderKanjiOptions();

    // 前回選んだ問題集を復元（無ければ先頭）
    const lastId = localStorage.getItem(LAST_QUIZ_KEY);
    const startId = kanjiDataList.some(q => q.id === lastId) ? lastId : kanjiDataList[0].id;
    selectKanjiData(startId);
});
