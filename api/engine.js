// api/engine.js - 지수 및 종목 백업 완벽 가동 버전
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let bodyData = req.body;
        if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
        const { action, appKey, appSecret } = bodyData || {};
        
        if (action !== 'full_scan') return res.status(200).json({ backend_msg: "대기 중", prices: [] });

        let prices = [];
        let indices = { kp: { p: "연결중", d: "0" }, kd: { p: "연결중", d: "0" } };

        // 1. 네이버에서 지수(KOSPI, KOSDAQ) 강제 추출
        try {
            const idxRes = await fetch("https://polling.finance.naver.com/api/realtime/site/main?symbol=KOSPI,KOSDAQ");
            const idxData = await idxRes.json();
            const kospi = idxData.result.areas[0].datas[0];
            const kosdaq = idxData.result.areas[0].datas[1];
            indices.kp = { p: kospi.nv.toLocaleString(), d: kospi.cr > 0 ? "+" + kospi.cr : kospi.cr };
            indices.kd = { p: kosdaq.nv.toLocaleString(), d: kosdaq.cr > 0 ? "+" + kosdaq.cr : kosdaq.cr };
        } catch (e) { console.log("지수 데이터 로드 실패"); }

        // 2. 한투 엔진 시도
        if (appKey && appSecret) {
            try {
                const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
                });
                const tData = await tRes.json();
                if (tData.access_token) {
                    const rankRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=`, {
                        headers: { "Content-Type": "application/json", "authorization": `Bearer ${tData.access_token}`, "appkey": appKey, "appsecret": appSecret, "tr_id": "HHKST01010300" }
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
            } catch (e) { }
        }

        // 3. 종목 백업 (네이버 실시간 시세)
        const BACKUP_CODES = ["005930", "000660", "373220", "207940", "005380", "068270", "000270", "005490", "105560", "035420"];
        for (let i = 0; i < BACKUP_CODES.length; i++) {
            try {
                const nr = await fetch(`https://polling.finance.naver.com/api/realtime/site/main?symbol=${BACKUP_CODES[i]}`);
                const nd = await nr.json();
                const o = nd.result.areas[0].datas[0];
                prices.push({
                    sectorId: (i % 15) + 1, c: BACKUP_CODES[i], n: o.nm, price: o.nv, diff: o.cr, v: Math.floor(o.aq / 1000000),
                    signal: Number(o.cr) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                });
            } catch (e) { continue; }
        }

        return res.status(200).json({ backend_msg: "2차 네이버 백업 가동 중 ⚠️", prices, indices });

    } catch (e) {
        return res.status(500).json({ backend_msg: "엔진 오류 발생", prices: [] });
    }
}
