// functions/api/engine.js - 진짜 에러 원인 추적 버전
export async function onRequestPost(context) {
    const { request } = context;
    try {
        const bodyData = await request.json().catch(() => ({}));
        const { appKey, appSecret, token } = bodyData;

        // 1. 토큰 발급 시도
        const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
        });
        
        const tData = await tRes.json();
        const activeToken = tData.access_token;

        if (!activeToken) {
            return new Response(JSON.stringify({ backend_msg: `🚨 한투거절: ${tData.msg1 || '키확인필요'}` }), { headers: { "Content-Type": "application/json" } });
        }

        // 2. 데이터 요청 시도
        const rankRes = await fetch("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=20171&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=", {
            headers: {
                "authorization": `Bearer ${activeToken}`,
                "appkey": appKey, "appsecret": appSecret,
                "tr_id": "HHKST01010300", "custtype": "P"
            }
        });
        
        const rData = await rankRes.json();
        return new Response(JSON.stringify({ backend_msg: "✅ 성공!", prices: rData.output.slice(0, 100).map((item, i) => ({ sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm, price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), signal: "WAIT" })), token: activeToken }), { headers: { "Content-Type": "application/json" } });

    } catch (e) {
        // [중요] 여기서 뽀록이 납니다. "Failed to fetch"가 뜨면 IP 차단입니다.
        return new Response(JSON.stringify({ backend_msg: `🚨 진짜원인: ${e.message}` }), { headers: { "Content-Type": "application/json" } });
    }
}
