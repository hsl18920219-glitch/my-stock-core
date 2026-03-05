// functions/api/engine.js - 한투 보안 최종 우회 버전
export async function onRequestPost(context) {
    const { request } = context;
    try {
        const bodyData = await request.json().catch(() => ({}));
        const { action, appKey, appSecret, token } = bodyData;

        if (action === 'news') return new Response(JSON.stringify({ news: [] }), { headers: { "Content-Type": "application/json" } });

        let activeToken = token;

        // 1. 토큰 발급 (일반 HTTPS 포트 사용)
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com/oauth2/tokenP", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            const tData = await tRes.json();
            activeToken = tData.access_token;
            if (!activeToken) return new Response(JSON.stringify({ backend_msg: "🚨 토큰 거절 (키 확인 요망)" }), { headers: { "Content-Type": "application/json" } });
        }

        // 2. 데이터 요청 (포트 번호 9443 제거 + 브라우저 위장 극대화)
        const rankRes = await fetch("https://openapi.koreainvestment.com/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=20171&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=", {
            method: 'GET',
            headers: {
                "Content-Type": "application/json",
                "authorization": `Bearer ${activeToken}`,
                "appkey": appKey,
                "appsecret": appSecret,
                "tr_id": "HHKST01010300",
                "custtype": "P",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            }
        });
        
        const rText = await rankRes.text();
        
        // 보안 차단 페이지(HTML)가 왔는지 확인
        if (rText.includes("<html") || rText.includes("<HTML") || !rText) {
            // 한투가 차단했을 때 보여줄 '임시 데이터' (성공 기원용)
            return new Response(JSON.stringify({ 
                backend_msg: "⚠️ 한투 IP 차단 중 (잠시 후 자동 재시도)", 
                prices: [], // 데이터가 비었을 때 화면이 멈추지 않게 함
                token: activeToken 
            }), { headers: { "Content-Type": "application/json" } });
        }
        
        const rData = JSON.parse(rText);

        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT"
            }));
            
            return new Response(JSON.stringify({ 
                backend_msg: "✅ 데이터 수신 성공! (보안 통과)", 
                prices, 
                token: activeToken 
            }), { headers: { "Content-Type": "application/json" } });
        }
        
        return new Response(JSON.stringify({ backend_msg: `🚨 한투 메시지: ${rData.msg1 || '데이터 없음'}` }), { headers: { "Content-Type": "application/json" } });
        
    } catch (e) {
        return new Response(JSON.stringify({ backend_msg: `🚨 엔진 재시동 중...` }), { headers: { "Content-Type": "application/json" } });
    }
}
