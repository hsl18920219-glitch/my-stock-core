// api/engine.js - 보안 강화 및 직접 입력 전용 엔진 (수급 UI 규격 완벽 일치)
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let bodyData = req.body;
        if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
        
        // 🚨 GitHub 코드에는 키를 넣지 않습니다. 프론트에서 보내준 값만 받습니다.
        const { action, appKey, appSecret, token } = bodyData || {};

        if (action === 'news') {
            return res.status(200).json({ 
                news: [{ title: "[시스템] 보안 엔진 가동 중 🚀 (Key 직접 입력 방식)", publisher: "Core System", time: new Date().toLocaleTimeString('ko-KR') }] 
            });
        }

        if (action !== 'full_scan') return res.status(200).json({ backend_msg: "대기 중", prices: [] });

        // 앱키나 시크릿키가 없으면 즉시 중단 (불필요한 한투 접속 차단)
        if (!appKey || !appSecret) {
            return res.status(200).json({ backend_msg: "[설정]에서 키를 먼저 입력해주세요.", prices: [] });
        }

        let activeToken = token;
        let isNewToken = false;

        // 1. 토큰 발급 (저장된 토큰이 없을 때만 한투 서버 찌름)
        if (!activeToken) {
            const tRes = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
            });
            const tData = await tRes.json();
            
            if (tData.access_token) {
                activeToken = tData.access_token;
                isNewToken = true;
            } else {
                return res.status(200).json({ backend_msg: "로그인 실패 (키/비번 확인 필요)", prices: [] });
            }
        }

        // 2. 한투 랭킹 데이터 호출
        const rankRes = await fetch(`https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-ranking?FID_COND_MRKT_DIV_CODE=0000&FID_COND_SCR_DIV_CODE=20173&FID_INPUT_ISCD=0000&FID_DIV_CLS_CODE=0&FID_BLNG_CLS_CODE=0&FID_TRGT_CLS_CODE=0&FID_TRGT_EXLS_CLS_CODE=0&FID_INPUT_PRICE_1=&FID_INPUT_PRICE_2=&FID_VOL_CNT=&FID_INPUT_DATE_1=`, {
            headers: { 
                "content-type": "application/json; charset=utf-8", 
                "authorization": `Bearer ${activeToken}`, 
                "appkey": appKey, 
                "appsecret": appSecret, 
                "tr_id": "HHKST01010300",
                "custtype": "P"  // 🚨 한투 보안 통과용 개인고객 인증
            }
        });
        const rData = await rankRes.json();
        
        if (rData.rt_cd === '0' && rData.output) {
            let prices = rData.output.slice(0, 100).map((item, i) => ({
                sectorId: (i % 15) + 1, 
                c: item.mksc_shrn_iscd, 
                n: item.hts_kor_isnm,
                price: item.stck_prpr, 
                diff: item.prdy_ctrt, 
                v: Math.floor(item.acml_tr_pbmn/100000000), 
                signal: Number(item.prdy_ctrt) > 3.5 ? "BUY" : "WAIT",
                i: "0", f: "0", p: "0" // UI 규격 맞춤용 수급 데이터 추가
            }));
            return res.status(200).json({ backend_msg: "🚀 한투 VIP 엔진 가동 중", prices, token: isNewToken ? activeToken : null });
        }

        // 한투 서버에서 에러(토큰 만료 등)를 반환하면 프론트에 토큰 지우라고 리셋 명령!
        return res.status(200).json({ backend_msg: "한투 데이터 지연 (토큰 갱신 중)", prices: [], reset_token: true });

    } catch (e) {
        return res.status(500).json({ backend_msg: "최종 엔진 오류", prices: [] });
    }
}
