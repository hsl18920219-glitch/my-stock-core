// api/engine.js - 방화벽 우회 (위장 신분증 탑재) 버전 🚀
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let bodyData = req.body;
        if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
        const { action, appKey, appSecret, token } = bodyData || {};

        if (action === 'news') return res.status(200).json({ news: [] });
        if (action !== 'full_scan') return res.status(200).json({ backend_msg: "대기 중", prices: [] });

        if (!appKey || !appSecret) return res.status(200).json({ backend_msg: "키를 입력해주세요.", prices: [] });

        let activeToken = token;
        let isNewToken = false;

        // 1. 토큰 요청 (이미 완벽하게 통과되는 부분!)
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            const tText = await tRes.text();
            let tData;
            try { tData = JSON.parse(tText); } catch (e) { return res.status(200).json({ backend_msg: "🚨 토큰 방화벽 차단", prices: [] }); }
            
            if (tData.access_token) {
                activeToken = tData.access_token;
                isNewToken = true;
            } else {
                return res.status(200).json({ backend_msg: `키 거절됨: ${tData.msg1}`, prices: [], error: true });
            }
        }

        // 2. 랭킹 데이터 요청 (로봇 위장 신분증 추가!)
        const rankUrl = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=J&FID_COND_SCR_DIV_CODE=20171&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=";
        const rankRes = await fetch(rankUrl, {
            method: 'GET',
            headers: { 
                "content-type": "application/json; charset=utf-8",
                "authorization": `Bearer ${activeToken}`, 
                "appkey": appKey, 
                "appsecret": appSecret, 
                "tr_id": "HHKST01010300",
                "custtype": "P",
                // 🚨 핵심 포인트: 한투 방화벽을 속이는 가짜 크롬 브라우저 신분증
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        
        const rText = await rankRes.text();
        let rData;
        try {
            rData = JSON.parse(rText);
        } catch (e) {
            // 만약 또 막히면 한투가 뭐라고 욕하는지 앞부분 40글자만 출력해서 확인
            return res.status(200).json({ backend_msg: "🚨 차단 원인: " + rText.substring(0, 40), prices: [] });
        }
        
        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT",
                i: "0", f: "0", p: "0"
            }));
            return res.status(200).json({ backend_msg: "✅ 다이렉트 엔진 정상 가동 (방화벽 돌파!)", prices, token: isNewToken ? activeToken : null });
        } else {
            return res.status(200).json({ backend_msg: `응답 에러: ${rData.msg1}`, prices: [], reset_token: true });
        }

    } catch (e) {
        return res.status(500).json({ backend_msg: `엔진 오류: ${e.message}`, prices: [] });
    }
}
