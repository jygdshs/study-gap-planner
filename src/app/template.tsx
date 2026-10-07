// 화면 전환 애니메이션용 감싸개.
// layout.tsx와 달리 template.tsx는 메뉴로 다른 화면에 갈 때마다 새로 마운트된다.
// → .page-enter 아래 요소들이 globals.css의 전환 애니메이션을 한 번씩 재생한다.
// (상단 메뉴와 진남색 띠는 움직이지 않고, 제목과 시트만 떠오른다)

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
