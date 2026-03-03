// api/engine.js - CSI 수사반장 디버깅 버전 🚀
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

        // 1. 토큰 요청
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            
            // 🚨 한투가 JSON이 아닌 HTML(방화벽 에러)을 던지는지 확인!
            const tText = await tRes.text();
            let tData;
            try {
                tData = JSON.parse(tText);
            } catch (e) {
                return res.status(200).json({ backend_msg: "🚨 한투 방화벽이 Vercel을 튕겨냄 (해외IP 허용 필수)", prices: [] });
            }
            
            if (tData.access_token) {
                activeToken = tData.access_token;
                isNewToken = true;
            } else {
                return res.status(200).json({ backend_msg: `키 거절됨: ${tData.msg1 || '이유 알 수 없음'}`, prices: [], error: true });
            }
        }

        // 2. 랭킹 데이터 요청
        const rankUrl = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=";
        const rankRes = await fetch(rankUrl, {
            method: 'GET',
            headers: { 
                "authorization": `Bearer ${activeToken}`, 
                "appkey": appKey, 
                "appsecret": appSecret, 
                "tr_id": "HHKST01010300",
                "custtype": "P" 
            }
        });
        
        // 🚨 랭킹 데이터 요청 시 터지는지 확인!
        const rText = await rankRes.text();
        let rData;
        try {
            rData = JSON.parse(rText);
        } catch (e) {
            return res.status(200).json({ backend_msg: "🚨 랭킹 데이터 파싱 실패 (방화벽 차단 의심)", prices: [] });
        }
        
        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT",
                i: "0", f: "0", p: "0"
            }));
            return res.status(200).json({ backend_msg: "✅ 다이렉트 엔진 정상 가동", prices, token: isNewToken ? activeToken : null });
        } else {
            return res.status(200).json({ backend_msg: `응답 에러: ${rData.msg1}`, prices: [], reset_token: true });
        }

    } catch (e) {
        // 🚨 Vercel 서버 자체 에러 메시지 띄우기
        return res.status(500).json({ backend_msg: `엔진 크래시: ${e.message}`, prices: [] });
    }
}
