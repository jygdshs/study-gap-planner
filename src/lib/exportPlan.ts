// 계획 내보내기: 계획 기간 전체를 이미지(PNG) 또는 PDF 파일로 저장한다.
//  - 저장된 칸이 있으면 저장된 칸, 없으면 추천 칸을 쓴다 (화면 시간표와 같은 규칙)
//  - 이미지는 외부 라이브러리 없이 canvas에 직접 그린다. 화면 테마와 상관없이 항상 밝은 종이색.

import type { PlanData } from "@/lib/usePlanData";
import { colorOf } from "@/lib/palette";
import { formatClock } from "@/lib/schedule";
import { daySchedule } from "@/lib/dayCells";

export interface ExportCell {
  subjectName: string;
  unit: string;
  color: string;
  minutes: number | null;
  saved: boolean;
  completed: boolean;
  carried: boolean;
  times: string | null; // 공부 시간대가 있으면 이 과목을 공부하는 시각 "19:00–19:35 · 19:55–20:30"
}

export interface ExportDay {
  date: string;
  dayLabel: string;
  hours: number;
  window: string | null; // "19:00–22:00"
  exams: { name: string; color: string }[];
  rest: boolean;
  cells: (ExportCell | null)[]; // [첫 과목, 둘째 과목]
}

export const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export function buildExportDays(data: PlanData): ExportDay[] {
  const { planDays, savedAt, minutesFor, colors, subjectNameById, isRestDay } = data;
  return planDays.map((day) => {
    const minutes = minutesFor(day);
    const plan = daySchedule(data, day);
    const timesOf = (slot: number) =>
      plan
        ? plan.blocks
            .filter((b) => b.kind === "study" && b.slot === slot)
            .map((b) => `${formatClock(b.start)}–${formatClock(b.end)}`)
            .join(" · ") || null
        : null;
    const cells = [0, 1].map((slot): ExportCell | null => {
      const saved = savedAt(day.date, slot);
      const rec = day.items[slot];
      const subjectId = saved?.subject_id ?? rec?.subjectId;
      const unit = saved?.unit ?? rec?.unit;
      if (!subjectId || !unit) return null;
      return {
        subjectName: subjectNameById.get(subjectId) ?? rec?.subjectName ?? "?",
        unit,
        color: colorOf(colors, subjectId),
        minutes: minutes[slot],
        saved: Boolean(saved),
        completed: Boolean(saved?.completed),
        carried: Boolean(rec?.carriedFrom && rec.subjectId === subjectId && rec.unit === unit),
        times: timesOf(slot),
      };
    });
    return {
      date: day.date,
      dayLabel: day.dayLabel,
      hours: day.availableHours,
      window: day.window ? `${day.window.start}–${day.window.end}` : null,
      exams: day.exams.map((e) => ({ name: e.subjectName, color: colorOf(colors, e.subjectId) })),
      rest: isRestDay(day),
      cells,
    };
  });
}

// ---------------------------------------------------------------------------
// 이미지(PNG)
// ---------------------------------------------------------------------------

const PAPER = {
  bg: "#E9EDEB",
  sheet: "#FFFFFF",
  rule: "#D3D9D6",
  ink: "#18233A",
  soft: "#46536A",
  muted: "#5F6B7E",
  navy: "#18233A",
};
const FONT = `"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

/** 과목 색을 흰색과 섞은 옅은 색 (완료 칸 바탕) */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/** 폭에 맞춰 글자 단위로 줄바꿈, 최대 maxLines줄 (넘치면 …) */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const chars = [...text];
  const lines: string[] = [];
  let line = "";
  let i = 0;
  for (; i < chars.length; i++) {
    const ch = chars[i];
    if (line && ctx.measureText(line + ch).width > width) {
      lines.push(line);
      if (lines.length === maxLines) break;
      line = ch.trim() ? ch : "";
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines) {
    if (line) lines.push(line);
  } else if (i < chars.length) {
    // 다 못 넣었으면 마지막 줄 끝을 …으로
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + "…").width > width) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}

export async function drawPlanImage(
  days: ExportDay[],
  title: string,
  subtitle: string,
  firstWeek = 1 // PDF 2쪽부터는 3주차, 5주차…로 이어서 센다
): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts) await document.fonts.ready;

  const W = 1200;
  const PAD = 40;
  const LABEL = 64;
  const HEAD_H = 64;
  const SLOT_H = 92;
  const HOURS_H = 34;
  const WEEK_GAP = 28;
  const weeks: ExportDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const weekH = HEAD_H + SLOT_H * 2 + HOURS_H;
  const TOP = 112;
  const H = TOP + weeks.length * weekH + (weeks.length - 1) * WEEK_GAP + 64;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = PAPER.bg;
  ctx.fillRect(0, 0, W, H);

  // 제목 띠
  ctx.fillStyle = PAPER.navy;
  ctx.fillRect(0, 0, W, 88);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(title, PAD, 50);
  ctx.fillStyle = "#C9D2E3";
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(subtitle, PAD, 74);

  const colW = (W - PAD * 2 - LABEL) / 7;

  weeks.forEach((week, wi) => {
    const y0 = TOP + wi * (weekH + WEEK_GAP);
    const x0 = PAD;
    // 시트
    ctx.fillStyle = PAPER.sheet;
    ctx.fillRect(x0, y0, W - PAD * 2, weekH);

    // 교시 이름 열
    ctx.fillStyle = PAPER.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`${firstWeek + wi}주차`, x0 + LABEL / 2, y0 + HEAD_H / 2 + 5);
    ["첫 과목", "둘째 과목"].forEach((t, i) => ctx.fillText(t, x0 + LABEL / 2, y0 + HEAD_H + SLOT_H * i + SLOT_H / 2 + 5));
    ctx.fillText("시간", x0 + LABEL / 2, y0 + HEAD_H + SLOT_H * 2 + HOURS_H / 2 + 5);

    week.forEach((day, di) => {
      const cx = x0 + LABEL + di * colW;
      // 머리: 요일 + 날짜 + 시험
      ctx.textAlign = "center";
      ctx.fillStyle = PAPER.ink;
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(day.dayLabel, cx + colW / 2, y0 + 26);
      ctx.fillStyle = PAPER.muted;
      ctx.font = `500 13px ${FONT}`;
      ctx.fillText(shortDate(day.date), cx + colW / 2, y0 + 44);
      day.exams.slice(0, 1).forEach((ex) => {
        ctx.font = `700 11px ${FONT}`;
        const label = `${ex.name} 시험`;
        const tw = Math.min(colW - 12, ctx.measureText(label).width + 10);
        ctx.fillStyle = ex.color;
        ctx.fillRect(cx + colW / 2 - tw / 2, y0 + 49, tw, 14);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(label, cx + colW / 2, y0 + 60, colW - 16);
      });

      // 칸
      if (day.rest) {
        const ry = y0 + HEAD_H + 4;
        const rh = SLOT_H * 2 - 8;
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx + 4, ry, colW - 8, rh);
        ctx.clip();
        ctx.strokeStyle = PAPER.rule;
        ctx.lineWidth = 5;
        for (let k = -rh; k < colW + rh; k += 12) {
          ctx.beginPath();
          ctx.moveTo(cx + k, ry);
          ctx.lineTo(cx + k + rh, ry + rh);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = PAPER.sheet;
        ctx.fillRect(cx + colW / 2 - 30, ry + rh / 2 - 12, 60, 24);
        ctx.fillStyle = PAPER.muted;
        ctx.font = `600 13px ${FONT}`;
        ctx.fillText("쉬는 날", cx + colW / 2, ry + rh / 2 + 5);
      } else {
        day.cells.forEach((cell, slot) => {
          if (!cell) return;
          const bx = cx + 4;
          const by = y0 + HEAD_H + slot * SLOT_H + 4;
          const bw = colW - 8;
          const bh = SLOT_H - 8;
          let textColor = "#FFFFFF";
          if (!cell.saved) {
            ctx.fillStyle = PAPER.sheet;
            ctx.fillRect(bx, by, bw, bh);
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = cell.color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5);
            ctx.setLineDash([]);
            textColor = cell.color;
          } else if (cell.completed) {
            ctx.fillStyle = tint(cell.color, 0.14);
            ctx.fillRect(bx, by, bw, bh);
            textColor = cell.color;
          } else {
            ctx.fillStyle = cell.color;
            ctx.fillRect(bx, by, bw, bh);
          }
          ctx.textAlign = "left";
          ctx.fillStyle = textColor;
          ctx.font = `600 12px ${FONT}`;
          ctx.fillText(cell.subjectName + (cell.carried ? " · 이월" : ""), bx + 8, by + 18, bw - 30);
          ctx.font = `700 15px ${FONT}`;
          const lines = wrap(ctx, cell.unit, bw - 16, 2);
          lines.forEach((l, li) => ctx.fillText(l, bx + 8, by + 40 + li * 19));
          if (cell.times) {
            ctx.font = `600 11px ${FONT}`;
            ctx.fillText(cell.times, bx + 8, by + bh - 8, bw - 16);
          } else if (cell.minutes) {
            ctx.font = `600 12px ${FONT}`;
            ctx.fillText(`${cell.minutes}분`, bx + 8, by + bh - 8);
          }
          if (cell.completed) {
            ctx.strokeStyle = cell.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx + bw - 26, by + 6, 20, 20);
            ctx.beginPath();
            ctx.moveTo(bx + bw - 21, by + 16);
            ctx.lineTo(bx + bw - 17, by + 20);
            ctx.lineTo(bx + bw - 10, by + 12);
            ctx.stroke();
          }
        });
      }

      // 시간 줄
      ctx.textAlign = "center";
      ctx.fillStyle = PAPER.soft;
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(`${day.hours}시간${day.window ? ` · ${day.window}` : ""}`, cx + colW / 2, y0 + HEAD_H + SLOT_H * 2 + HOURS_H / 2 + 5, colW - 8);
    });

    // 괘선
    ctx.strokeStyle = PAPER.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const yy of [HEAD_H, HEAD_H + SLOT_H, HEAD_H + SLOT_H * 2]) {
      ctx.moveTo(x0, y0 + yy + 0.5);
      ctx.lineTo(x0 + LABEL + colW * week.length, y0 + yy + 0.5);
    }
    for (let k = 0; k <= week.length; k++) {
      const xx = Math.round(x0 + LABEL + k * colW) + 0.5;
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx, y0 + weekH);
    }
    ctx.stroke();
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, W - PAD * 2 - 1, weekH - 1);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = PAPER.muted;
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText("점선 칸은 저장하지 않은 추천 · 옅은 칸은 완료 · 이월은 지난 날 못 한 공부", PAD, H - 28);
  ctx.textAlign = "right";
  ctx.fillText("학습 공백 분석 및 개인별 학습 계획", W - PAD, H - 28);
  return canvas;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPlanImage(days: ExportDay[], title: string, subtitle: string, fileName: string) {
  const canvas = await drawPlanImage(days, title, subtitle);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했어요.");
  downloadBlob(blob, fileName);
}

// ---------------------------------------------------------------------------
// PDF: 라이브러리 없이 직접 만든다. 2주씩 시간표 이미지(JPEG)를 그려 A4 가로 한 쪽에 하나씩 넣는다.
// (한글 글꼴을 PDF에 넣지 않아도 되도록 글자까지 이미지로 그린 것을 쓴다)
// ---------------------------------------------------------------------------

const DAYS_PER_PAGE = 14;
const A4_W = 842; // pt, 가로
const A4_H = 595;
const MARGIN = 24;

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("PDF를 만들지 못했어요.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** JPEG 이미지들을 한 쪽에 하나씩 넣은 PDF 바이트 */
function buildPdf(pages: { jpeg: Uint8Array; width: number; height: number }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (id: number, body: string | (string | Uint8Array)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const part of Array.isArray(body) ? body : [body]) push(part);
    push("\nendobj\n");
  };

  // 객체 번호: 1 카탈로그, 2 페이지 목록, 쪽마다 (쪽, 내용, 이미지) 3개씩
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pg, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    // 여백 안에 비율을 지켜 가장 크게, 위쪽 가운데 정렬
    const scale = Math.min((A4_W - MARGIN * 2) / pg.width, (A4_H - MARGIN * 2) / pg.height);
    const w = pg.width * scale;
    const h = pg.height * scale;
    const x = (A4_W - w) / 2;
    const y = A4_H - MARGIN - h;
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;

    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    obj(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`,
      pg.jpeg,
      "\nendstream",
    ]);
  });

  const total = 3 + pages.length * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export async function downloadPlanPdf(days: ExportDay[], title: string, subtitle: string, fileName: string) {
  const pages: { jpeg: Uint8Array; width: number; height: number }[] = [];
  const pageCount = Math.ceil(days.length / DAYS_PER_PAGE);
  for (let i = 0; i < days.length; i += DAYS_PER_PAGE) {
    const part = days.slice(i, i + DAYS_PER_PAGE);
    const pageNote = pageCount > 1 ? ` · ${i / DAYS_PER_PAGE + 1}/${pageCount}쪽` : "";
    const canvas = await drawPlanImage(part, title, `${subtitle}${pageNote}`, i / 7 + 1);
    pages.push({ jpeg: await canvasToJpeg(canvas), width: canvas.width, height: canvas.height });
  }
  downloadBlob(buildPdf(pages), fileName);
}