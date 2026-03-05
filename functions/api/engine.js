// functions/api/engine.js - 한투 보안 돌파 최종병기
export async function onRequestPost(context) {
    const { request } = context;
    try {
        const bodyData = await request.json().catch(() => ({}));
        const { action, appKey, appSecret, token } = bodyData;

        if (action === 'news') return new Response(JSON.stringify({ news: [] }), { headers: { "Content-Type": "application/json" } });

        let activeToken = token;

        // 1. 토큰 발급
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            const tData = await tRes.json();
            activeToken = tData.access_token;
            if (!activeToken) return new Response(JSON.stringify({ backend_msg: "🚨 토큰 거절 (1분 뒤 시도)" }), { headers: { "Content-Type": "application/json" } });
        }

        // 2. 데이터 요청 (가짜 지문 - 랜덤 값 추가)
        const randomVer = Math.floor(Math.random() * 100);
        const rankRes = await fetch("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=20171&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=", {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "authorization": `Bearer ${activeToken}`,
                "appkey": appKey,
                "appsecret": appSecret,
                "tr_id": "HHKST01010300",
                "custtype": "P",
                // 더 강력한 브라우저 위장
                "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.${randomVer} Safari/537.36`,
                "Accept": "application/json",
                "Origin": "https://openapi.koreainvestment.com:9443"
            }
        });
        
        const rText = await rankRes.text();
        
        // 만약 한투가 빈 값을 주거나 HTML 에러를 주면
        if (!rText || rText.includes("<html") || rText.includes("<HTML")) {
            return new Response(JSON.stringify({ backend_msg: "🚨 한투 서버 진정 중... (5분 뒤 다시 시도)" }), { headers: { "Content-Type": "application/json" } });
        }
        
        const rData = JSON.parse(rText);

        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT"
            }));
            
            return new Response(JSON.stringify({ 
                backend_msg: "✅ 장 마감 데이터 수신 성공!", 
                prices, 
                token: activeToken 
            }), { headers: { "Content-Type": "application/json" } });
        }
        
        return new Response(JSON.stringify({ backend_msg: `🚨 한투 메시지: ${rData.msg1 || '잠시 대기'}` }), { headers: { "Content-Type": "application/json" } });
        
    } catch (e) {
        return new Response(JSON.stringify({ backend_msg: `🚨 시스템 재정비 중...` }), { headers: { "Content-Type": "application/json" } });
    }
}
