// 브라우저에서 PDF 다루기 (서버로 보내지 않음, 무료)
//  - findProblemPages: 틀린 번호가 몇 쪽에 있는지 PDF 글자에서 찾는다 → 그 쪽만 잘라 AI에 보낸다
//  - renderPage: 한 쪽을 그림(canvas)으로 그린다 → 틀린 문제 다시 풀기에서 문제를 보여준다
// pdf.js(무료 공개 라이브러리)를 쓴다. 작업용 파일(worker)은 public/pdf.worker.min.mjs에 있다.

import { normalizeProblemNo } from "@/lib/problemAnalysis";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function pdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 문항 번호 → 쪽 번호(1부터). 못 찾은 번호는 빠진다.
 * 문제 번호는 보통 글자 조각의 맨 앞에 "009." "9)" "[9]" "문제 9" 꼴로 있다. 같은 번호가 여러 쪽에 보이면 처음 쪽.
 */
export async function findProblemPages(bytes: Uint8Array, numbers: string[]): Promise<Map<string, number>> {
  const lib = await pdfjs();
  // pdf.js가 넘겨받은 버퍼를 비울 수 있어 복사본을 준다
  const doc = await lib.getDocument({ data: bytes.slice() }).promise;
  const wanted = numbers.map(normalizeProblemNo).filter(Boolean);
  const patterns = new Map(
    wanted.map((n) => {
      const digits = n.split("-").map((part) => `0*${escapeRe(part)}`).join("\\s*-\\s*");
      return [
        n,
        {
          // 글자 조각 맨 앞의 번호 (가장 믿을 만함)
          atStart: new RegExp(`^\\s*(?:문항|문제|문)?\\s*[\\[(]?${digits}\\s*[.)\\]번]`),
          // 쪽 전체 글자에서 줄 처음이나 공백 뒤의 번호 (보조)
          inText: new RegExp(`(?:^|\\s)(?:문항|문제)?\\s*[\\[(]?${digits}\\s*[.)\\]](?=\\s|$)`),
        },
      ];
    })
  );
  const found = new Map<string, number>();
  const weak = new Map<string, number>();
  try {
    for (let p = 1; p <= doc.numPages && found.size < wanted.length; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.map((it) => ("str" in it ? it.str : "")).filter(Boolean);
      const text = items.join(" ").replace(/\s+/g, " ");
      for (const [n, re] of patterns) {
        if (found.has(n)) continue;
        if (items.some((s) => re.atStart.test(s))) found.set(n, p);
        else if (!weak.has(n) && re.inText.test(text)) weak.set(n, p);
      }
    }
  } finally {
    await doc.destroy();
  }
  for (const [n, p] of weak) if (!found.has(n)) found.set(n, p);
  return found;
}

/** PDF 한 쪽을 canvas에 그린다 (폭 maxWidth px에 맞춤) */
export async function renderPage(bytes: Uint8Array, pageNumber: number, canvas: HTMLCanvasElement, maxWidth: number) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const scale = (maxWidth / base.width) * ratio;
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
  } finally {
    await doc.destroy();
  }
}
