// functions/api/engine.js - 최종 울트라 안정화 버전
export async function onRequestPost(context) {
    const { request } = context;
    try {
        const bodyData = await request.json().catch(() => ({}));
        const { action, appKey, appSecret, token } = bodyData;

        if (action === 'news') return new Response(JSON.stringify({ news: [] }), { headers: { "Content-Type": "application/json" } });

        let activeToken = token;

        // 1. 토큰 발급 (주머니에 토큰이 없을 때만 실행)
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            
            const tText = await tRes.text(); // 일단 텍스트로 받기
            if (!tText) throw new Error("한투에서 토큰 응답이 비어있습니다.");
            
            const tData = JSON.parse(tText);
            activeToken = tData.access_token;

            if (!activeToken) {
                return new Response(JSON.stringify({ backend_msg: "🚨 토큰 발급 실패: " + (tData.msg1 || "키 확인") }), { headers: { "Content-Type": "application/json" } });
            }
        }

        // 2. 데이터 요청
        const rankRes = await fetch("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=20171&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=", {
            headers: {
                "content-type": "application/json; charset=utf-8",
                "authorization": `Bearer ${activeToken}`,
                "appkey": appKey,
                "appsecret": appSecret,
                "tr_id": "HHKST01010300",
                "custtype": "P",
                "User-Agent": "Mozilla/5.0"
            }
        });
        
        const rText = await rankRes.text(); // 일단 텍스트로 받기
        if (!rText) throw new Error("한투에서 종목 데이터 응답이 비어있습니다.");
        
        const rData = JSON.parse(rText);

        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT"
            }));
            
            return new Response(JSON.stringify({ 
                backend_msg: "✅ 전광판 데이터 동기화 완료!", 
                prices, 
                token: activeToken 
            }), { headers: { "Content-Type": "application/json" } });
        }
        
        return new Response(JSON.stringify({ backend_msg: `🚨 한투 메시지: ${rData.msg1 || '데이터 없음'}`, reset_token: true }), { headers: { "Content-Type": "application/json" } });
        
    } catch (e) {
        // 에러 발생 시 상세 이유를 전광판에 표시
        return new Response(JSON.stringify({ backend_msg: `🚨 엔진 재가동 필요: ${e.message}` }), { headers: { "Content-Type": "application/json" } });
    }
}
