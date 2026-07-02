// 홈페이지 인터랙션 (스크롤 그림자, CTA → 챗봇 열기)

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.kf-nav');
  window.addEventListener(
    'scroll',
    () => {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    },
    { passive: true }
  );

  document.querySelectorAll('[data-open-chat]').forEach((el) => {
    el.addEventListener('click', () => window.openChatbot());
  });
});
