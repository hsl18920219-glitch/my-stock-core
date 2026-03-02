// api/engine.js (이 내용으로 싹 교체하세요!)
let cachedToken = null;
let tokenExpiry = 0;
let lastAttemptTime = 0;

export default async function handler(req, res) {
    // CORS 설정 (브라우저 허용)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { action, appKey, appSecret } = req.body;
        if (action !== 'full_scan') return res.status(200).json({ prices: [] });

        let prices = [];
        let indices = { kp: { p: "0", d: "0" }, kd: { p: "0", d: "0" } };
        const now = Date.now();

        // 1. 한투 시도
        if (appKey && appSecret) {
            try {
                const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
                });

                const tData = await tRes.json();
                if (tData.access_token) {
                    cachedToken = tData.access_token;
                    // 랭킹 조회
                    const rankRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=`, {
                        headers: { "Content-Type": "application/json", "authorization": `Bearer ${cachedToken}`, "appkey": appKey, "appsecret": appSecret, "tr_id": "HHKST01010300" }
                    });
                    
                    const rData = await rankRes.json();
                    if (rData.rt_cd === '0') {
                        prices = (rData.output || []).slice(0, 100).map((item, i) => ({
                            sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                            price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000),
                            signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                        }));
                        return res.status(200).json({ backend_msg: "1차 한투 엔진 가동 중 🚀", prices, indices });
                    }
                }
            } catch (e) { console.log("한투 실패:", e.message); }
        }

        // 2. 네이버 백업 가동
        const BACKUP = ["005930", "000660", "373220", "207940", "005380", "068270", "000270", "005490", "105560", "035420"];
        for (let i = 0; i < BACKUP.length; i++) {
            try {
                const nr = await fetch(`https://polling.finance.naver.com/api/realtime/site/main?symbol=${BACKUP[i]}`);
                const nd = await nr.json();
                const o = nd.result.areas[0].datas[0];
                prices.push({
                    sectorId: i + 1, c: BACKUP[i], n: o.nm, price: o.nv, diff: o.cr, v: Math.floor(o.aq / 1000000),
                    signal: Number(o.cr) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                });
            } catch (e) { continue; }
        }

        return res.status(200).json({ backend_msg: "2차 네이버 백업 가동 중 ⚠️", prices, indices });

    } catch (e) {
        return res.status(500).json({ backend_msg: "엔진 오류", prices: [] });
    }
}
