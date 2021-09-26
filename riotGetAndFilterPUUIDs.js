// Node.js script I made to get your XMPP friend list,
// and nicely format the usernames and PUUIDs.

// put your cookies here:
const riotCookies = "";

const https = require("https")
const tls = require("tls");
const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const getDiscordID = username => {
    return new Promise((resolve) => {
        rl.question(`Enter Discord ID for ${username}: `, resolve);
    })
}

const riotHeaders = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
}

const fetch = (url, options={}) => {
    return new Promise((resolve) => {
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
    const res = await fetch("https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&scope=account%20ban%20link%20lol%20offline_access%20openid&nonce=123", {
        method: "GET",
        headers: {
            ...riotHeaders,
            "cookie": cookies
        },
    });
    const uri = res.headers.location;
    const split = uri.split(/[=&]/)
    return split[1];
}

async function riotGetPAS(token) {
    const res = await fetch("https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat", {
        method: "GET",
        headers: {
            "Authorization": "Bearer " + token,
        },
    });
    return res.body
}

function decodeToken(token) {
    return JSON.parse(atob(token.split('.')[1]))
}

const XMPPRegions = {"as2":"as2","asia":"jp1","br1":"br1","eu":"ru1","eu3":"eu3","eun1":"eu2","euw1":"eu1","jp1":"jp1","kr1":"kr1","la1":"la1","la2":"la2","na1":"na1","oc1":"oc1","pbe1":"pb1","ru1":"ru1","sea1":"sa1","sea2":"sa2","sea3":"sa3","sea4":"sa4","tr1":"tr1","us":"la1","us-br1":"br1","us-la2":"la2","us2":"us2"};
const XMPPRegionURLs = {"as2":"as2.chat.si.riotgames.com","asia":"jp1.chat.si.riotgames.com","br1":"br.chat.si.riotgames.com","eu":"ru1.chat.si.riotgames.com","eu3":"eu3.chat.si.riotgames.com","eun1":"eun1.chat.si.riotgames.com","euw1":"euw1.chat.si.riotgames.com","jp1":"jp1.chat.si.riotgames.com","kr1":"kr1.chat.si.riotgames.com","la1":"la1.chat.si.riotgames.com","la2":"la2.chat.si.riotgames.com","na1":"na2.chat.si.riotgames.com","oc1":"oc1.chat.si.riotgames.com","pbe1":"pbe1.chat.si.riotgames.com","ru1":"ru1.chat.si.riotgames.com","sea1":"sa1.chat.si.riotgames.com","sea2":"sa2.chat.si.riotgames.com","sea3":"sa3.chat.si.riotgames.com","sea4":"sa4.chat.si.riotgames.com","tr1":"tr1.chat.si.riotgames.com","us":"la1.chat.si.riotgames.com","us-br1":"br.chat.si.riotgames.com","us-la2":"la2.chat.si.riotgames.com","us2":"us2.chat.si.riotgames.com"};

function riotEstablishXMPPConnection(RSO, PAS) {
    const region = decodeToken(PAS).affinity;
    const address = XMPPRegionURLs[region];
    const port = 5223;
    const XMPPRegion = XMPPRegions[region];

    const messages = [
        `<?xml version="1.0" encoding="UTF-8"?><stream:stream to="${XMPPRegion}.pvp.net" xml:lang="en" version="1.0" xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`,
        `<auth mechanism="X-Riot-RSO-PAS" xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><rso_token>${RSO}</rso_token><pas_token>${PAS}</pas_token></auth>`,
        `<?xml version="1.0" encoding="UTF-8"?><stream:stream to="${XMPPRegion}.pvp.net" xml:lang="en" version="1.0" xmlns="jabber:client" xmlns:stream="http://etherx.jabber.org/streams">`,
        "<iq id=\"_xmpp_bind1\" type=\"set\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"><puuid-mode enabled=\"true\"/><resource>RC-2709252368</resource></bind></iq>",
        "<iq id=\"_xmpp_session1\" type=\"set\"><session xmlns=\"urn:ietf:params:xml:ns:xmpp-session\"/></iq>",
        "<iq type=\"get\" id=\"2\"><query xmlns=\"jabber:iq:riotgames:roster\" last_state=\"true\" /></iq>",
    ]

    const sock = tls.connect(port, address, {}, () => {
        console.log("connected")
        sendNext();
    });

    const send = data => {
        if(sock.readyState === "open") sock.write(data, "utf8", () => console.log("-> " + data));
    }

    const sendNext = () => send(messages.shift());

    let bufferedMessage = "";

    sock.on("data", async data => {
        data = data.toString();
        console.log("<- " + data);

        // handle riot splitting messages into multiple parts
        if(data.startsWith("<?xml")) return;
        let oldBufferedMessage = null;
        while(oldBufferedMessage !== bufferedMessage) {
            oldBufferedMessage = bufferedMessage;
            data = bufferedMessage + data;
            if(data === "") return;
            if(!data.startsWith('<')) return console.error("xml presence data doesn't start with '<'! ");

            const firstTagName = data.substring(1, data.indexOf('>')).split(' ', 1)[0];

            // check for self closing tag eg <presence />
            if(data.search(/<[^<>]+\/>/) === 0) data = data.replace("/>", `></${firstTagName}>`);

            const closingTagIndex = data.indexOf(`</${firstTagName}>`);
            if(closingTagIndex === -1) {
                // message is split, we need to wait for the end
                bufferedMessage = data;
                // console.log("BUFFERED MESSAGE", bufferedMessage);
                break;
            }

            bufferedMessage = data.substr(closingTagIndex + `</${firstTagName}>`.length); // will be empty string if only one tag
            data = data.substr(0, closingTagIndex + `</${firstTagName}>`.length);

            if(data.startsWith("<iq from=") && data.endsWith("</query></iq>")) {
                sock.destroy();
                console.log("=========================================");

                const queryTag = data.substring(data.indexOf("<query xmlns='jabber:iq:riotgames:roster'>") + 42, data.indexOf("</query>"));
                const items = queryTag.split("</item>");

                const puuidToUsername = {};

                for(const item of items) {
                    if(!item) continue;

                    const puuid = item.substr(11, 36);
                    const idTagIndex = item.indexOf("<id ");

                    const usernameIndex = item.indexOf("name=", idTagIndex) + 6;
                    const username = item.substring(usernameIndex, item.indexOf("' ", usernameIndex));

                    const taglineIndex = item.indexOf("tagline=", idTagIndex) + 9;
                    const tagline = item.substring(taglineIndex, item.indexOf("'/>", taglineIndex));

                    console.log(`${puuid}\t${username} #${tagline}`);
                    puuidToUsername[puuid] = `${username} #${tagline}`;
                }

                const puuidToDiscordID = {};
                console.log("=========================================");

                for(const puuid in puuidToUsername) {
                    const discord_id = await getDiscordID(puuidToUsername[puuid]);
                    if(discord_id) puuidToDiscordID[discord_id] = puuid;
                }

                console.log('"usersMap": ' + JSON.stringify(puuidToDiscordID, null, '    '));

                data = "";
            } else sendNext();
        }
    });
}

const riotStartXMPPConnection = async () => {
    const access_token = await riotRefreshToken(riotCookies);
    if(!access_token.startsWith('e')) return console.error("Invalid access token, most likely your cookies are invalid.")

    const pas_token = await riotGetPAS(access_token);

    riotEstablishXMPPConnection(access_token, pas_token);
}

riotStartXMPPConnection();