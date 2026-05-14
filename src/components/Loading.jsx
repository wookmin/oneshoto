import { useEffect, useState } from 'react';

const messages = [
  '여행지 물가 분석 중...',
  '일일 식비 예산 계산 중...',
  '딱 맞는 식당 찾는 중...',
  '교통 경로 확인 중...',
];

function Loading() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 1500);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="panel loading-panel">
      <div className="spinner" aria-hidden="true" />
      <h2>추천 준비 중</h2>
      <p className="loading-message">{messages[messageIndex]}</p>
      <div className="loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

export default Loading;
