// api/engine.js - 한투 공식 VIP 전용 엔진 (우회 없음, 오직 정면 돌파)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let bodyData = req.body;
        if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
        const { action, appKey, appSecret, token } = bodyData || {};

        if (action === 'news') {
            return res.status(200).json({ news: [{ title: "[시스템] 한투 VIP 엔진 가동 중 🚀", publisher: "Core System", time: new Date().toLocaleTimeString('ko-KR') }] });
        }
        if (action !== 'full_scan') return res.status(200).json({ backend_msg: "대기 중", prices: [] });

        let activeToken = token;
        let isNewToken = false;

        // 1. 발급된 출입증(토큰)이 없으면 새로 발급
        if (!activeToken && appKey && appSecret) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            const tData = await tRes.json();
            if (tData.access_token) {
                activeToken = tData.access_token;
                isNewToken = true;
            }
        }

        if (activeToken) {
            // 2. 🚨 핵심: custtype "P" (개인고객) 신분증을 달고 당당하게 요청!
            const rankRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=`, {
                headers: { 
                    "Content-Type": "application/json", 
                    "authorization": `Bearer ${activeToken}`, 
                    "appkey": appKey, 
                    "appsecret": appSecret, 
                    "tr_id": "HHKST01010300",
                    "custtype": "P"  // 👉 이게 없어서 그동안 튕겼던 겁니다!
                }
            });
            const rData = await rankRes.json();
            
            if (rData.rt_cd === '0' && rData.output && rData.output.length > 0) {
                let prices = rData.output.slice(0, 100).map((item, i) => ({
                    sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                    price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                    signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                }));
                // 지수는 한투 랭킹 API에 없으므로 임시 표시
                let indices = { kp: { p: "ON", d: "0.00" }, kd: { p: "ON", d: "0.00" } };
                return res.status(200).json({ backend_msg: "🚀 한투 VIP 엔진 가동 중", prices, indices, token: isNewToken ? activeToken : null });
            } else {
                // 토큰 만료 등 에러 시 토큰 리셋 신호 보냄
                return res.status(200).json({ backend_msg: "한투 연결 지연 (토큰 재발급 필요)", prices: [], reset_token: true });
            }
        }

        return res.status(200).json({ backend_msg: "한투 AppKey/SecretKey가 설정되지 않았습니다.", prices: [] });

    } catch (e) {
        return res.status(500).json({ backend_msg: "최종 엔진 오류", prices: [] });
    }
}
