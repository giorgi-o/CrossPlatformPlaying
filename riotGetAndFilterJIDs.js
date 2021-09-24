// Node.js script I made to get your XMPP friend list,
// and nicely format the usernames and JIDs.

// put your cookies here:
const riotCookies = "";

const https = require("https")
const tls = require("tls");

const riotHeaders = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
}

const fetch = (url, options={}) => {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: options.method || "GET",
            headers: options.headers || {}
        }, resp => {
            const res = {
                statusCode: resp.statusCode,
                headers: resp.headers
            };
            let data = '';
            resp.on('data', (chunk) => data += chunk);
            resp.on('end', () => {
                res.body = data;
                resolve(res);
            });
        });
        req.write(options.body || "");
        req.end();
    });
}

async function riotRefreshToken(cookies) {
    const res = await fetch("https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&nonce=123", {
        method: "GET",
        headers: {
            ...riotHeaders,
            "cookie": cookies
        },
    });
    const uri = res.headers.location;
    return uri.split(/[=&]/, 2)[1];
}

async function riotGetPAS(token) {
    const res3 = await fetch("https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat", {
        method: "GET",
        headers: {
            "Authorization": "Bearer " + token,
        },
    });
    return res3.body
}

function riotEstablishXMPPConnection(RSO, PAS) {
    const address = "euw1.chat.si.riotgames.com";
    const port = 5223;

    const sock = tls.connect(port, address, {}, () => {
        console.log("connected")
        const messages = [
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><stream:stream to=\"eu1.pvp.net\" xml:lang=\"en\" version=\"1.0\" xmlns=\"jabber:client\" xmlns:stream=\"http://etherx.jabber.org/streams\">",
            `<auth mechanism=\"X-Riot-RSO-PAS\" xmlns=\"urn:ietf:params:xml:ns:xmpp-sasl\"><rso_token>${RSO}</rso_token><pas_token>${PAS}</pas_token></auth>`,
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><stream:stream to=\"eu1.pvp.net\" xml:lang=\"en\" version=\"1.0\" xmlns=\"jabber:client\" xmlns:stream=\"http://etherx.jabber.org/streams\">",
            "<iq id=\"_xmpp_bind1\" type=\"set\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"><puuid-mode enabled=\"true\"/><resource>RC-2709252368</resource></bind></iq>",
            "<iq id=\"_xmpp_session1\" type=\"set\"><session xmlns=\"urn:ietf:params:xml:ns:xmpp-session\"/></iq>",
            "<iq type=\"get\" id=\"2\"><query xmlns=\"jabber:iq:riotgames:roster\" last_state=\"true\" /></iq>",
        ]

        for (let i = 0; i < messages.length; i++) {
            setTimeout(() => send(messages[i]), i * 200);
        }
    });

    const send = data => {
        if(sock.readyState === "open") sock.write(data, "utf8", () => console.log("-> " + data));
    }


    sock.on("data", data => {
        data = data.toString();
        console.log("<- " + data);
        if(data.startsWith("<iq from=") && data.endsWith("</query></iq>")) {
            sock.destroy();
            const queryTag = data.substring(data.indexOf("<query xmlns='jabber:iq:riotgames:roster'>") + 42, data.indexOf("</query>"));
            const items = queryTag.split("</item>");
            for(const item of items) {
                if(!item) continue;

                const jid = item.substr(11, 36);
                const idTagIndex = item.indexOf("<id ");

                const usernameIndex = item.indexOf("name=", idTagIndex) + 6;
                const username = item.substring(usernameIndex, item.indexOf("' ", usernameIndex));

                const taglineIndex = item.indexOf("tagline=", idTagIndex) + 9;
                const tagline = item.substring(taglineIndex, item.indexOf("'/>", taglineIndex));

                console.log(`${jid}\t${username} #${tagline}`);
            }
        }
    });
}

const riotStartXMPPConnection = async () => {
    const access_token = await riotRefreshToken(riotCookies);
    const pas_token = await riotGetPAS(access_token);

    riotEstablishXMPPConnection(access_token, pas_token);
}

riotStartXMPPConnection();