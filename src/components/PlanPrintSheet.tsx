"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cellText, shortDate, type ExportDay } from "@/lib/exportPlan";

// 인쇄(PDF로 저장)할 때만 보이는 계획표. 화면에는 보이지 않는다.
// body 바로 아래로 옮겨 두고, 인쇄할 때는 globals.css의 @media print 규칙이 나머지 화면을 숨긴다.
// 다크 모드여도 종이에는 밝은 색으로 찍히도록 색을 고정한다.

export default function PlanPrintSheet({ days, title, subtitle }: { days: ExportDay[]; title: string; subtitle: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="print-sheet" aria-hidden>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 12, color: "#46536A", margin: "4px 0 12px" }}>{subtitle}</p>
      <table>
        <thead>
          <tr>
            <th style={{ width: "13%" }}>날짜</th>
            <th style={{ width: "34%" }}>1교시</th>
            <th style={{ width: "34%" }}>2교시</th>
            <th style={{ width: "9%" }}>시간</th>
            <th style={{ width: "10%" }}>완료</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>
                <strong>
                  {shortDate(d.date)} {d.dayLabel}
                </strong>
                {d.exams.map((ex) => (
                  <span key={ex.name} className="print-exam" style={{ backgroundColor: ex.color }}>
                    {ex.name} 시험
                  </span>
                ))}
              </td>
              {d.rest ? (
                <td colSpan={2} style={{ color: "#5F6B7E" }}>
                  쉬는 날
                </td>
              ) : (
                d.cells.map((c, i) => (
                  <td key={i}>
                    {c ? (
                      <span className="print-cell">
                        <span className="print-chip" style={{ backgroundColor: c.color }} />
                        <span>
                          {cellText(c)}
                          {c.carried && " · 이월"}
                          {!c.saved && <em> (추천)</em>}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                ))
              )}
              <td>{d.hours}시간</td>
              <td>
                {d.rest
                  ? ""
                  : d.cells
                      .filter((c): c is NonNullable<typeof c> => c !== null)
                      .map((c) => (c.completed ? "☑" : "☐"))
                      .join(" ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "#5F6B7E", marginTop: 10 }}>
        (추천)은 아직 저장하지 않은 칸 · 이월은 지난 날 못 한 공부를 옮긴 칸 · 학습 공백 분석 및 개인별 학습 계획
      </p>
    </div>,
    document.body
  );
}
