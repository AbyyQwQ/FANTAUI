/* ============================================================
 * main.js — 页面入口
 * 这里只放业务/演示逻辑，布局显隐交给 shell.js
 * ============================================================ */

// 主内容区滚动时给顶栏加投影（可删）
const main = document.querySelector('.main');

main?.addEventListener('scroll', () => {
  document.body.classList.toggle('is-scrolled', main.scrollTop > 4);
}, { passive: true });
