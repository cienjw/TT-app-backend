const axios = require('axios');
const MODEL = 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function callGemini(prompt) {
  const { data } = await axios.post(
    URL,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        thinkingConfig: { thinkingBudget: 0 },   // ← 2.5-flash thinking off (속도 핵심)
        maxOutputTokens: 500,
        temperature: 1.0,
      },
    },
    { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' } }
  );
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// 방 생성 시: 공통 관심사로 아이스브레이커 3개
exports.generateIcebreakers = async (interests) => {
  const prompt =
`너는 내향적인 사람들의 첫 만남을 돕는 진행자야.
공통 관심사: ${interests.join(', ')}
이 관심사를 가진 3~5명 소모임을 위한 가벼운 대화 시작 질문 3개를 만들어줘.
부담 없고 누구나 답할 수 있게. 번호나 설명 없이, 질문 3개만 줄바꿈으로 구분해서 출력해.`;
  const text = await callGemini(prompt);
  return text.split('\n').map(s => s.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3);
};

// 대화 조언: 최근 대화 보고 던질 만한 한마디 제안
exports.getConversationTip = async (recentMessages, interests) => {
  const convo = recentMessages.map(m => `${m.nickname}: ${m.content}`).join('\n') || '(아직 대화 없음)';
  const prompt =
`너는 내향적인 사람이 그룹 대화에 자연스럽게 낄 수 있게 돕는 코치야.
최근 대화:
${convo}

이 그룹 공통 관심사: ${interests.join(', ')}

지금 사용자가 자연스럽게 던질 만한 한마디나 질문을 따옴표 안에 바로 쓸 수 있는 문장으로 1~2개만 제안해. 짧고 부담 없게.`;
  return await callGemini(prompt);
};