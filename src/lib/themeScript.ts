// 화면을 그리기 전에 html[data-theme]를 정하는 인라인 스크립트 (layout.tsx <head>에서 실행).
// 저장된 선택(localStorage 'theme')이 있으면 그것, 없으면 기기 설정을 따른다.
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;
