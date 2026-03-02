// api/engine.js - 네이버 봇 차단 우회 + 토큰 6시간 캐싱 (알림 폭탄 방지 버전)

// 🚨 핵심 포인트: 함수 '바깥'에 변수를 선언해서, Vercel 서버가 기억하게 만듭니다!
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

        const browserHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": "https://finance.naver.com/"
        };

        // 1. 지수 추출 (야후 파이낸스)
        try {
            const idxRes = await fetch("https://query1.finance.yahoo.com/v7/finance/quote?symbols=^KS11,^KQ11");
            const idxData = await idxRes.json();
            const kospi = idxData.quoteResponse.result[0];
            const kosdaq = idxData.quoteResponse.result[1];
            if(kospi) indices.kp = { p: kospi.regularMarketPrice.toLocaleString(), d: kospi.regularMarketChangePercent.toFixed(2) };
            if(kosdaq) indices.kd = { p: kosdaq.regularMarketPrice.toLocaleString(), d: kosdaq.regularMarketChangePercent.toFixed(2) };
        } catch (e) { console.log("지수 로드 실패"); }

        // 2. 한투 엔진 시도 (🚨 토큰 6시간 재사용 로직 적용)
        if (appKey && appSecret) {
            const now = Date.now();
            let hasValidToken = false;

            // 현재 기억된 토큰이 없거나, 유효기간(6시간)이 지났을 때만 새로 발급!
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
                        // 현재 시간에서 6시간(밀리초 계산)을 더해서 유효기간 설정
                        tokenExpireTime = now + (6 * 60 * 60 * 1000); 
                        hasValidToken = true;
                    }
                } catch (e) { console.log("토큰 발급 실패"); }
            } else {
                // 이미 기억된 토큰이 유효하다면 그대로 통과 (알림 안 울림!)
                hasValidToken = true; 
            }

            // 토큰이 준비되었다면, 종목 데이터만 쏙쏙 긁어옵니다.
            if (hasValidToken) {
                try {
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
                } catch (e) { }
            }
        }

        // 3. 종목 백업 (네이버에 위장 신분증 내밀기)
        const BACKUP_CODES = ["005930", "000660", "373220", "207940", "005380", "068270", "000270", "005490", "105560", "035420"];
        const BACKUP_NAMES = ["삼성전자", "SK하이닉스", "LG에너지솔루션", "삼성바이오로직스", "현대차", "셀트리온", "기아", "POSCO홀딩스", "KB금융", "NAVER"];
        
        for (let i = 0; i < BACKUP_CODES.length; i++) {
            try {
                const nr = await fetch(`https://polling.finance.naver.com/api/realtime/site/main?symbol=${BACKUP_CODES[i]}`, { headers: browserHeaders });
                if (!nr.ok) throw new Error("Blocked");
                const nd = await nr.json();
                const o = nd.result.areas[0].datas[0];
                prices.push({
                    sectorId: (i % 15) + 1, c: BACKUP_CODES[i], n: o.nm, price: o.nv, diff: o.cr, v: Math.floor(o.aq / 1000000),
                    signal: Number(o.cr) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                });
            } catch (e) { 
                prices.push({
                    sectorId: (i % 15) + 1, c: BACKUP_CODES[i], n: BACKUP_NAMES[i], price: "장마감", diff: "0.00", v: "0",
                    signal: "WAIT", i: "0", f: "0", p: "0"
                });
            }
        }

        return res.status(200).json({ backend_msg: "2차 네이버 백업 가동 중 ⚠️", prices, indices });

    } catch (e) {
        return res.status(500).json({ backend_msg: "엔진 치명적 오류", prices: [] });
    }
}
