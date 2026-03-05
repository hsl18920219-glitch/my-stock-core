// functions/api/engine.js - 한투의 민낯을 확인하는 코드
export async function onRequestPost(context) {
    const { request } = context;
    try {
        const bodyData = await request.json().catch(() => ({}));
        const { appKey, appSecret } = bodyData;

        // 1. 토큰 발급 시도 및 결과 확인
        const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
        });
        
        const tText = await tRes.text(); // JSON으로 받지 말고 일단 텍스트로!
        
        if (tText.includes("<!DOCTYPE") || tText.includes("<html")) {
            return new Response(JSON.stringify({ backend_msg: "🚨 한투 보안벽: HTML 차단 페이지가 전송됨 (해외IP 차단)" }), { headers: { "Content-Type": "application/json" } });
        }

        const tData = JSON.parse(tText);
        const activeToken = tData.access_token;

        if (!activeToken) {
            return new Response(JSON.stringify({ backend_msg: `🚨 한투거절: ${tText.substring(0, 50)}` }), { headers: { "Content-Type": "application/json" } });
        }

        // 2. 데이터 요청 시도
        const rankRes = await fetch("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=20171&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=", {
            headers: {
                "authorization": `Bearer ${activeToken}`,
                "appkey": appKey, "appsecret": appSecret,
                "tr_id": "HHKST01010300", "custtype": "P",
                "User-Agent": "Mozilla/5.0"
            }
        });
        
        const rText = await rankRes.text(); // 데이터도 일단 텍스트로!
        
        if (rText.length < 10) {
            return new Response(JSON.stringify({ backend_msg: `🚨 한투 침묵: 빈 응답이 옴 (네트워크 차단 가능성)` }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ backend_msg: `✅ 원시데이터: ${rText.substring(0, 100)}` }), { headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ backend_msg: `🚨 진짜원인: ${e.message}` }), { headers: { "Content-Type": "application/json" } });
    }
}
