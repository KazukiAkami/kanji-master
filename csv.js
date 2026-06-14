// csv.js — 問題集テキストのパーサ。
// fetch を使わず <script> で読み込むため file://（ダブルクリック起動）でも動く。
// カンマ区切り（CSV）と タブ区切り（表計算からのコピペ＝TSV）の両方を受け付ける。
// RFC4180 簡易対応（"" エスケープ・引用フィールド内の区切り/改行に対応）。
function parseQuiz(text) {
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // 区切り自動判定: 1行目にタブがあればタブ、なければカンマ
    const firstLine = text.split('\n')[0] || '';
    const delim = firstLine.includes('\t') ? '\t' : ',';

    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += c;
            }
        } else {
            if (c === '"') inQuotes = true;
            else if (c === delim) { row.push(field); field = ''; }
            else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
            else field += c;
        }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    const out = [];
    for (const r of rows) {
        if (r.length < 2) continue;
        const q = (r[0] || '').trim(), a = (r[1] || '').trim();
        if (q === '' && a === '') continue;
        if (q === 'question' && a === 'answer') continue; // ヘッダー行スキップ
        if (q === '問題' && a === '答え') continue;        // 日本語ヘッダーもスキップ
        out.push({ question: q, answer: a });
    }
    return out;
}

window.parseQuiz = parseQuiz;
