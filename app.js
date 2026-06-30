let currentQuizIndex = 0;
let quizList = [];
let correctCount = 0;
let wrongList = [];
let userAnswers = [];
let lastQuizCorrectRate = 0;
let isReviewMode = false;   // 直近のクイズが復習モードだったか（「もう一度」用）
let currentSession = null;  // 中断中のクイズ途中状態（無ければ null）。「つづきから」用

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
    currentSession = null;
    if (id) {
        const saved = localStorage.getItem(progressKey(id));
        if (saved) {
            const data = JSON.parse(saved);
            wrongList = data.wrongList || [];
            lastQuizCorrectRate = data.lastQuizCorrectRate || 0;
            currentSession = data.session || null;
        }
    }
    updateStats();
}

function saveProgress(id = currentKanjiId) {
    if (!id) return;
    localStorage.setItem(progressKey(id), JSON.stringify({
        wrongList: wrongList,
        lastQuizCorrectRate: lastQuizCorrectRate,
        session: currentSession
    }));
}

// クイズ中断時：今の途中状態を session として保存する（復習モードは保存しない＝つづきからは通常モードのみ）
function saveSession() {
    if (isReviewMode) return;
    if (!quizList.length || currentQuizIndex >= quizList.length) return; // 未開始・完了済みは保存しない
    // 「前の問題」で戻っていても、実際に解き進めた位置（未解答の最初の問題）から再開する。
    // 解答済みは先頭から連続して埋まるため、最初の空きスロット＝つづきの問題。
    let resumeIndex = userAnswers.findIndex(a => !a);
    if (resumeIndex < 0) resumeIndex = userAnswers.length; // 全て解答済みなら次の問題から
    resumeIndex = Math.min(Math.max(resumeIndex, currentQuizIndex), quizList.length - 1);
    currentSession = {
        quizList: quizList,
        currentQuizIndex: resumeIndex,
        userAnswers: userAnswers,
        correctCount: correctCount
    };
    saveProgress();
}

// 途中状態を破棄する（はじめから／完了時）
function clearSession() {
    currentSession = null;
    saveProgress();
}

function updateStats() {
    const total = currentKanjiData.length;
    const reviewBtn = document.getElementById('reviewBtn');
    reviewBtn.textContent = `復習する（まちがえた問題: ${wrongList.length}）`;
    reviewBtn.disabled = wrongList.length === 0;

    // 中断中の途中状態があれば「つづきから／はじめから」、無ければ通常の開始ボタン
    const hasSession = !!(currentSession && currentSession.quizList && currentSession.quizList.length);
    const startBtn = document.getElementById('startBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const restartFreshBtn = document.getElementById('restartFreshBtn');
    if (hasSession) {
        const totalQ = currentSession.quizList.length;
        const answers = currentSession.userAnswers || [];
        const answered = answers.filter(Boolean).length;
        const correct = answers.filter(a => a && a.isCorrect).length;
        const rate = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        // クイズ中の番号表示（currentQuizIndex+1）と揃え、再開する問題番号を出す
        const resumeAt = Math.min((currentSession.currentQuizIndex || 0) + 1, totalQ);
        resumeBtn.textContent = `▶ つづきから（${resumeAt}/${totalQ}問）`;
        // 途中状態があるときは、そこまでの進捗・正解率を表示
        document.getElementById('progress').textContent = `進捗: ${answered}/${totalQ}問`;
        document.getElementById('score').textContent = `正解率: ${rate}%`;
        startBtn.classList.add('hidden');
        resumeBtn.classList.remove('hidden');
        restartFreshBtn.classList.remove('hidden');
    } else {
        // 途中状態なし：まだ解いていないので進捗0・正解率0%で揃える
        document.getElementById('progress').textContent = `進捗: 0/${total}問`;
        document.getElementById('score').textContent = `正解率: 0%`;
        startBtn.classList.remove('hidden');
        resumeBtn.classList.add('hidden');
        restartFreshBtn.classList.add('hidden');
    }
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
    if (question.startsWith('【慣用句】')) {
        return { type: '慣用句を答えよう', text: question.slice('【慣用句】'.length) };
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
    closeMenu();
    // クイズ画面から離れるとき、未完了なら途中状態を保存（つづきから用）
    const leavingQuiz = !document.getElementById('quizScreen').classList.contains('hidden');
    if (screenName !== 'quizScreen' && leavingQuiz) saveSession();
    // ホームに戻るときは経路によらず必ず進捗・正解率を0表示に戻す
    if (screenName === 'mainScreen') updateStats();
    document.querySelectorAll('#app > main').forEach(m => m.classList.add('hidden'));
    document.getElementById(screenName).classList.remove('hidden');
}

// ⋮メニューの開閉
function toggleMenu() {
    const dropdown = document.getElementById('menuDropdown');
    const isOpen = dropdown.classList.toggle('hidden') === false;
    document.getElementById('menuBtn').setAttribute('aria-expanded', String(isOpen));
}

function closeMenu() {
    const dropdown = document.getElementById('menuDropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
    }
}

// 「進捗をリセット」メニューの開閉
function toggleResetMenu() {
    const dropdown = document.getElementById('resetDropdown');
    const isOpen = dropdown.classList.toggle('hidden') === false;
    document.getElementById('resetBtn').setAttribute('aria-expanded', String(isOpen));
}

function closeResetMenu() {
    const dropdown = document.getElementById('resetDropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        document.getElementById('resetBtn').setAttribute('aria-expanded', 'false');
    }
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
    isReviewMode = reviewMode;

    if (reviewMode) {
        quizList = shuffleArray(wrongList);
    } else {
        quizList = currentKanjiData.slice();
    }

    if (quizList.length === 0) {
        alert(reviewMode ? '復習する問題がありません' : '問題集が選ばれていません');
        return;
    }

    // 通常モードを新規開始したら、これまでの途中状態は破棄
    if (!reviewMode) clearSession();

    updateLiveScore(); // quizList 確定後に呼ぶ（進捗の総数を正しく表示するため）
    showScreen('quizScreen');
    showQuestion();
}

// 中断した通常クイズを途中から再開する
function resumeQuiz() {
    if (!currentSession || !currentSession.quizList || !currentSession.quizList.length) {
        startQuiz(false);
        return;
    }
    isReviewMode = false;
    quizList = currentSession.quizList.slice();
    userAnswers = (currentSession.userAnswers || []).slice();
    correctCount = currentSession.correctCount || 0;
    currentQuizIndex = currentSession.currentQuizIndex || 0;
    if (currentQuizIndex >= quizList.length) currentQuizIndex = quizList.length - 1;

    updateLiveScore();
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
    // 「答えを見る」ボタンを場所ごと隠す（余白が残らないようコンテナを非表示に）
    const btnGroup = document.querySelector('#card .button-group-horizontal');
    if (btnGroup) btnGroup.style.display = 'none';

    const answerDisplay = document.querySelector('.answer-display');
    answerDisplay.innerHTML = `<div class="answer-kanji">${current.answer}</div>`;

    document.getElementById('answerSection').classList.remove('hidden');
}

function handleAnswer(isCorrect) {
    const current = quizList[currentQuizIndex];

    // 問題ごとのスロットに記録（戻って解き直しても上書きで、二重集計しない）
    userAnswers[currentQuizIndex] = {
        question: current.question,
        answer: current.answer,
        isCorrect: isCorrect
    };

    if (isCorrect) {
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

    // 解答済みスロットから正解数を数え直す（解き直しの取り消し・変更も反映）
    correctCount = userAnswers.filter(a => a && a.isCorrect).length;

    updateLiveScore();
    saveProgress();

    currentQuizIndex++;
    showQuestion();
}

// クイズ中の進捗（解いた数/総数）と、その時点の正解率を表示する
function updateLiveScore() {
    const total = quizList.length;
    const answered = userAnswers.filter(Boolean).length; // 実際に解答したスロット数
    const rate = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;
    document.getElementById('progress').textContent = `進捗: ${answered}/${total}問`;
    document.getElementById('score').textContent = `正解率: ${rate}%`;
}

function showResult() {
    const total = quizList.length;
    const percentage = Math.round((correctCount / total) * 100);

    lastQuizCorrectRate = percentage;
    if (!isReviewMode) currentSession = null; // 通常クイズを完走したら途中状態を破棄（復習完走では通常の途中状態を残す）
    saveProgress();
    updateStats();
    updateLiveScore(); // updateStats() が 0 に戻すので、最終的な進捗・正解率を表示し直す

    document.querySelector('.result-score').textContent = `正答数: ${correctCount}/${total}`;
    document.querySelector('.result-detail').textContent = `正答率: ${percentage}%`;

    // 全問正解のときはお祝いメッセージを出す
    const msgEl = document.querySelector('.result-message');
    msgEl.textContent = (correctCount === total) ? '🎉 全問正解！すばらしい！' : '';

    // 「もう一度」ボタン：復習モードでまちがえた問題が残っていなければ隠す
    // （残っていればもう一度で復習を再開できる。通常モードは常に表示）
    const restartBtn = document.getElementById('restartBtn');
    const hideRestart = isReviewMode && wrongList.length === 0;
    restartBtn.classList.toggle('hidden', hideRestart);
    restartBtn.textContent = isReviewMode ? 'まちがえた問題をもう一度' : 'もう一度';

    showScreen('resultScreen');
}

// イベントリスナー設定
document.addEventListener('DOMContentLoaded', function() {
    // メインボタン
    document.getElementById('startBtn').addEventListener('click', () => startQuiz(false));
    document.getElementById('resumeBtn').addEventListener('click', () => resumeQuiz());
    document.getElementById('restartFreshBtn').addEventListener('click', () => startQuiz(false));
    document.getElementById('reviewBtn').addEventListener('click', () => startQuiz(true));
    document.getElementById('listBtn').addEventListener('click', () => showKanjiList());
    document.getElementById('listHomeBtn').addEventListener('click', () => showScreen('mainScreen'));

    // 「進捗をリセット」メニュー（2種類のリセットを選ばせる）
    document.getElementById('resetBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleResetMenu();
    });
    document.getElementById('resetProgressBtn').addEventListener('click', () => {
        closeResetMenu();
        if (confirm('この問題集の学習の進捗・成績をリセットしますか？\n（まちがえた問題は残ります）')) {
            currentSession = null;
            lastQuizCorrectRate = 0;
            saveProgress();
            updateStats();
        }
    });
    document.getElementById('resetWrongBtn').addEventListener('click', () => {
        closeResetMenu();
        if (confirm('この問題集のまちがえた問題をリセットしますか？')) {
            wrongList = [];
            saveProgress();
            updateStats();
        }
    });
    document.getElementById('resetCancelBtn').addEventListener('click', () => closeResetMenu());
    // メニュー外をタップしたら閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.reset-menu')) closeResetMenu();
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
    document.getElementById('quizHomeBtn').addEventListener('click', () => showScreen('mainScreen'));
    document.getElementById('titleBtn').addEventListener('click', () => showScreen('mainScreen'));

    // ⋮メニューの開閉（押し間違え防止でホームをメニュー内に格納）
    document.getElementById('menuBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });
    // メニュー外をタップしたら閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu')) closeMenu();
    });

    // 結果画面ボタン
    document.getElementById('restartBtn').addEventListener('click', () => startQuiz(isReviewMode));
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
