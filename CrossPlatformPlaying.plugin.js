/**
 * @name CrossPlatformPlaying
 * @author Giorgio
 * @description Show what people are playing on other platforms such as Steam and Valorant
 * @version 0.1
 * @authorId 316978243716775947
 */

/**************
 **  HELPER  **
 **************/

const https = require("https")
const tls = require("tls");

// send a GET request to a URL, bypassing CORS policy
// once the data is obtained, call the callback function with the data as a string
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
        })
        req.write(options.body || "");
        req.end();
        req.on("error", err);
    });
}

// basic error handling
const err = e => {
    console.error(e);
    for(const errCode of ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ENOENT", "ECONNABORTED"]) {
        if(e.code === errCode || e.errno === errCode) return; // steam & hypixel sometimes time out for no reason
    }
    debugger;
    BdApi.alert("Error happened!\n" + e);
}

let initFunctions = []; // functions to call when the plugin starts up
let presenceFunctions = []; // functions to call to get the presence of a user
let pluginStopped = false; // will be true once plugin is stopped (e.g. reload), prevents sockets from reconnecting

const customRpcAppId = "883483733875892264";

/*************
 **  STEAM  **
 *************/

let steamApiKey, discordToSteamIDs = {};

const steamCache = {};

const steam_getPlayerSummaries = async ids => {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${steamApiKey}&steamids=${ids.join(',')}`;
    const data = await fetch(url);

    try {
        const json_data = JSON.parse(data.body);
        if (!json_data.response || !json_data.response.players) return;
        for (const playerSummary of json_data.response.players) {
            steam_processPlayerSummary(playerSummary);
        }
    } catch (e) {
        console.error("Couldn't JSON Parse Steam response!", data);
    }
}

const steam_processPlayerSummary = summary => {
    // format: https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_.28v0002.29
    const statuses = ["Offline", "Playing", "Busy", "Away", "Snoozed", "Looking to trade", "Looking to play"];
    if(summary.gameextrainfo) {
        const previousPresence = steamCache[summary.steamid]
        steamCache[summary.steamid] = {
            application_id: customRpcAppId,
            name: summary.gameextrainfo,
            details: `${statuses[summary.personastate]} on Steam`,
            type: 0,
            timestamps: {start: previousPresence ? previousPresence.timestamps.start : +new Date()},
            assets: {
                large_image: "883490890377756682",
                large_text: "Playing as " + summary.personaname
            }
        };
    } else {
        delete steamCache[summary.steamid];
    }
}

const updateSteamCache = () => {
    try {
        const steam_ids = Object.values(discordToSteamIDs).flat();

        // can only request 100 steam profiles at a time
        for (let i = 0; i < steam_ids.length; i += 100) {
            steam_getPlayerSummaries(steam_ids.slice(i, i + 100));
        }
    } catch (e) {
        err(e);
    }
}

const steamLoadData = () => {
    const steamData = BdApi.loadData("CrossPlatformPlaying", "steam");
    if(steamData) {
        steamApiKey = steamData.api_key;
        discordToSteamIDs = steamData.usersMap || {};
    } else {
        BdApi.saveData("CrossPlatformPlaying", "steam", {api_key: "", usersMap: {}});
    }
}

const steamInit = () => {
    steamLoadData();
    if (steamApiKey) {
        updateSteamCache();

        // we are allowed 120000 requests/day = 83/minute
        intervals.push(setInterval(updateSteamCache, 10_000));
    }
}

const steamGetActivity = discord_id => {
    if(discord_id in discordToSteamIDs) {
        for (const steam_id of discordToSteamIDs[discord_id]) {
            if(steamCache[steam_id]) return steamCache[steam_id];
        }
    }
}

initFunctions.push(steamInit);
presenceFunctions.push(steamGetActivity);


/***************
 **  HYPIXEL  **
 ***************/

let hypixelApiKey, discordToMinecraftUUIDs = {}

const hypixelCache = {};

const hypixel_calculateCacheInterval = () => {
    // allowed 2 requests per second
    // to be safe, I do 1 request per 2 second
    // aka if there are 7 players, we request all players every 14 seconds
    return Object.keys(discordToMinecraftUUIDs).length * 2 * 1000;

}

const hypixel_getPlayerStatus = async uuid => {
    const url = `https://api.hypixel.net/status?key=${hypixelApiKey}&uuid=${uuid}`;
    const data = await fetch(url);
    try {
        const json_data = JSON.parse(data.body);
        // console.log("got status for " + uuid)
        if(json_data.success && json_data.session.online) {
            hypixel_getPlayerInfo(uuid, json_data.session);
        } else {
            hypixel_clearPlayerData(uuid);
            if(!json_data.success) {
                console.error(data);
                console.error(json_data);
                BdApi.alert("success was false while trying to fetch hypixel data");
            }
        }
    } catch (e) {
        console.error("Couldn't JSON Parse Hypixel status response!", data);
    }
}

const hypixel_getPlayerInfo = async (uuid, session) => {
    const url = `https://api.hypixel.net/player?key=${hypixelApiKey}&uuid=${uuid}`;
    const data = await fetch(url)
    try {
        const json_data = JSON.parse(data.body);
        if (json_data.success) {
            hypixel_processPlayerData(uuid, json_data.player, session);
        }
    } catch (e) {
        console.error("Couldn't JSON Parse Hypixel player response!", data);
    }
}

const hypixel_processPlayerData = (uuid, player, session) => {
    /* format:
     *  name: Giorgioo
     *  since: 123456,
     *  game: Bedwars / Bedwars 4s,
     *  map?: Lobby / Shark Attack,
     *  rawSession:
     *      gameType: BEDWARS
     *      mode: BEDWARS_FOUR_FOUR
     *      map: Invasion
     */

    // TODO use this to parse
    // https://api.hypixel.net/resources/games

    const currentData = hypixelCache[uuid];
    if(currentData && JSON.stringify(currentData.rawSession) === JSON.stringify(session)) return;

    const capitalize = s => s[0].toUpperCase() + s.slice(1).toLowerCase();

    if(player.lastLogout > player.lastLogin) console.error(player.displayname + " online but logged out?")

    let formattedData = {
        name: player.displayname,
        since: player.lastLogin,
        game: capitalize(session.gameType),
        map: "???",
        rawSession: session
    }

    const game = session.gameType;
    const mode = session.mode;
    const map = "On " + session.map;

    if(mode === "LOBBY") {
        formattedData.map = "In the lobby";
        if(game === "MAIN") {
            formattedData.game = "Main Lobby";
        } else {
            formattedData.game += " Lobby";
        }
    } else if(game === "BEDWARS") {
        formattedData.map = map || "????";
        switch (mode) {
            case "BEDWARS_EIGHT_ONE":
                formattedData.game = "Bedwars Solo"
                break;
            case "BEDWARS_EIGHT_TWO":
                formattedData.game = "Bedwars Duos"
                break;
            case "BEDWARS_FOUR_THREE":
                formattedData.game = "Bedwars 3v3v3v3"
                break;
            case "BEDWARS_FOUR_FOUR":
                formattedData.game = "Bedwars 4v4v4v4"
                break;
            case "BEDWARS_FOUR_FOUR_ULTIMATE":
                formattedData.game = "Bedwars 4v4"
                break;
            default:
                formattedData.game = mode;
        }
    } else if(game === "SKYWARS") {
        formattedData.map = map || "????";
        switch (mode) {
            case "solo_normal":
                formattedData.game = "Skywars Solo Normal"
                break;
            case "ranked_normal":
                formattedData.game = "Skywars Solo Ranked"
                break;
            case "solo_insane":
                formattedData.game = "Skywars Solo Insane"
                break;
            case "teams_normal":
                formattedData.game = "Skywars Duos Normal"
                break;
            case "teams_insane":
                formattedData.game = "Skywars Duos Insane"
                break;
            default:
                formattedData.game = mode.toUpperCase();
        }
    }

    hypixelCache[uuid] = formattedData;
}

const hypixel_clearPlayerData = uuid => {
    delete hypixelCache[uuid];
}

const hypixel_timeouts = [];

const hypixelUpdateCache = () => {
    try {
        const uuids = Object.values(discordToMinecraftUUIDs);

        for (let i = 0; i < uuids.length; i++) {
            hypixel_timeouts.push(setTimeout(() => {
                hypixel_getPlayerStatus(uuids[i]);
                hypixel_timeouts.shift();
            }, 1000 * i));
        }
    } catch (e) {
        err(e);
    }
}

const hypixelGetActivity = discord_id => {
    const uuid = discordToMinecraftUUIDs[discord_id];
    if(uuid) {
        const hypixelData = hypixelCache[uuid];
        if(hypixelData) {
            return {
                application_id: customRpcAppId,
                name: "Hypixel",
                details: "Playing " + hypixelData.game,
                type: 0,
                timestamps: {start: hypixelData.since},
                assets: {
                    large_image: "883490391964385352",
                    large_text: "Playing as " + hypixelData.name,
                    small_image: "883498326580920403",
                    small_text: hypixelData.map
                }
            }
        }
    }
}

const hypixelLoadData = () => {
    const hypixelData = BdApi.loadData("CrossPlatformPlaying", "hypixel");
    if(hypixelData) {
        hypixelApiKey = hypixelData.api_key;
        discordToMinecraftUUIDs = hypixelData.usersMap || {};
    } else {
        BdApi.saveData("CrossPlatformPlaying", "hypixel", {api_key: "", usersMap: {}});
    }
}

const hypixelInit = () => {
    hypixelLoadData();
    if (hypixelApiKey) {
        hypixelUpdateCache();
        intervals.push(setInterval(hypixelUpdateCache, hypixel_calculateCacheInterval()));
    }
}

initFunctions.push(hypixelInit);
presenceFunctions.push(hypixelGetActivity);

/************
 **  RIOT  **
 ************/

let riotCookies, discordToRiotPUUIDs = {};

const riotHeaders = {
    // "cloudflare bitches at us without a user-agent" - molenzwiebel
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
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

// xmpp stuff
const XMPPRegions = {"as2":"as2","asia":"jp1","br1":"br1","eu":"ru1","eu3":"eu3","eun1":"eu2","euw1":"eu1","jp1":"jp1","kr1":"kr1","la1":"la1","la2":"la2","na1":"na1","oc1":"oc1","pbe1":"pb1","ru1":"ru1","sea1":"sa1","sea2":"sa2","sea3":"sa3","sea4":"sa4","tr1":"tr1","us":"la1","us-br1":"br1","us-la2":"la2","us2":"us2"};
const XMPPRegionURLs = {"as2":"as2.chat.si.riotgames.com","asia":"jp1.chat.si.riotgames.com","br1":"br.chat.si.riotgames.com","eu":"ru1.chat.si.riotgames.com","eu3":"eu3.chat.si.riotgames.com","eun1":"eun1.chat.si.riotgames.com","euw1":"euw1.chat.si.riotgames.com","jp1":"jp1.chat.si.riotgames.com","kr1":"kr1.chat.si.riotgames.com","la1":"la1.chat.si.riotgames.com","la2":"la2.chat.si.riotgames.com","na1":"na2.chat.si.riotgames.com","oc1":"oc1.chat.si.riotgames.com","pbe1":"pbe1.chat.si.riotgames.com","ru1":"ru1.chat.si.riotgames.com","sea1":"sa1.chat.si.riotgames.com","sea2":"sa2.chat.si.riotgames.com","sea3":"sa3.chat.si.riotgames.com","sea4":"sa4.chat.si.riotgames.com","tr1":"tr1.chat.si.riotgames.com","us":"la1.chat.si.riotgames.com","us-br1":"br.chat.si.riotgames.com","us-la2":"la2.chat.si.riotgames.com","us2":"us2.chat.si.riotgames.com"};

let riotSocket;
let riotSocketHeartbeatInterval;
let riotReconnectAttempts = 0;
let riotLastReconnectAttempt = 0; // timestamp

function decodeToken(token) {
    return JSON.parse(atob(token.split('.')[1]))
}

function riotEstablishXMPPConnection(RSO, PAS) {
    try {
        const region = decodeToken(PAS).affinity;
        const address = XMPPRegionURLs[region];
        const port = 5223;
        const XMPPRegion = XMPPRegions[region];

        const messages = [
            `<?xml version="1.0"?><stream:stream to="${XMPPRegion}.pvp.net" version="1.0" xmlns:stream="http://etherx.jabber.org/streams">`,
            `<auth mechanism="X-Riot-RSO-PAS" xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><rso_token>${RSO}</rso_token><pas_token>${PAS}</pas_token></auth>`,
            `<?xml version="1.0"?><stream:stream to="${XMPPRegion}.pvp.net" version="1.0" xmlns:stream="http://etherx.jabber.org/streams">`,
            "<iq id=\"_xmpp_bind1\" type=\"set\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"></bind></iq>",
            "<iq id=\"_xmpp_session1\" type=\"set\"><session xmlns=\"urn:ietf:params:xml:ns:xmpp-session\"/></iq>",
            //"<iq type=\"get\" id=\"2\"><query xmlns=\"jabber:iq:riotgames:roster\" last_state=\"true\" /></iq>", // uncomment to show friends list
            "<presence/>"
        ]

        const sock = tls.connect(port, address, {}, () => {
            try {
                console.log("VAL: Connected!")
                sendNext();
                riotSocketHeartbeatInterval = setInterval(() => send(" "), 150_000);
            } catch (e) {
                err(e);
            }
        });
        riotSocket = sock;

        const send = data => {
            try {
                if(sock.readyState === "open") sock.write(data, "utf8", () => console.log("-> " + data));
                clearInterval(riotSocketHeartbeatInterval);
                riotSocketHeartbeatInterval = setInterval(() => send(" "), 150_000);
            } catch (e) {
                err(e);
            }
        }

        const sendNext = () => send(messages.shift());

        let bufferedMessage = "";

        sock.on("data", data => {
            try {
                data = data.toString();
                console.log("<- " + data);
                if(messages.length > 0) sendNext();

                // handle riot splitting messages into multiple parts
                if(data.startsWith("<?xml")) return;
                let oldBufferedMessage = null;
                while(oldBufferedMessage !== bufferedMessage) {
                    oldBufferedMessage = bufferedMessage;
                    data = bufferedMessage + data;
                    if(data === "") return;
                    if(!data.startsWith('<')) return err("xml presence data doesn't start with '<'! " + data);

                    const firstTagName = data.substring(1, data.indexOf('>')).split(' ', 1)[0];

                    // check for self closing tag eg <presence />
                    if(data.search(/<[^<>]+\/>/) === 0) data = data.replace("/>", `></${firstTagName}>`);

                    const closingTagIndex = data.indexOf(`</${firstTagName}>`);
                    if(closingTagIndex === -1) {
                        // message is split, we need to wait for the end
                        bufferedMessage = data;
                        break;
                    }

                    bufferedMessage = data.substr(closingTagIndex + `</${firstTagName}>`.length); // will be empty string if only one tag
                    data = data.substr(0, closingTagIndex + `</${firstTagName}>`.length);

                    if(firstTagName === "presence") {
                        valProcessXMLData(data);
                        lolProcessXMLData(data);
                        wrProcessXMLData(data);
                    }

                    data = "";
                }
            } catch (e) {
                err(e);
            }
        });

        sock.on("error", console.error);
        sock.on("close", () => {
            if(pluginStopped) return;
            console.error("VAL Connection Closed!");
            if(+new Date() - riotLastReconnectAttempt > 15_000) riotReconnectAttempts = 0;
            else if(riotReconnectAttempts > 5) {
                // already tried to reconnect 5 times, just give up
                const errMessage = "Riot XMPP server connection failed!";
                console.error(errMessage);
                BdApi.alert(errMessage);
                return;
            }
            riotReconnectAttempts++;
            console.log(`Will try again in ${riotReconnectAttempts * 5}s...`);
            setTimeout(() => {
                riotLastReconnectAttempt = + new Date();
                console.log(`VAL: Reconnect attempt number ${riotReconnectAttempts}`)
                riotStartXMPPConnection();
            }, riotReconnectAttempts * 5000);
        });
        sock.on("timeout", () => console.err("VAL: connection timeout!"));
    } catch (e) {
        err(e);
    }
}

const riotStartXMPPConnection = async () => {
    const access_token = await riotRefreshToken(riotCookies);
    if(!access_token.startsWith('e')) {
        console.log("Riot Access Token: " + access_token);
        return err("Invalid access token, most likely your cookies are invalid.");
    }

    const pas_token = await riotGetPAS(access_token);

    riotEstablishXMPPConnection(access_token, pas_token);
}

const riotExtractDataFromXML = (xml, tagName, startIndex, endIndex) => {
    const dataStartIndex = xml.indexOf(`<${tagName}>`, startIndex, endIndex);
    const dataEndIndex = xml.indexOf(`</${tagName}>`, dataStartIndex, endIndex);
    if(dataStartIndex >= 0 && dataEndIndex > dataStartIndex) {
        const data = xml.substring(dataStartIndex + tagName.length + 2, dataEndIndex)
        if(data) return data;
    }
}

const riotLoadData = () => {
    const riotData = BdApi.loadData("CrossPlatformPlaying", "riot");
    if(riotData) {
        riotCookies = riotData.cookies;
        discordToRiotPUUIDs = riotData.usersMap || {};
    } else {
        BdApi.saveData("CrossPlatformPlaying", "riot", {cookies: "", usersMap: {}});
    }
}

const riotInit = () => {
    riotLoadData();
    if (riotCookies) {
        valFetchRpcAssets();
        lolFetchData();
        riotStartXMPPConnection();
    }
}

initFunctions.push(riotInit);

const riotGetPresence = discord_id => {
    const puuids = discordToRiotPUUIDs[discord_id];
    if (!puuids) return;

    const presences = [];

    for (const puuid of puuids) {
        const valPresence = valGetPresence(puuid);
        if(valPresence) presences.push(valPresence);

        const lolPresence = lolGetPresence(puuid);
        if(lolPresence) presences.push(lolPresence);

        const wrPresence = wrGetPresence(puuid);
        if(wrPresence) presences.push(wrPresence);
    }

    if(presences.length > 0) return presences;
}

presenceFunctions.push(riotGetPresence);

/****************
 **  VALORANT  **
 ****************/

const valRpcAppID = "811469787657928704";
const valRpcAssets = {} // https://discord.com/api/v9/oauth2/applications/811469787657928704/assets

const valFetchRpcAssets = async () => {
    const assetsReq = await fetch(`https://discord.com/api/v9/oauth2/applications/${valRpcAppID}/assets`);
    const assetList = JSON.parse(assetsReq.body);
    for(const asset of assetList) {
        // format: {"id": "821415501942882324", "type": 2, "name": "splash_icebox_square"}
        valRpcAssets[asset.name] = asset.id;
    }
}

const valCache = {};

const valProcessXMLData = data => {
    try {
        const puuid = data.substr(16, 36);

        // extract valorant presence
        const valorantData = riotExtractDataFromXML(data, "valorant");
        if(valorantData) {
            const base64Data = riotExtractDataFromXML(valorantData, "p");
            const timestamp = parseInt(riotExtractDataFromXML(valorantData, "s.t"));
            try {
                const presenceData = JSON.parse(atob(base64Data));
                valProcessPresenceData(puuid, presenceData, timestamp);
            } catch (e) {
                debugger
            }
        } else {
            delete valCache[puuid];
        }
    } catch (e) {
        err(e);
    }
}

// constants
const valModes = {
    "newmap": "New Map",
    "competitive": "Competitive",
    "unrated": "Unrated",
    "spikerush": "Spike Rush",
    "deathmatch": "Deathmatch",
    "ggteam": "Escalation",
    "onefa": "Replication",
    "custom": "Custom",
    "snowball": "Snowball Fight",
    "": "Custom"
}
const valMapCodenames = {
    "Triad": "Haven",
    "Duality": "Bind",
    "Bonsai": "Split",
    "Port": "Icebox",
    "Ascent": "Ascent",
    "Foxtrot": "Breeze",
    "Canyon": "Fracture",
    "Range": "The Range"
}
const valRanks = [
    'UNRANKED', 'Unused1', 'Unused2',
    'IRON 1', 'IRON 2', 'IRON 3',
    'BRONZE 1', 'BRONZE 2', 'BRONZE 3',
    'SILVER 1', 'SILVER 2', 'SILVER 3',
    'GOLD 1', 'GOLD 2', 'GOLD 3',
    'PLATINUM 1', 'PLATINUM 2', 'PLATINUM 3',
    'DIAMOND 1', 'DIAMOND 2', 'DIAMOND 3',
    'IMMORTAL 1', 'IMMORTAL 2', 'IMMORTAL 3',
    'RADIANT', 'Better than Radiant']

const valProcessPresenceData = (puuid, presenceData, timestamp) => {
    console.log(presenceData)

    try {
        const parseValDate = s => {
            const year = parseInt(s.substr(0, 4)),
                month = parseInt(s.substr(5, 2)) - 1,
                day = parseInt(s.substr(8, 2)),
                hour = parseInt(s.substr(11, 2)),
                minute = parseInt(s.substr(14, 2)),
                second = parseInt(s.substr(17, 2));
            if (year === 1) return timestamp;
            return +Date.UTC(year, month, day, hour, minute, second);
        }

        const previousPresence = valCache[puuid];

        const map = presenceData.matchMap.split('/').pop();

        const getGamemode = () => {
            if(presenceData.queueId === "") {
                if(previousPresence && previousPresence.details.startsWith("In Queue - ")) return previousPresence.details.substr(11);
                return "Custom";
            }
            const modeName = valModes[presenceData.queueId];
            return modeName || presenceData.queueId;
        }
        const getMapName = () => {
            const mapName = valMapCodenames[map] || map;
            if(mapName) return mapName;
            else {
                // no map data, get map name from previous presence
                if(previousPresence && previousPresence.assets.large_text !== "No map data" && previousPresence.assets.large_text !== "In Lobby")
                    return previousPresence.assets.large_text;
            }
            return "No map data";
        }
        const getMapIcon = () => {
            if(map === "" && presenceData.sessionLoopState === "INGAME") {
                // no map data, get map icon from previous presence
                if(previousPresence && previousPresence.assets.large_image !== valRpcAssets["game_icon"] && previousPresence.assets.large_image !== valRpcAssets["game_icon_yellow"])
                    return previousPresence.assets.large_image;
            }
            const mapCodename = valMapCodenames[map];
            if(!mapCodename) return valRpcAssets["game_icon_white"];
            return valRpcAssets[`splash_${map === "Range" ? "range" : mapCodename.toLowerCase()}_square`];
        }
        const getPartyText = () => `${presenceData.partyAccessibility === "OPEN" ? "Open" : "Closed"} Party${presenceData.isPartyOwner ? " Leader" : ""}`;
        const getStartTimestamp = () => {
            if(presenceData.sessionLoopState === "MENUS") {
                if(presenceData.partyState === "MATCHMAKING")
                    return parseValDate(presenceData.queueEntryTime); // in queue, return start queue time
                if(previousPresence && (previousPresence.details.startsWith("Lobby - ") || previousPresence.details === "Setting Up Custom Game"))
                    return previousPresence.timestamps.start;
                return timestamp;
            } else if(presenceData.sessionLoopState === "INGAME") {
                if(previousPresence && previousPresence.details.startsWith("Custom"))
                    return previousPresence.timestamps.start;
            }

            return parseValDate(presenceData.queueEntryTime) || timestamp;
        }

        const presenceBoilerplate = {
            application_id: valRpcAppID,
            name: "VALORANT",
            type: 0,
            state: getPartyText(),
            party: {
                id: presenceData.partyId,
                size: [presenceData.partySize, presenceData.maxPartySize || (previousPresence ? previousPresence.party.size[1]: 69)]
            },
            timestamps: {
                start: getStartTimestamp()
            },
            assets: {
                small_image: valRpcAssets["rank_" + presenceData.competitiveTier] || valRpcAssets["rank_0"],
                small_text: `${valRanks[presenceData.competitiveTier]}${presenceData.leaderboardPosition > 0 ? ` #${presenceData.leaderboardPosition}` : ""} | LVL ${presenceData.accountLevel}`
            }
        };
        let presence = {};

        switch (presenceData.sessionLoopState) {
            case "MENUS":
                // in lobby or in queue
                const menusGetDetails = () => {
                    if(presenceData.partyState === "DEFAULT") return `Lobby - ${getGamemode()}`;
                    if(presenceData.partyState === "MATCHMAKING") return `In Queue - ${getGamemode()}`;
                    if(presenceData.partyState === "MATCHMADE_GAME_STARTING") return `Match Found - ${getGamemode()}`;
                    if(presenceData.partyState === "CUSTOM_GAME_SETUP") return `Setting Up Custom Game`;
                    return `${presenceData.partyState} (?) - ${getGamemode()}`;
                }
                const menusGetLargeText = () => presenceData.isIdle ? "Away" : "In Lobby";

                presence = {
                    ...presenceBoilerplate,
                    details: menusGetDetails(),
                    assets: {
                        ...presenceBoilerplate.assets,
                        large_image: presenceData.isIdle ? valRpcAssets["game_icon_yellow"] : presenceData.partyState === "CUSTOM_GAME_SETUP" ? getMapIcon(presenceData.matchMap) : valRpcAssets["game_icon"],
                        large_text: menusGetLargeText(),
                    },
                }
                break;
            case "PREGAME":
                // in agent select
                const pregameGetDetails = () => {
                    if(presenceData.provisioningFlow === "Invalid") return `${getGamemode()} - Match Found`;
                    if(presenceData.provisioningFlow === "CustomGame") return `Custom Game - Agent Select`;
                    if(presenceData.provisioningFlow === "Matchmaking") return `${getGamemode()} - Agent Select`;
                    return `${getGamemode()} - ${presenceData.provisioningFlow} (?)`;
                }

                presence = {
                    ...presenceBoilerplate,
                    details: pregameGetDetails(),
                    assets: {
                        ...presenceBoilerplate.assets,
                        large_image: getMapIcon(),
                        large_text: presenceData.isIdle ? "Away" : getMapName(),
                    }
                }


                if(pregameGetDetails().includes("Match Found")) // match found 5sec timer
                    presence.timestamps.end = timestamp + 5000;
                else if(pregameGetDetails().includes("Agent Select")) // start 75sec countdown once agent select has loaded
                    presence.timestamps.end = timestamp + 75000;
                break;
            case "INGAME":
                const ingameGetDetails = () => {
                    const gamemode = getGamemode();
                    if(presenceData.partyState === "MATCHMADE_GAME_STARTING") return `Match Found - ${gamemode}` // deathmatch skips pregame

                    let s = "";

                    if(gamemode === "Custom" && presenceData.customGameTeam === "TeamSpectate")
                        s += "Spectating ";

                    s += map === "Range" ? "The Range" : gamemode;

                    if(presence.partyOwnerMatchCurrentTeam === "")
                        s += " - Loading";
                    else if(map !== "Range")
                        s += ` ${presenceData.partyOwnerMatchScoreAllyTeam}-${presenceData.partyOwnerMatchScoreEnemyTeam}`;

                    return s;
                }
                presence = {
                    ...presenceBoilerplate,
                    details: ingameGetDetails(),
                    assets: {
                        ...presenceBoilerplate.assets,
                        large_image: getMapIcon(),
                        large_text: presenceData.isIdle ? "Away" : getMapName(),
                    }
                }
                break;
        }

        valCache[puuid] = presence;
        console.log(presence);
    } catch (e) {
        err(e);
    }
}

const valGetPresence = puuid => {
    const valPresence = valCache[puuid];
    if(valPresence) return valPresence;
}


/***********
 **  LOL  **
 ***********/

const lolCache = {};

const lolProcessXMLData = data => {
    try {
        const puuid = data.substr(16, 36);

        // extract lol presence
        const lolData = riotExtractDataFromXML(data, "league_of_legends");
        if(lolData) {
            const presenceUnparsed = riotExtractDataFromXML(lolData, "p");
            if (presenceUnparsed) {
                // regalia is an object within the object, causes issues with parser
                const presenceHalfParsed = presenceUnparsed.replace(/&quot;/g, '"').replace(/&apos;/g, '"').replace(/"regalia":.+}",/, "");
                try {
                    const presenceData = JSON.parse(presenceHalfParsed);
                    const timestamp = riotExtractDataFromXML(lolData, "s.t");
                    console.log(presenceData);
                    lolProcessPresenceData(puuid, presenceData, timestamp);
                } catch(e) {
                    debugger
                }
            }
        } else {
            delete lolCache[puuid];
        }
    } catch (e) {
        err(e);
    }
}

// constants
// champion id -> name
const lolGameVersionURL = "https://ddragon.leagueoflegends.com/api/versions.json";
const lolGetChampionsInfoURL = v => `https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`;
const lolChampsData = {};
const lolRpcAppId = "401518684763586560";
const lolRpcAssets = {
    logo_lol: "416719019576393738",
    logo_tft: "653758171525021696",
    champions: {}, // to be filled in by lolFetchRpcAssets()
    custom_champions: { // sometimes riot forgets to add icons for new champions
        "Yone": "890650092070117406"
    }
}
const lolQueueTypes = { // manually adding in gamemodes not in riot json
    1130: {
        "queueId": 1130,
        "map": "???",
        "description": "Ranked Teamfight Tactics Turbo",
        "notes": "Added in manually"
    }
};

// for queue ids https://static.developer.riotgames.com/docs/lol/queues.json
// other constants https://developer.riotgames.com/docs/lol#general_game-constants

const lolGetLatestVersion = async () => {
    const versionsReq = await fetch(lolGameVersionURL);
    return JSON.parse(versionsReq.body)[0];
}

const lolFetchChampionData = async () => {
    const championsReq = await fetch(lolGetChampionsInfoURL(await lolGetLatestVersion()));
    const champsData = JSON.parse(championsReq.body);
    for(const champName in champsData.data) {
        lolChampsData[champsData.data[champName].key] = champName;
    }
}

const lolFetchRpcAssets = async () => {
    const assetsReq = await fetch(`https://discord.com/api/v9/oauth2/applications/${lolRpcAppId}/assets`);
    const assetList = JSON.parse(assetsReq.body);
    for(const asset of assetList) {
        // format: {"id": "403244850960662538", "type": 2, "name": "champ_aatrox"}
        if(asset.name.startsWith("champ_"))
            lolRpcAssets.champions[asset.name.substr(6)] = asset.id;
        else if(asset.name === "logo") lolRpcAssets.logo_lol = asset.id;
        else if(asset.name === "tft_logo") lolRpcAssets.logo_tft = asset.id;
    }
}

const lolFetchQueueTypes = async () => {
    const queueTypesReq = await fetch("https://static.developer.riotgames.com/docs/lol/queues.json");
    const queueTypes = JSON.parse(queueTypesReq.body);
    for(const queue of queueTypes) {
        if(queue.description) queue.description = queue.description.replace(" games", "");
        lolQueueTypes[queue["queueId"]] = queue;
    }
}

const lolFetchData = () => {
    lolFetchRpcAssets();
    lolFetchChampionData();
    lolFetchQueueTypes();
}

const lolProcessPresenceData = (puuid, data, timestamp) => {
    try {
        timestamp = data.timeStamp || timestamp;

        const getGamemode = (prefix = "", suffix = "") => {
            // add prefix and suffix
            const p_s = s => `${prefix}${s}${suffix}`;

            if (data.queueId && lolQueueTypes[data.queueId]) return p_s(lolQueueTypes[data.queueId].description);
            if (data.queueId === 0) return p_s("Custom game");
            if (data.gameStatus === "outOfGame") return "In The Lobby";
            return `(?) ${prefix}${data.gameQueueType} ${data.gameStatus}${suffix}`
        }

        const previousPresence = lolCache[puuid];
        let presenceBoilerplate = {
            application_id: lolRpcAppId,
            name: data.gameMode === "TFT" ? "Teamfight Tactics" : "League of Legends",
            type: 0,
            assets: {
                large_image: data.gameMode === "TFT" ? lolRpcAssets.logo_tft : lolRpcAssets.logo_lol,
                large_text: `Level ${data.level} | Mastery ${data.masteryScore}`
            }
        };
        let presence;

        // if open party, process party data
        if (data.pty) {
            const partyData = JSON.parse(data.pty);
            presenceBoilerplate.party = {
                id: partyData.partyId,
                size: [partyData.summoners.length, 5]
            }
            presenceBoilerplate.state = "Open Party"
        }

        if (data.gameStatus === "outOfGame") {
            presence = {
                ...presenceBoilerplate,
                details: getGamemode("Main Menu - "),
                timestamps: {
                    start: previousPresence ? previousPresence.timestamps.start : timestamp
                }
            }
        } else if (data.gameStatus.startsWith("hosting_")) {
            presence = {
                ...presenceBoilerplate,
                details: getGamemode("Lobby - "),
                timestamps: {
                    start: previousPresence ? previousPresence.timestamps.start : timestamp
                }
            }
        } else if (data.gameStatus === "inQueue") {
            presence = {
                ...presenceBoilerplate,
                details: getGamemode("In Queue - "),
                timestamps: {
                    start: data.timeStamp
                }
            }
        } else if (data.gameStatus === "championSelect") {
            presence = {
                ...presenceBoilerplate,
                details: getGamemode("Champion Select - "),
                timestamps: {
                    start: timestamp
                }
            }
        } else if (data.gameStatus === "inGame") {
            const championName = lolChampsData[data.championId];
            const inGameGetLargeImage = () => {
                if(championName && lolRpcAssets.champions[championName.toLowerCase()])
                    return lolRpcAssets.champions[championName.toLowerCase()];
                return presenceBoilerplate.assets.large_image;
            }
            presence = {
                ...presenceBoilerplate,
                details: getGamemode("In Game - "),
                timestamps: {
                    start: data.timeStamp
                },
                assets: {
                    large_image: inGameGetLargeImage(),
                    large_text: data.skinname
                }
            }
            if(presence.assets.large_image === lolRpcAssets.logo_lol && championName in lolRpcAssets.custom_champions) {
                // riot forgot to add icon for this champion
                presence.application_id = customRpcAppId;
                presence.assets.large_image = lolRpcAssets.custom_champions[championName];
            }
        }
        if (presence) {
            lolCache[puuid] = presence;
            console.log(presence);
        }
    } catch (e) {
        err(e);
    }
}

const lolGetPresence = puuid => {
    const lolPresence = lolCache[puuid];
    if(lolPresence) return lolPresence;
}

/*****************
 **  WILD RIFT  **
 *****************/

const wrCache = {};

const wrProcessXMLData = data => {
    try {
        const puuid = data.substr(16, 36);

        // extract wild rift presence
        const wrData = riotExtractDataFromXML(data, "wildrift");
        if(wrData) {
            console.log(wrData);
            try {
                const timestamp = parseInt(riotExtractDataFromXML(wrData, "s.t"));
                const username = riotExtractDataFromXML(data, "m");
                wrProcessPresenceData(puuid, timestamp, username);
            } catch (e) {
                debugger
            }
        } else {
            delete wrCache[puuid];
        }
    } catch (e) {
        err(e);
    }
}

const wrProcessPresenceData = (puuid, timestamp, username) => {
    let presence = {
        application_id: customRpcAppId,
        name: "League of Legends: Wild Rift",
        type: 0,
        assets: {
            large_image: "889119952911630386",
            large_text: "Playing as " + username
        },
        timestamps: {
            start: timestamp
        }
    };

    wrCache[puuid] = presence;
    console.log(presence);
}

const wrGetPresence = puuid => {
    const wrPresence = wrCache[puuid];
    if(wrPresence) return wrPresence;
}



/**************
 **  PLUGIN  **
 **************/

let intervals = [];

module.exports = class CrossPlatformPlaying {
    load() {
        // Optional function. Called when the plugin is loaded in to memory
        if(!global.ZeresPluginLibrary) {
            // taken from WhoReacted plugin
            global.BdApi.showConfirmationModal("Library plugin is needed", `The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`, {
                confirmText: "Download",
                cancelText: "Cancel",
                onConfirm() {
                    const request = require("request"), fs = require("fs"), electron = require("electron");
                    request.get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", ((e, t, s) => {
                        if (e) return electron.shell.openExternal("https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js");
                        fs.writeFileSync(path.join(global.BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), s)
                    }))
                }
            })
        }
    }

    start() {
        // Required function. Called when the plugin is activated (including after reloads)

        // check if config json is valid
        try {
            BdApi.loadData("CrossPlatformPlaying", "");
        } catch(e) {
            // newlines don't work but whatever
            BdApi.alert("Your config JSON is invalid!\nTry putting it into an online JSON formatter to look for any errors.\n" + e);
            return;
        }

        for(const initFunction of initFunctions) {
            initFunction();
        }

        const ActivityStore = ZeresPluginLibrary.DiscordModules.UserStatusStore;

        BdApi.Patcher.after("CrossPlatformPlaying", ActivityStore, "getActivities", (_this, args, ret) => {
            const id = args[0];

            let newActivities = [];

            for(const presenceFunction of presenceFunctions) {
                const presence = presenceFunction(id);
                if(presence) {
                    if(Array.isArray(presence)) newActivities = newActivities.concat(presence)
                    else newActivities.push(presence);
                }
            }

            if(newActivities.length > 0) return newActivities.concat(ret); //ret.concat(newActivities);
            else return ret;
        });
    }
    stop() {
        // Required function. Called when the plugin is deactivated
        // TODO make each platform implement their own destroy function, like initFunctions and presenceFunctions
        pluginStopped = true;
        BdApi.Patcher.unpatchAll("CrossPlatformPlaying");
        for(const interval of intervals)
            clearInterval(interval);
        for(const timeout of hypixel_timeouts)
            clearTimeout(timeout);
        if(riotSocket) {
            riotSocket.end();
            riotSocket.destroy();
            if(riotSocketHeartbeatInterval) clearInterval(riotSocketHeartbeatInterval);
        }
    }

    getSettingsPanel() {
        const steamKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("Steam API Key", "https://steamcommunity.com/dev/apikey", steamApiKey, value => BdApi.saveData("CrossPlatformPlaying", "steam_key", value), {placeholder: "123456789ABCDEF123456789ABCDEF12"});
        const hypixelKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("Hypixel API Key", "Join Hypixel and use /api", hypixelApiKey, value => BdApi.saveData("CrossPlatformPlaying", "hypixel_key", value), {placeholder: "12345678-9abcd-ef12-3456-789abcdef123"});
        // doesn't work for riot cookies, Zeres textboxes have max char count of 999
        const riotCookiesTextbox = new ZeresPluginLibrary.Settings.Textbox("Riot Games Cookies", "Update CrossPlatformPlaying.config.json directly", riotCookies, () => {}, {disabled: true, placeholder: "did=abcdefghijklmnopqrstuvwxyz123456; osano_consentmanager=789abcdefghijklmnopqrstuvwxyz123456..."});
        const panel = new ZeresPluginLibrary.Settings.SettingPanel(() => {console.log("something changed in cpp settings")}, steamKeyTextbox, hypixelKeyTextbox, riotCookiesTextbox);
        return panel.getElement();
    }

}
