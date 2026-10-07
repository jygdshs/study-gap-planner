// 계획 내보내기: 계획 기간 전체를 이미지(PNG)로 저장하거나 인쇄(PDF로 저장)한다.
//  - 저장된 칸이 있으면 저장된 칸, 없으면 추천 칸을 쓴다 (화면 시간표와 같은 규칙)
//  - 이미지는 외부 라이브러리 없이 canvas에 직접 그린다. 화면 테마와 상관없이 항상 밝은 종이색.

import type { PlanData } from "@/lib/usePlanData";
import { colorOf } from "@/lib/palette";
import { formatMinutes } from "@/lib/allocation";

export interface ExportCell {
  subjectName: string;
  unit: string;
  color: string;
  minutes: number | null;
  saved: boolean;
  completed: boolean;
  carried: boolean;
}

export interface ExportDay {
  date: string;
  dayLabel: string;
  hours: number;
  exams: { name: string; color: string }[];
  rest: boolean;
  cells: (ExportCell | null)[]; // [1교시, 2교시]
}

export const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

export function buildExportDays(data: PlanData): ExportDay[] {
  const { planDays, savedAt, minutesFor, colors, subjectNameById, isRestDay } = data;
  return planDays.map((day) => {
    const minutes = minutesFor(day);
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
      };
    });
    return {
      date: day.date,
      dayLabel: day.dayLabel,
      hours: day.availableHours,
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

export async function drawPlanImage(days: ExportDay[], title: string, subtitle: string): Promise<HTMLCanvasElement> {
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
    ctx.fillText(`${wi + 1}주차`, x0 + LABEL / 2, y0 + HEAD_H / 2 + 5);
    ["1교시", "2교시"].forEach((t, i) => ctx.fillText(t, x0 + LABEL / 2, y0 + HEAD_H + SLOT_H * i + SLOT_H / 2 + 5));
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
          if (cell.minutes) {
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
      ctx.fillText(`${day.hours}시간`, cx + colW / 2, y0 + HEAD_H + SLOT_H * 2 + HOURS_H / 2 + 5);
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

export async function downloadPlanImage(days: ExportDay[], title: string, subtitle: string, fileName: string) {
  const canvas = await drawPlanImage(days, title, subtitle);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했어요.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 인쇄용 한 줄 설명: "수학 1계 미분방정식 · 70분" */
export function cellText(cell: ExportCell): string {
  return `${cell.subjectName} ${cell.unit}${cell.minutes ? ` · ${formatMinutes(cell.minutes)}` : ""}`;
}
