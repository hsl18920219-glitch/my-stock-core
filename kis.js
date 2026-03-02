// Vercel 환경에 최적화된 완전체 엔진
export const config = { runtime: 'nodejs' }; // 안정적인 실행을 위해 nodejs 설정

export default async function handler(req, res) {
  // 1. Vercel 금고(환경변수)에서 열쇠 꺼내기
  const appKey = process.env.kis_key;
  const appSecret = process.env.kis_secret;

  // 2. 요청 데이터 파싱
  let body = {};
  try {
    if (req.method === 'POST') {
      body = req.body;
    }
  } catch (e) { console.log("Body parse error"); }

  const codes = body.codes || ['005930', '000660']; // 기본값: 삼성, 하이닉스

  try {
    // 3. 한투 토큰 발급 (한투 열쇠가 있을 때만 시도)
    if (appKey && appSecret) {
      const authRes = await fetch('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
      });
      const authData = await authRes.json();
      const token = authData.access_token;

      if (token) {
        // 4. 한투 데이터 가져오기 성공 시
        const results = await Promise.all(codes.map(async (code) => {
          const priceRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?fid_cond_mrkt_div_code=J&fid_input_iscd=${code}`, {
            headers: {
              'authorization': `Bearer ${token}`,
              'appkey': appKey,
              'appsecret': appSecret,
              'tr_id': 'FHKST01010100'
            }
          });
          const d = await priceRes.json();
          return {
            code,
            name: d.output?.hts_kor_isnm || "종목명",
            price: d.output?.stck_prpr || "0",
            diff: d.output?.prdy_ctrt || "0",
            engine: "1차 한투 엔진 🚀"
          };
        }));

        return res.status(200).json({ success: true, prices: results });
      }
    }

    // 5. 한투 열쇠가 없거나 실패 시 '무적의 야후'로 자동 전환
    const yahooRes = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=005930.KS,000660.KS`);
    const yahooData = await yahooRes.json();
    const quotes = yahooData.quoteResponse.result;

    const backupResults = quotes.map(q => ({
      name: q.symbol === '005930.KS' ? '삼성전자' : 'SK하이닉스',
      price: q.regularMarketPrice.toLocaleString(),
      diff: q.regularMarketChangePercent.toFixed(2),
      engine: "2차 야후 백업 가동 중 ⚠️"
    }));

    return res.status(200).json({ success: true, prices: backupResults });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
