let currentQuizIndex = 0;
let quizList = [];
let correctCount = 0;
let wrongList = [];
let userAnswers = [];
let lastQuizCorrectRate = 0;

function loadProgress() {
    const saved = localStorage.getItem('kanjiProgress');
    if (saved) {
        const data = JSON.parse(saved);
        wrongList = data.wrongList || [];
        lastQuizCorrectRate = data.lastQuizCorrectRate || 0;
        updateStats();
    }
}

function saveProgress() {
    localStorage.setItem('kanjiProgress', JSON.stringify({
        wrongList: wrongList,
        lastQuizCorrectRate: lastQuizCorrectRate
    }));
}

function updateStats() {
    const total = kanjiData.length;
    document.getElementById('progress').textContent = `問題数: ${total}問`;
    document.getElementById('score').textContent = `正解数: 0問`;

    const reviewBtn = document.getElementById('reviewBtn');
    reviewBtn.textContent = `復習する（まちがえた問題: ${wrongList.length}）`;
    reviewBtn.disabled = wrongList.length === 0;
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
    document.getElementById('mainScreen').classList.add('hidden');
    document.getElementById('quizScreen').classList.add('hidden');
    document.getElementById('resultScreen').classList.add('hidden');
    document.getElementById(screenName).classList.remove('hidden');
}

function startQuiz(reviewMode = false) {
    currentQuizIndex = 0;
    correctCount = 0;
    userAnswers = [];
    document.getElementById('score').textContent = `正解数: 0問`;

    if (reviewMode) {
        quizList = shuffleArray(wrongList);
    } else {
        quizList = kanjiData.slice();
    }

    console.log('kanjiDataの問題数:', kanjiData.length);
    console.log('quizListの問題数:', quizList.length);

    if (quizList.length === 0) {
        alert('復習する問題がありません');
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
    console.log('=== showQuestion 問題', currentQuizIndex + 1, '===');
    console.log('問題文:', current.question);
    console.log('答え:', current.answer);

    // 進捗表示を更新
    document.getElementById('quizProgress').textContent = `${currentQuizIndex + 1}/${quizList.length}`;

    // 答えセクションを非表示
    document.getElementById('answerSection').classList.add('hidden');

    // card-front全体を作り直す
    const cardFront = document.querySelector('#card .card-front');
    cardFront.innerHTML = `
        <div class="question-type">漢字で書いてみよう</div>
        <div class="kanji-large question-text">${current.question}</div>
        <div class="button-group-horizontal">
            <button class="show-answer-btn">答えを見る</button>
            <button class="skip-btn">次の問題に進む</button>
        </div>
    `;

    console.log('DOM更新完了');
}

function showAnswer(current) {
    const showAnswerBtn = document.querySelector('.show-answer-btn');
    showAnswerBtn.style.display = 'none';

    const answerDisplay = document.querySelector('.answer-display');
    answerDisplay.innerHTML = `<div class="answer-kanji">${current.answer}</div>`;

    document.getElementById('answerSection').classList.remove('hidden');
}

function skipQuestion() {
    console.log('skipQuestion: インデックス', currentQuizIndex);
    handleAnswer(true);
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

    document.querySelector('.result-score').textContent = `正答数: ${correctCount}/${total}`;
    document.querySelector('.result-detail').textContent = `正答率: ${percentage}%`;

    showScreen('resultScreen');
}

// イベントリスナー設定
document.addEventListener('DOMContentLoaded', function() {
    // メインボタン
    document.getElementById('startBtn').addEventListener('click', () => startQuiz(false));
    document.getElementById('reviewBtn').addEventListener('click', () => startQuiz(true));
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('本当に進捗をリセットしますか？')) {
            wrongList = [];
            saveProgress();
            updateStats();
        }
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

        if (e.target.classList.contains('skip-btn')) {
            skipQuestion();
        }
    });

    // 初期化
    loadProgress();
    updateStats();
});
