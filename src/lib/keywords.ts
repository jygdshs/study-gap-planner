// 개념 의미 채점 (9차시 개선): "핵심 단어가 얼마나 비슷한지"
//
// 예전 방식(문자 2개씩 겹치는 비율)은 같은 뜻을 다른 어순·조사로 쓰면 점수가 크게 낮아졌다.
// 그래서 기준 의미에서 '핵심 단어'만 뽑고, 내가 쓴 설명에 그 단어가 얼마나 들어 있는지로 채점한다.
//  1) 단어로 나눈 뒤 끝의 조사·어미(은/는/이/가/을/를/으로/에서/이다/한다 …)를 떼어 낸다.
//  2) '것, 수, 등' 같은 뜻이 약한 말은 버리고, 2글자 이상만 핵심 단어로 쓴다.
//  3) 기준의 핵심 단어마다 내 설명에서 가장 비슷한 단어를 찾아 점수를 준다.
//     - 똑같음 1점 / 한쪽이 다른 쪽을 포함(예: 변화율 ⊂ 순간변화율) 0.8점
//     - 글자 조각이 비슷함(예: 변화율 ↔ 변화량) 그 비율만큼 부분 점수 (0.3 미만은 0점)
//  4) 점수 = 받은 점수 합 ÷ 기준 핵심 단어 수 × 100

// 길이가 긴 것부터 떼어야 '으로'가 '로'보다 먼저 맞는다
const SUFFIXES = [
  "으로써", "으로서", "에서는", "에게서", "이라는", "이라고", "이란",
  "이라", "라는", "라고", "에서", "에게", "으로", "까지", "부터", "처럼", "보다",
  "이다", "이며", "이고", "이나", "에는", "에도", "하는", "되는", "한다", "된다",
  "하고", "하여", "해서", "하며", "였다", "이었다",
  "와", "과", "은", "는", "이", "가", "을", "를", "의", "에", "로", "도", "만", "다", "며", "고", "란",
].sort((a, b) => b.length - a.length);

const STOPWORDS = new Set([
  "것", "수", "등", "및", "또는", "그리고", "그", "이", "저", "때", "경우", "있다", "없다",
  "하다", "되다", "대한", "대해", "통해", "위해", "같은", "어떤", "모든", "각", "어느",
  "정도", "부분", "가장", "매우", "아주", "말한다", "의미한다", "뜻한다", "말", "뜻",
  "따라", "따른", "의해", "위한", "관한", "있는", "없는",
]);

/** '것이다', '수가'처럼 조사·어미를 떼면 뜻 없는 말만 남는 단어인지 */
function isFunctionWord(token: string): boolean {
  if (STOPWORDS.has(token)) return true;
  return SUFFIXES.some((s) => token.endsWith(s) && STOPWORDS.has(token.slice(0, token.length - s.length)));
}

function stripSuffix(token: string): string {
  let t = token;
  // 조사·어미가 겹쳐 붙은 경우(예: '것이다')를 위해 두 번까지 뗀다
  for (let round = 0; round < 2; round++) {
    const suffix = SUFFIXES.find((s) => t.endsWith(s) && t.length - s.length >= 2);
    if (!suffix) break;
    t = t.slice(0, t.length - suffix.length);
  }
  return t;
}

/** 문장에서 핵심 단어 목록(중복 없음)을 뽑는다 */
export function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const raw of tokens) {
    if (isFunctionWord(raw)) continue;
    const word = stripSuffix(raw);
    if (word.length < 2 || isFunctionWord(word)) continue;
    if (!out.includes(word)) out.push(word);
  }
  return out;
}

function bigrams(word: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < word.length - 1; i++) grams.add(word.slice(i, i + 2));
  return grams;
}

function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const union = A.size + B.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  return jaccard >= 0.3 ? jaccard : 0;
}

export interface KeywordMatch {
  keyword: string; // 기준 의미의 핵심 단어
  credit: number; // 0 ~ 1
  matchedWith: string | null; // 내 설명에서 가장 비슷했던 단어
}

export interface KeywordScore {
  score: number; // 0 ~ 100
  matches: KeywordMatch[];
}

/** 기준 의미의 핵심 단어가 내 설명에 얼마나 들어 있는지 (0~100) */
export function keywordScore(reference: string, answer: string): KeywordScore {
  const refWords = extractKeywords(reference);
  if (refWords.length === 0 || !answer.trim()) return { score: 0, matches: [] };

  const ansWords = extractKeywords(answer);
  // 띄어쓰기가 달라도 찾을 수 있도록 공백을 뺀 전체 문장도 함께 본다
  const ansCompact = answer.replace(/\s+/g, "").toLowerCase();

  const matches = refWords.map((keyword): KeywordMatch => {
    if (ansCompact.includes(keyword)) return { keyword, credit: 1, matchedWith: keyword };
    let best = 0;
    let bestWord: string | null = null;
    for (const w of ansWords) {
      const s = wordSimilarity(keyword, w);
      if (s > best) {
        best = s;
        bestWord = w;
      }
    }
    return { keyword, credit: best, matchedWith: best > 0 ? bestWord : null };
  });

  const total = matches.reduce((sum, m) => sum + m.credit, 0);
  return { score: Math.round((total / refWords.length) * 1000) / 10, matches };
}
