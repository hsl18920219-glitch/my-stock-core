// functions/api/engine.js
export async function onRequestPost(context) {
    const { request } = context;
    try {
        const bodyData = await request.json();
        const { action, appKey, appSecret, token } = bodyData || {};

        if (action === 'news') return new Response(JSON.stringify({ news: [] }), { headers: { "Content-Type": "application/json" } });

        let activeToken = token;
        let isNewToken = false;

        // 1. 토큰이 없거나 만료되었을 때만 새로 받기
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            const tData = await tRes.json();
            activeToken = tData.access_token;
            isNewToken = true;

            if (!activeToken) {
                return new Response(JSON.stringify({ backend_msg: "🚨 토큰 발급 실패 (키 확인 필요)" }), { headers: { "Content-Type": "application/json" } });
            }
        }

        // 2. 실시간 데이터 가져오기 (랭킹 순위 100개)
        const rankRes = await fetch("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=20171&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=", {
            headers: {
                "content-type": "application/json; charset=utf-8",
                "authorization": `Bearer ${activeToken}`,
                "appkey": appKey,
                "appsecret": appSecret,
                "tr_id": "HHKST01010300",
                "custtype": "P",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        
        const rData = await rankRes.json();

        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT"
            }));
            
            // 성공 시 데이터와 함께 (혹시 새로 받았다면) 토큰을 돌려줌
            return new Response(JSON.stringify({ 
                backend_msg: "✅ 다이렉트 엔진 정상 가동 중!", 
                prices, 
                token: activeToken // 이 토큰을 화면(브라우저)이 기억하게 함
            }), { headers: { "Content-Type": "application/json" } });
        }
        
        // 토큰이 잘못된 경우를 대비해 화면에 에러 전송
        return new Response(JSON.stringify({ backend_msg: `🚨 데이터 오류: ${rData.msg1}`, reset_token: true }), { headers: { "Content-Type": "application/json" } });
        
    } catch (e) {
        return new Response(JSON.stringify({ backend_msg: `🚨 엔진 장애: ${e.message}` }), { headers: { "Content-Type": "application/json" } });
    }
}
