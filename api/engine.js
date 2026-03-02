let cachedToken = null;
let tokenExpireTime = 0;

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
        let indices = { kp: { p: "2,650.00", d: "0.00" }, kd: { p: "870.00", d: "0.00" } };
        const BACKUP_CODES = ["005930", "000660", "373220", "207940", "005380", "068270", "000270", "005490", "105560", "035420"];
        const BACKUP_NAMES = ["삼성전자", "SK하이닉스", "LG에너지솔루션", "삼성바이오로직스", "현대차", "셀트리온", "기아", "POSCO홀딩스", "KB금융", "NAVER"];

        // 🚨 [공통] 지수는 무조건 야후에서 가장 먼저 가져옴
        try {
            const idxRes = await fetch("https://query1.finance.yahoo.com/v7/finance/quote?symbols=^KS11,^KQ11");
            const idxData = await idxRes.json();
            const kospi = idxData.quoteResponse.result[0];
            const kosdaq = idxData.quoteResponse.result[1];
            if(kospi) indices.kp = { p: kospi.regularMarketPrice.toLocaleString(), d: kospi.regularMarketChangePercent.toFixed(2) };
            if(kosdaq) indices.kd = { p: kosdaq.regularMarketPrice.toLocaleString(), d: kosdaq.regularMarketChangePercent.toFixed(2) };
        } catch (e) { console.log("지수 로드 실패"); }

        // 1️⃣ [1순위] 한투 엔진 (6시간 알림 방지 로직)
        if (appKey && appSecret) {
            const now = Date.now();
            if (!cachedToken || now > tokenExpireTime) {
                try {
                    const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
                    });
                    const tData = await tRes.json();
                    if (tData.access_token) {
                        cachedToken = tData.access_token;
                        tokenExpireTime = now + (6 * 60 * 60 * 1000); // 6시간 유지
                    }
                } catch (e) {}
            }

            if (cachedToken) {
                try {
                    const rankRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=`, {
                        headers: { "Content-Type": "application/json", "authorization": `Bearer ${cachedToken}`, "appkey": appKey, "appsecret": appSecret, "tr_id": "HHKST01010300" }
                    });
                    const rData = await rankRes.json();
                    if (rData.rt_cd === '0' && rData.output && rData.output.length > 0) {
                        prices = rData.output.slice(0, 100).map((item, i) => ({
                            sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                            price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000),
                            signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                        }));
                        return res.status(200).json({ backend_msg: "1차 한투 엔진 가동 중 🚀", prices, indices });
                    }
                } catch (e) {}
            }
        }

        // 2️⃣ [2순위] 야후 종목 백업 (한투 실패 시 실행)
        try {
            const symbols = BACKUP_CODES.map(code => code + ".KS").join(",");
            const yRes = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`);
            const yData = await yRes.json();
            if (yData.quoteResponse.result && yData.quoteResponse.result.length > 0) {
                prices = yData.quoteResponse.result.map((o, i) => ({
                    sectorId: (i % 15) + 1, c: BACKUP_CODES[i], n: BACKUP_NAMES[i],
                    price: o.regularMarketPrice.toString(), diff: o.regularMarketChangePercent.toFixed(2),
                    v: Math.floor((o.regularMarketVolume * o.regularMarketPrice) / 100000000),
                    signal: o.regularMarketChangePercent > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                }));
                return res.status(200).json({ backend_msg: "2차 야후 백업 엔진 가동 중 🌐", prices, indices });
            }
        } catch (e) { console.log("야후 종목 로드 실패"); }

        // 3️⃣ [3순위] 네이버 백업 (야후까지 실패 시 실행)
        const browserHeaders = { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/" };
        for (let i = 0; i < BACKUP_CODES.length; i++) {
            try {
                const nr = await fetch(`https://polling.finance.naver.com/api/realtime/site/main?symbol=${BACKUP_CODES[i]}`, { headers: browserHeaders });
                const nd = await nr.json();
                const o = nd.result.areas[0].datas[0];
                prices.push({
                    sectorId: (i % 15) + 1, c: BACKUP_CODES[i], n: o.nm, price: o.nv, diff: o.cr, v: Math.floor(o.aq / 1000000),
                    signal: Number(o.cr) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                });
            } catch (e) { continue; }
        }

        return res.status(200).json({ backend_msg: "3차 네이버 백업 가동 중 ⚠️", prices, indices });

    } catch (e) {
        return res.status(500).json({ backend_msg: "최종 엔진 오류", prices: [] });
    }
}
