let cachedToken = null;
let tokenExpiry = 0;
let lastAttemptTime = 0;

exports.handler = async function(event) {
    const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    
    try {
        const { action, appKey, appSecret } = JSON.parse(event.body || "{}");
        if (action !== 'full_scan') return { statusCode: 200, body: "{}" };

        let prices = [];
        let indices = { kp: { p: "0", d: "0" }, kd: { p: "0", d: "0" } };
        const now = Date.now();

        // 1. 한투 시도 (70초 간격 방어 로직 포함)
        if (appKey && appSecret && (now - lastAttemptTime > 70000)) {
            try {
                lastAttemptTime = now;
                const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
                });

                // 🚨 핵심 보완: 응답이 비어있는지 먼저 체크!
                const textData = await tRes.text();
                if (!textData || textData.trim() === "") {
                    throw new Error("한투 응답이 비어있음 (점검/차단)");
                }

                const tData = JSON.parse(textData);
                if (tData.access_token) {
                    cachedToken = tData.access_token;
                    tokenExpiry = now + (tData.expires_in * 1000) - 60000;
                    
                    // 랭킹 조회
                    const rankRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=`, {
                        headers: { "Content-Type": "application/json", "authorization": `Bearer ${cachedToken}`, "appkey": appKey, "appsecret": appSecret, "tr_id": "HHKST01010300" }
                    });
                    
                    const rText = await rankRes.text();
                    if (rText) {
                        const rData = JSON.parse(rText);
                        if (rData.rt_cd === '0') {
                            prices = (rData.output || []).slice(0, 100).map((item, i) => ({
                                sectorId: (i % 15) + 1, c: item.mksc_shrn_iscd, n: item.hts_kor_isnm,
                                price: item.stck_prpr, diff: item.prdy_ctrt, v: Math.floor(item.acml_tr_pbmn/100000000),
                                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT", i: "0", f: "0", p: "0"
                            }));
                            return { statusCode: 200, headers, body: JSON.stringify({ backend_msg: "1차 한투 엔진 가동 중 🚀", prices, indices }) };
                        }
                    }
                }
            } catch (e) {
                console.log("한투 실패:", e.message);
            }
        }

        // 2. 한투 실패 시 네이버 강제 백업 (방화벽 우회용 핵심 대장주 15개만)
        const BACKUP = ["005930", "000660", "373220", "207940", "005380", "068270", "000270", "005490", "105560", "035420", "051910", "006400", "012330", "003550", "033780"];
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

        return { statusCode: 200, headers, body: JSON.stringify({ 
            backend_msg: prices.length > 0 ? "2차 네이버 백업 엔진 가동 중 ⚠️" : "모든 엔진 연결 실패 (점검 중) 🚨", 
            prices, indices 
        }) };

    } catch (e) {
        return { statusCode: 200, headers, body: JSON.stringify({ backend_msg: "시스템 재가동 중... ⏳", prices: [] }) };
    }
};