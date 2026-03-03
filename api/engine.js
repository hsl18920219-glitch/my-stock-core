// api/engine.js - 한투 공식 VIP 전용 단독 엔진 (야후/네이버 찌꺼기 제거 완결판)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let bodyData = req.body;
        if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
        const { action, appKey, appSecret, token } = bodyData || {};

        // 🚨 뉴스 요청 처리
        if (action === 'news') {
            return res.status(200).json({ 
                news: [{ title: "[시스템] 한투 VIP 정식 엔진 최적화 완료 🚀", publisher: "Core System", time: new Date().toLocaleTimeString('ko-KR') }] 
            });
        }

        if (action !== 'full_scan') return res.status(200).json({ backend_msg: "대기 중", prices: [] });

        let activeToken = token;
        let isNewToken = false;

        // 1. 발급된 출입증(토큰)이 없으면 한투에서 새로 발급 (5분 알림 방지의 핵심)
        if (!activeToken && appKey && appSecret) {
            try {
                const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
                });
                const tData = await tRes.json();
                if (tData.access_token) {
                    activeToken = tData.access_token;
                    isNewToken = true;
                }
            } catch (e) { console.log("토큰 발급 실패"); }
        }

        // 2. 토큰이 있으면 한투 랭킹 API 공식 호출
        if (activeToken) {
            try {
                const rankRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=`, {
                    headers: { 
                        "content-type": "application/json; charset=utf-8", 
                        "authorization": `Bearer ${activeToken}`, 
                        "appkey": appKey, 
                        "appsecret": appSecret, 
                        "tr_id": "HHKST01010300",
                        "custtype": "P"  // 🚨 한투가 튕겨냈던 진짜 이유! (개인고객 증명)
                    }
                });
                const rData = await rankRes.json();
                
                if (rData.rt_cd === '0' && rData.output && rData.output.length > 0) {
                    let prices = rData.output.slice(0, 100).map((item, i) => ({
                        sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                        price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                        signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                    }));
                    return res.status(200).json({ backend_msg: "🚀 한투 VIP 엔진 가동 중", prices, token: isNewToken ? activeToken : null });
                } else {
                    // 한투에서 에러를 뱉으면 (토큰 만료 등) 프론트에 토큰 지우라고 신호 보냄
                    return res.status(200).json({ backend_msg: "한투 연결 지연 (토큰 재발급 필요)", prices: [], reset_token: true });
                }
            } catch (e) { console.log("한투 데이터 로드 실패"); }
        }

        return res.status(200).json({ backend_msg: "한투 AppKey/SecretKey 확인 필요", prices: [] });

    } catch (e) {
        return res.status(500).json({ backend_msg: "최종 엔진 오류", prices: [] });
    }
}
