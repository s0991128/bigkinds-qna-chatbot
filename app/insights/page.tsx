"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { INSIGHTS_KEY, summarizeInsights } from "../../lib/insights";

export default function InsightsPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const events = JSON.parse(window.localStorage.getItem(INSIGHTS_KEY) || "[]");
        setCounts(summarizeInsights(Array.isArray(events) ? events : []));
      } catch { setCounts({}); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const cards = [
    ["총 이용건수", Object.values(counts).reduce((sum, value) => sum + value, 0)],
    ["FAQ 답변", counts.FAQ_ANSWERED || 0],
    ["검색 코치", counts.SEARCH_COACH_USED || 0],
    ["기능 추천", counts.FEATURE_RECOMMENDED || 0],
    ["자료 찾기", counts.ARTICLE_LOOKUP_STARTED || 0],
    ["자료 찾기 미확인", counts.ARTICLE_LOOKUP_NO_RESULT || 0],
    ["매뉴얼 안내", counts.MANUAL_GUIDE_USED || 0],
    ["지원 문의 시작", counts.SUPPORT_CASE_STARTED || 0],
    ["복합 지원 문의", counts.MULTI_ISSUE_SUPPORT || 0],
    ["검색 필터 문제", counts.SEARCH_FILTER_PROBLEM || 0],
    ["회원·이메일 문제", counts.MEMBERSHIP_EMAIL_PROBLEM || 0],
    ["오디오 재생 문제", counts.AUDIO_PLAYBACK_PROBLEM || 0],
    ["저작권 문의", counts.RIGHTS_LICENSE_INQUIRY || 0],
    ["연구 이용 문의", counts.RIGHTS_RESEARCH_INQUIRY || 0],
    ["지원 이관", counts.SUPPORT_ESCALATED || 0],
    ["문제 해결", (counts.SEARCH_DIAGNOSIS_USED || 0) + (counts.TROUBLESHOOT_USED || 0)],
    ["공식문서 미일치", counts.NO_CONFIDENT_MATCH || 0],
    ["OPEN API 이관", counts.OPEN_API_REDIRECT || 0],
    ["Gemini fallback", counts.GEMINI_UNAVAILABLE || 0],
  ] as const;
  const decisionCards = [
    ["Hard Rule", counts.ROUTE_HARD_RULE || 0],
    ["Deterministic", counts.ROUTE_DETERMINISTIC || 0],
    ["Knowledge", counts.ROUTE_KNOWLEDGE || 0],
    ["LLM", counts.ROUTE_LLM || 0],
  ] as const;
  const answerCards = [
    ["Internal Engine", counts.ANSWER_INTERNAL_ENGINE || 0],
    ["LLM Generated", counts.ANSWER_LLM_GENERATED || 0],
  ] as const;
  const recommendationCards = [
    ["Context Rule", counts.RECOMMENDATION_CONTEXT_RULE || 0],
    ["LLM Rerank", counts.RECOMMENDATION_LLM_RERANK || 0],
  ] as const;
  return <main className="insights-page">
    <header className="insights-header"><Link href="/">← 챗봇으로 돌아가기</Link><span>빅카인즈 Q&amp;A · PoC</span></header>
    <section className="insights-content">
      <p className="section-label">운영 인사이트</p>
      <h1>반복되는 문의와 병목을 확인하세요</h1>
      <p className="insights-description">질문 원문은 저장하지 않고, 익명 이벤트 수만 이 브라우저에 기록합니다.</p>
      <div className="insights-grid">{cards.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
      <section className="insights-breakdown" aria-labelledby="decision-insights-title">
        <div><p className="section-label">ROUTING</p><h2 id="decision-insights-title">판단 방식</h2></div>
        <div className="insights-mini-grid">{decisionCards.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
      </section>
      <section className="insights-breakdown" aria-labelledby="answer-origin-title">
        <div><p className="section-label">PROVENANCE</p><h2 id="answer-origin-title">답변 생성 방식</h2></div>
        <div className="insights-mini-grid">{answerCards.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
      </section>
      <section className="insights-breakdown" aria-labelledby="recommendation-source-title">
        <div><p className="section-label">RECOMMENDATION</p><h2 id="recommendation-source-title">추천 결정 방식</h2></div>
        <div className="insights-mini-grid">{recommendationCards.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
      </section>
    </section>
  </main>;
}
