// functions/api/engine.js (에러 정밀 진단 버전)
export async function onRequestPost(context) {
    const { request } = context;
    try {
        const bodyData = await request.json();
        const { action, appKey, appSecret, token } = bodyData || {};

        if (action === 'news') return new Response(JSON.stringify({ news: [] }), { headers: { "Content-Type": "application/json" } });

        // 1. 토큰 발급 단계 (여기서 거절당하고 계신 겁니다)
        const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
        });
        
        const tData = await tRes.json();
        
        // [중요] 한투가 보내는 진짜 에러 메시지를 화면에 찍어줍니다.
        if (!tData.access_token) {
            let reason = tData.error_description || tData.msg1 || "알 수 없는 이유";
            let code = tData.error_code || "코드없음";
            return new Response(JSON.stringify({ 
                backend_msg: `🚨 한투 거절: [${code}] ${reason}`, 
                prices: [] 
            }), { headers: { "Content-Type": "application/json" } });
        }

        // 2. 성공 시 데이터 가져오기 (생략 - 위 단계가 통과되어야 함)
        return new Response(JSON.stringify({ backend_msg: "✅ 인증 성공! 데이터 불러오는 중...", prices: [], token: tData.access_token }), { headers: { "Content-Type": "application/json" } });

    } catch (e) {
        return new Response(JSON.stringify({ backend_msg: `🚨 엔진 오류: ${e.message}` }), { headers: { "Content-Type": "application/json" } });
    }
}
