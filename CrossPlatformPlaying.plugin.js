/**
 * @name CrossPlatformPlaying
 * @author Giorgio
 * @description Show what people are playing on other platforms such as Steam and Valorant
 * @version 0.1
 * @authorId 316978243716775947
 */
/*@cc_on
@if (@_jscript)

    // Offer to self-install for clueless users that try to run this directly.
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\BetterDiscord\plugins");
    var pathSelf = WScript.ScriptFullName;
    // Put the user at ease by addressing them in the first person
    shell.Popup("It looks like you've mistakenly tried to run me directly. \n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        // Show the user where to put plugins in the future
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();
@else@*/


/**************
 **  HELPER  **
 **************/

const https = require("https")
const tls = require("tls");
const fs = require("fs");

// send an HTTP request to a URL, bypassing CORS policy
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
            let chunks = [];
            resp.on('data', (chunk) => chunks.push(chunk));
            resp.on('end', () => {
                res.body = Buffer.concat(chunks).toString(options.encoding || "utf8");
                resolve(res);
            });
        })
        req.write(options.body || "");
        req.end();
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

const platforms = [];

const pluginName = "CrossPlatformPlaying";
const customRpcAppId = "883483733875892264";

// the discord id of the current user (once the plugin loads)
let discord_id = 0;


// to implement a new platform, create a class that extends this class
// and override constructor(), start(), serializeData(), deserializeData(), getPresence(), destroy() and getSettings()
class Platform {
    // all platforms should call super() with their platformId
    constructor(platformId) {
        this.platformId = platformId; // used when storing the platform settings
        this.destroyed = false; // whether the platform should stop (e.g. the plugin is restarted)
    }

    // should be called in constructor if the platform is enabled
    start() {}

    // loads the plugin settings and calls deserializeData(). Should be called in constructor before start()
    loadData() {
        const data = BdApi.loadData(pluginName, this.platformId);
        this.deserializeData(data || {});
        this.saveData();
    }

    // save the data from serializeData() on disk
    saveData() {
        BdApi.saveData(pluginName, this.platformId, this.serializeData());
    }

    // returns a JSON serializable object containing the data to be saved on disk
    serializeData() {};

    // takes the JSON stored on disk and deserializes it to be used by the platform
    deserializeData(data) {};

    // helper method that can be used for simple platforms
    // platforms should implement getPresence with only one argument, discord_id
    getPresence(discord_id, discordToPlatformId, presenceCache) {
        if(!discord_id || !presenceCache || !discordToPlatformId || !discordToPlatformId[discord_id]) return;

        const presences = [];
        for (const platform_id of discordToPlatformId[discord_id]) {
            if(presenceCache[platform_id])
                presences.push(presenceCache[platform_id]);
        }
        if(presences) return presences;
    };

    // called when the plugin is stopped or the platform is disabled
    destroy() {};

    // should return an HTML element containing the settings panel
    // takes as argument an object containing a map of discord IDs to and from usernames
    getSettings() {
        const div = document.createElement("div");
        div.innerText = "No settings panel for " + this.platformId;
        return div;
    }
}

const SettingsBuilder = {
    enabledSwitch: (platform) => {
        const onChange = (value) => {
            const wasEnabled = platform.enabled;
            platform.enabled = value;
            if(!wasEnabled && value) platform.start();
            if(wasEnabled && !value) platform.destroy();
        }
        return new ZeresPluginLibrary.Settings.Switch("Enabled", "Whether this platform is enabled", platform.enabled, onChange);
    },
    settingsPanel: (platform, ...nodes) => {
        const panel = new ZeresPluginLibrary.Settings.SettingPanel(() => platform.saveData(), ...nodes);
        return panel.getElement();
    },
    createDatalist: (id, values) => {
        const datalist = document.createElement("datalist");
        datalist.id = id;
        for(const value of values) {
            const option = document.createElement("option");
            option.value = value;
            datalist.append(option);
        }
        return datalist;
    },
    userMapInterface: (platform, platformDatalist, discordDatalist, platformUserList, discordUserList, usersMap, platformHeaderValue, platformIdRegex=/./, discordIdRegex=/^\d{15,}$/) => {
        /** userList format: {
         *      idToName: {
         *          1234: "gary"
         *      },
         *      nameToId: {
         *          "gary": 1234
         *      }
         *  }
         */

        const userMapDiv = document.createElement("div");
        if(platformDatalist) userMapDiv.append(platformDatalist);

        const table = document.createElement("table");
        table.style.width = "100%";
        userMapDiv.append(table);

        // top row with + button and labels
        const topRow = document.createElement("tr");
        topRow.id = platform.platformId + "-row-top";

        const addRowButton = document.createElement("button");
        addRowButton.innerText = "+";
        addRowButton.className = "bd-button";
        const addRowButtonColumn = document.createElement("th");
        addRowButtonColumn.append(addRowButton);
        topRow.append(addRowButtonColumn);

        const platformColumnTitle = document.createElement("th");
        platformColumnTitle.innerText = platformHeaderValue || "Platform user";
        platformColumnTitle.style.color = "var(--header-primary)";
        // platformColumnTitle.className = "bd-name";
        topRow.append(platformColumnTitle);

        const discordColumnTitle = document.createElement("th");
        discordColumnTitle.innerText = "Discord user";
        discordColumnTitle.style.color = "var(--header-primary)";
        // discordColumnTitle.className = "bd-name";
        topRow.append(discordColumnTitle);

        table.append(topRow);

        // handle saving data to json
        let saveTimeout;
        const inputListener = () => {
            clearTimeout(saveTimeout);
            // delete all entries in old usersMap
            for(const user of Object.keys(usersMap)) delete usersMap[user];

            for(const row of table.children) {
                if(row.id === platform.platformId + "-row-top") continue;

                const [, platformColumn, discordColumn] = row.children;
                const platformInput = platformColumn.children[0];
                const discordInput = discordColumn.children[0];

                let platformValue = platformInput.value;
                let discordValue = discordInput.value;

                if(platformUserList && platformUserList.nameToId[platformValue]) {
                    platformValue = platformUserList.nameToId[platformValue];
                } else if(platformIdRegex && !platformIdRegex.test(platformValue)) {
                    platformInput.style.color = "red";
                    continue;
                }
                platformInput.style.color = null;

                if(discordUserList && discordUserList.nameToId[discordValue]) {
                    discordValue = discordUserList.nameToId[discordValue];
                } else if(discordIdRegex && !discordIdRegex.test(discordValue)) {
                    discordInput.style.color = "red";
                    continue;
                }
                discordInput.style.color = null;

                if(!platformValue || !discordValue) continue;

                if(Array.isArray(usersMap[discordValue])) {
                    usersMap[discordValue].push(platformValue);
                } else {
                    usersMap[discordValue] = [platformValue];
                }
            }
            console.log(usersMap);

            saveTimeout = setTimeout(() => {
                platform.saveData();
                console.log("saved data!");
            }, 500);
        }

        let id = 0;

        const addRow = (platformValue, discordValue, insertAtEnd=false) => {
            // reenable X button if disabled
            if(table.children.length === 2) {
                const remove_button = table.children[1].children[0].children[0];
                remove_button.disabled = false;
                remove_button.classList.remove("bd-button-disabled");
            }

            const row = document.createElement("tr");
            row.style.width = "100%";
            row.id = platform.platformId + "-row-" + id.toString();

            // X button
            const removeButton = document.createElement("button");
            removeButton.className = "bd-button";
            removeButton.innerText = "X";
            removeButton.onclick = () => removeRow(row.id);

            const removeButtonColumn = document.createElement("th");
            removeButtonColumn.append(removeButton);
            row.append(removeButtonColumn);

            // platform dropdown
            const platformInput = document.createElement("input");
            platformInput.className = "input-cIJ7To";
            platformInput.style.width = "100%";
            // platformInput.id = "platformInput-" + id;
            platformInput.oninput = inputListener;
            if(platformValue) platformInput.value = platformValue;
            if(platformDatalist) platformInput.setAttribute("list", platformDatalist.id);

            const platformInputColumn = document.createElement("th");
            platformInputColumn.style.width = "50%";
            platformInputColumn.append(platformInput);
            row.append(platformInputColumn);

            // discord dropdown
            const discordInput = document.createElement("input");
            discordInput.className = "input-cIJ7To";
            discordInput.style.width = "100%";
            // discordInput.id = "column2-" + id;
            discordInput.oninput = inputListener;
            if(discordValue) discordInput.value = discordValue;
            if(discordDatalist) discordInput.setAttribute("list", discordDatalist.id);

            const discordInputColumn = document.createElement("th");
            discordInputColumn.style.width = "50%";
            discordInputColumn.append(discordInput);
            row.append(discordInputColumn);

            if(insertAtEnd) table.append(row);
            else table.insertBefore(row, table.children[1]);

            id++;
        }
        addRowButton.onclick = () => addRow();

        const removeRow = (id) => {
            table.removeChild(document.getElementById(id));

            // if only one row remaining, disable X button
            if(table.children.length === 2) {
                const remove_button = table.children[1].children[0].children[0];
                remove_button.disabled = true;
                remove_button.classList.add("bd-button-disabled");
            }
        }

        if(Object.values(usersMap).flat().length === 0) {
            addRow("", "");
        } else {
            for(const [discord_id, platform_ids] of Object.entries(usersMap)) {
                for(const platform_id of platform_ids) {
                    addRow(platformUserList && platformUserList.idToName[platform_id] || platform_id,
                        discordUserList && discordUserList.idToName[discord_id] || discord_id, true);
                }
            }
        }

        return userMapDiv;
    }
}

/*************
 **  STEAM  **
 *************/

class Steam extends Platform {

    constructor() {
        super("steam");

        this.presenceCache = {};

        this.loadData();
        if(this.enabled) {
            this.start();
        }
    }

    start() {
        if(this.apiKey) {
            this.updateCache();

            // we are allowed 100000 requests/day = 64/minute
            this.cacheUpdateinterval = setInterval(this.updateCache.bind(this), 10_000);
        }
    }

    serializeData() {
        return {
            enabled: this.enabled || false,
            apiKey: this.apiKey || "",
            usersMap: this.discordToSteamIDs || {}
        }
    }

    deserializeData(data) {
        this.enabled = data.enabled || false;
        this.apiKey = data.apiKey || "";
        this.discordToSteamIDs = data.usersMap || {};
    }

    async getPlayerSummaries(ids) {
        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${ids.join(',')}`;
        const req = await fetch(url);

        if(req.statusCode === 403) {
            this.enabled = false;
            if(this.apiKey) BdApi.alert("Your Steam API key is invalid! Steam has been disabled, reenable it in settings.");
            else BdApi.alert("You haven't provided a Steam API key!");
            this.destroy();
            return;
        } else if(req.statusCode !== 200) {
            console.error("HTTP error " + req.statusCode + " when fetching steam data", req);
            return;
        }

        try {
            const json_data = JSON.parse(req.body);
            if (!json_data.response || !json_data.response.players) return;
            for (const playerSummary of json_data.response.players) {
                this.processPlayerSummary(playerSummary);
            }
        } catch (e) {
            console.error(e);
            console.error(req);
            err("Couldn't JSON Parse Steam response!");
        }
    }

    processPlayerSummary(summary) {
        // format: https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_.28v0002.29
        if(summary.gameextrainfo) {
            const statuses = ["Offline", "Playing", "Busy", "Away", "Snoozed", "Looking to trade", "Looking to play"];
            const previousPresence = this.presenceCache[summary.steamid]
            this.presenceCache[summary.steamid] = {
                application_id: customRpcAppId,
                name: summary.gameextrainfo,
                details: `${statuses[summary.personastate]} on Steam`,
                type: 0,
                timestamps: {start: previousPresence ? previousPresence.timestamps.start : +new Date()},
                assets: {
                    large_image: "883490890377756682",
                    large_text: "Playing as " + summary.personaname
                },
                username: summary.personaname
            };
        } else {
            delete this.presenceCache[summary.steamid];
        }
    }

    updateCache() {
        if(this.destroyed) return clearInterval(this.cacheUpdateinterval);
        try {
            const steam_ids = Object.values(this.discordToSteamIDs).flat();

            // can only request 100 steam profiles at a time
            for (let i = 0; i < steam_ids.length; i += 100) {
                this.getPlayerSummaries(steam_ids.slice(i, i + 100));
            }
        } catch (e) {
            err(e);
        }
    }

    getPresence(discord_id) {
        return super.getPresence(discord_id, this.discordToSteamIDs, this.presenceCache);
    }

    getSettings(discordUserList, discordUsersDatalist) {
        // enabled switch
        const enabledSwitch = SettingsBuilder.enabledSwitch(this);

        // api key textbox
        const textboxChange = (value) => this.apiKey = value;
        const apiKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("API Key", "Your Steam API key", this.apiKey, textboxChange);

        const userMapDiv = SettingsBuilder.userMapInterface(this, null, discordUsersDatalist, null, discordUserList, this.discordToSteamIDs, "Steam ID", /^\d+$/);

        return SettingsBuilder.settingsPanel(this, enabledSwitch, apiKeyTextbox, userMapDiv);
    }

    destroy() {
        clearInterval(this.cacheUpdateinterval);
    }
}

platforms.push(Steam);


/***************
 **  HYPIXEL  **
 ***************/

class Hypixel extends Platform {

    constructor() {
        super("hypixel");

        this.timeouts = [];
        this.presenceCache = {};

        this.loadData();

        if(this.enabled) {
            this.start();
        }
    }

    start() {
        if(this.apiKey) {
            this.fetchGames().then(() => {
                this.updateCache();
                this.cacheInterval = setInterval(this.updateCache.bind(this), this.calculateRefreshInterval());
            });
        }
    }

    serializeData() {
        return {
            enabled: this.enabled || false,
            apiKey: this.apiKey || "",
            usersMap: this.discordToMinecraftUUIDs || {}
        }
    }

    deserializeData(data) {
        this.enabled = data.enabled || false;
        this.apiKey = data.apiKey || "";
        this.discordToMinecraftUUIDs = data.usersMap || {};
    }

    getPresence(discord_id) {
        return super.getPresence(discord_id, this.discordToMinecraftUUIDs, this.presenceCache);
    }

    destroy() {
        clearInterval(this.cacheInterval);
        for(const timeout of this.timeouts)
            clearTimeout(timeout);
    }

    async fetchGames() {
        // todo use https://github.com/slothpixel/hypixelconstants
        const req = await fetch("https://api.hypixel.net/resources/games");
        const json_body = JSON.parse(req.body)
        if(!json_body.success) {
            console.error(json_body);
            return err("Could not fetch hypixel gamemodes!");
        }
        this.games = json_body.games;
    }

    calculateRefreshInterval() {
        // hypixel allows 2 requests per second
        // each player takes 1 request if offline, 2 if online
        // to be safe, I do max 1 request / 2 sec -> 1 player / 4 sec
        // aka if there are 3 players, we request all players every 12 seconds
        return Object.keys(this.discordToMinecraftUUIDs).length * 4000;

    }

    async getPlayerStatus(uuid) {
        const url = `https://api.hypixel.net/status?key=${this.apiKey}&uuid=${uuid}`;
        const req = await fetch(url);

        if(req.statusCode === 403) {
            this.enabled = false;
            if(this.apiKey) BdApi.alert("Your Hypixel API key is invalid! The Hypixel plugin has been disabled, reenable it in settings.");
            else BdApi.alert("You haven't provided a Hypixel API key!");
            this.destroy();
            return;
        } else if(req.statusCode !== 200) {
            console.error("HTTP error " + req.statusCode + " when fetching hypixel player status data", req);
            return;
        }

        try {
            const json_data = JSON.parse(req.body);
            if(json_data.success && json_data.session.online) {
                this.getPlayerInfo(uuid, json_data.session);
            } else {
                delete this.presenceCache[uuid];
                if(!json_data.success) {
                    console.error(json_data);
                    err("Could not fetch player status for player with UUID " + uuid + "!");
                }
            }
        } catch (e) {
            console.error(e);
            console.error(data);
            err("Couldn't JSON Parse Hypixel status response!");
        }
    }

    async getPlayerInfo(uuid, session) {
        const url = `https://api.hypixel.net/player?key=${this.apiKey}&uuid=${uuid}`;
        const req = await fetch(url);

        if(req.statusCode !== 200) {
            console.error("HTTP error " + req.statusCode + " when fetching hypixel player info", req);
            return;
        }

        try {
            const json_data = JSON.parse(req.body);
            if (json_data.success) {
                this.processPlayerData(uuid, json_data.player, session);
            } else {
                console.error(json_data);
                err("Could not fetch player info for player with UUID " + uuid + "!");
            }
        } catch (e) {
            console.error(e);
            console.error(req);
            err("Couldn't JSON Parse Hypixel player response!");
        }
    }

    processPlayerData(uuid, player, session) {
        try {
            const game = this.games[session.gameType] || {};

            const presence = {
                application_id: customRpcAppId,
                name: "Hypixel",
                details: "Playing " + game.name || session.gameType,
                state: game.modeNames && game.modeNames[session.mode] || session.mode,
                type: 0,
                timestamps: {start: player.lastLogin},
                assets: {
                    large_image: "883490391964385352",
                    large_text: "Playing as " + player.displayname,
                },
                username: player.displayname
            };

            if(session.map) {
                presence.assets.small_image = "883498326580920403";
                presence.assets.small_text = session.map;
            }

            this.presenceCache[uuid] = presence;
        } catch(e) {
            console.error(e);
            console.error(player, session);
            err("Error while processing Hypixel data!");
        }
    }

    updateCache() {
        if(this.destroyed) return clearInterval(this.cacheInterval);
        try {
            const uuids = Object.values(this.discordToMinecraftUUIDs);

            for (let i = 0; i < uuids.length; i++) {
                this.timeouts.push(setTimeout(() => {
                    this.getPlayerStatus(uuids[i]);
                    this.timeouts.shift();
                }, 1000 * i));
            }
        } catch (e) {
            err(e);
        }
    }

    getSettings(discordUserList, discordUsersDatalist) {
        // enabled switch
        const enabledSwitch = SettingsBuilder.enabledSwitch(this);

        // api key textbox
        const textboxChange = (value) => this.apiKey = value;
        const apiKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("API Key", "Your Hypixel API key", this.apiKey, textboxChange);

        // uuid regex adapted from https://stackoverflow.com/a/14166194/6087491
        const userMapDiv = SettingsBuilder.userMapInterface(this, null, discordUsersDatalist, null, discordUserList, this.discordToMinecraftUUIDs, "Minecraft UUID", /^[a-f0-9]{8}-?[a-f0-9]{4}-?4[a-f0-9]{3}-?[89aAbB][a-f0-9]{3}-?[a-f0-9]{12}$/);

        return SettingsBuilder.settingsPanel(this, enabledSwitch, apiKeyTextbox, userMapDiv);
    }
}

platforms.push(Hypixel);

/**************
 **  TWITCH  **
 **************/

class Twitch extends Platform {

    constructor() {
        super("twitch");

        this.presenceCache = {};
        this.usersList = {
            idToName: {},
            nameToId: {}
        }

        this.loadData();
        if(this.enabled) {
            this.start();
        }
    }

    start() {
        if(this.oauthKey) {
            this.getOnlineFriends();
            this.interval = setInterval(this.getOnlineFriends, 30_000);
        }
    }

    serializeData() {
        return {
            enabled: this.enabled || false,
            oauthKey: this.oauthKey || "",
            usersMap: this.discordToTwitchID || {}
        }
    }

    deserializeData(data) {
        this.enabled = data.enabled || false;
        this.oauthKey = data.oauthKey || "";
        this.discordToTwitchID = data.usersMap || {};
    }

    getPresence(discord_id) {
        return super.getPresence(discord_id, this.discordToTwitchID, this.presenceCache);
    }

    destroy() {
        clearInterval(this.interval);
    }

    async getOnlineFriends() {
        if(this.destroyed || !this.oauthKey) return clearInterval(this.interval);

        const data = await fetch("https://gql.twitch.tv/gql", {
            method: "POST",
            headers: {
                "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
                "Authorization": `OAuth ${this.oauthKey}`
            },
            body: JSON.stringify([{operationName: "OnlineFriends", variables: {}, extensions: {persistedQuery: {version: 1, sha256Hash: "4fecfced6ce413ffa2eee3c6ce09cddd8fb251763c594c26fba5108cf2b92e69"}}}])
        });

        try {
            if(data.body.length <= 2) return;
            const json_data = JSON.parse(data.body);
            if (json_data.status === 401) {
                clearInterval(this.interval);
                console.error(json_data);
                return err("Error 401 when fetching twitch friends!");
            }

            this.usersList = {
                idToName: {},
                nameToId: {}
            }
            for (const friend of json_data[0].data.currentUser.friends.edges) {
                this.processFriend(friend.node);
            }
        } catch (e) {
            console.error(e);
            console.error(data);
            err("Couldn't JSON Parse Twitch response!", data);
        }
    }

    processFriend(friend) {
        // add friend to usersList
        this.usersList.idToName[friend.id] = friend.login;
        this.usersList.nameToId[friend.login] = friend.id;

        if(friend.activity) {
            const previousPresence = this.presenceCache[friend.id];
            // todo fetch the title of the stream, that could be cool
            if(friend.activity.type === "WATCHING") {
                if(!friend.activity.user.stream) // they are watching someone that is no longer streaming (their presence hasn't updated yet)
                    return delete this.presenceCache[friend.id];

                const isWatchingSamePerson = previousPresence && previousPresence.details.substr(9) === friend.activity.user.displayName;
                const away = friend.availability === "AWAY";

                // the way type 3 (watching) presences are rendered is weird
                // the large_text is shown both when hovering the image but also underneath the details (this is because that's how spotify Listening activities are rendered)
                // in the "Active Now" tab in the friends list it only says "watching a stream" instead of rendering the whole activity like type 0 (playing) does
                // the only reason type 3 exists in the first place is for YouTube Together as far as I can tell, so not much thought has been put into it
                this.presenceCache[friend.id] = {
                    application_id: away ? customRpcAppId : null,
                    name: "Twitch",
                    details: `Watching ${friend.activity.user.displayName}`,
                    state: friend.activity.user.stream.game.displayName,
                    type: 3,
                    timestamps: {start: isWatchingSamePerson ? previousPresence.timestamps.start : +new Date()},
                    assets: {
                        large_image: away ? "899072297216913449" : "twitch:" + friend.activity.user.login,
                        large_text: (away ? "Away as " : "As ") + friend.displayName
                    },
                    username: friend.displayName
                }
            } else if(friend.activity.type === "STREAMING") this.presenceCache[friend.id] = {
                name: "Twitch",
                state: friend.activity.stream.game.displayName,
                type: 1,
                assets: {
                    large_image: "twitch:" + friend.login,
                    large_text: "As " + friend.displayName
                },
                url: "https://twitch.tv/" + friend.login,
                id: "",
                username: friend.displayName
            }
        } else {
            delete this.presenceCache[friend.id];
        }
    }

    getSettings(discordUserList, discordUsersDatalist) {
        // enabled switch
        const enabledSwitch = SettingsBuilder.enabledSwitch(this);

        // api key textbox
        const textboxChange = (value) => this.oauthKey = value;
        const apiKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("OAuth Key", "Your Twitch OAuth key", this.oauthKey, textboxChange);

        const datalist = SettingsBuilder.createDatalist("twitch", Object.keys(this.usersList.nameToId));
        const userMapDiv = SettingsBuilder.userMapInterface(this, datalist, discordUsersDatalist, this.usersList, discordUserList, this.discordToTwitchID, "Twitch username", /^\d+$/);

        return SettingsBuilder.settingsPanel(this, enabledSwitch, apiKeyTextbox, userMapDiv);
    }
}
platforms.push(Twitch);

/************
 **  RIOT  **
 ************/

const riotDebug = true; // change this to not output riot debug to console
const riotLog = s => {
    if(!riotDebug) return;
    if(typeof s === "object") console.log("RIOT:", s);
    else console.log("RIOT: " + s);
}

const riotHeaders = {
    // "cloudflare bitches at us without a user-agent" - molenzwiebel
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
}

class Riot extends Platform {

    constructor() {
        super("riot");

        this.riotPUUIDToUsername = {};
        this.riotPUUIDToSummonerName = {};

        this.valorant = new Valorant(this.riotPUUIDToUsername, this.riotPUUIDToSummonerName);
        this.lol = new Lol(this.riotPUUIDToUsername, this.riotPUUIDToSummonerName);
        this.wildRift = new WildRift(this.riotPUUIDToUsername, this.riotPUUIDToSummonerName);

        this.loadData()
        if (this.enabled) {
            this.start();
        }
    }

    start() {
        if(this.cookies) {
            this.valorant.fetchRpcAssets()
            this.lol.fetchData();
            this.startXMPPConnection();
        }
    }

    serializeData() {
        return {
            enabled: this.enabled || false,
            cookies: this.cookies || "",
            usersMap: this.discordToRiotPUUIDs || {}
        }
    }

    deserializeData(data) {
        this.enabled = data.enabled || false;
        this.cookies = data.cookies || "";
        this.discordToRiotPUUIDs = data.usersMap || {};
    }


    getPresence(discord_id) {
        const puuids = this.discordToRiotPUUIDs[discord_id];
        if (!puuids) return;

        const presences = [];

        for (const puuid of puuids) {
            const valPresence = this.valorant.getPresence(puuid);
            if(valPresence) presences.push(valPresence);

            const lolPresence = this.lol.getPresence(puuid);
            if(lolPresence) presences.push(lolPresence);

            const wrPresence = this.wildRift.getPresence(puuid);
            if(wrPresence) presences.push(wrPresence);
        }

        if(presences) return presences;
    }

    destroy() {
        this.destroyed = true;
        clearInterval(this.reconnectInterval);
        clearTimeout(this.heartbeat);
        if(this.socket) {
            this.socket.write("</stream:stream>");
            this.socket.destroy();
        }
    }

    async refreshToken(cookies) {
        const res = await fetch("https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&scope=account%20ban%20link%20lol%20offline_access%20openid&nonce=123", {
            method: "GET",
            headers: {
                ...riotHeaders,
                "cookie": cookies
            },
        });
        this.updateCookies(res.headers['set-cookie']);
        const uri = res.headers.location;
        return uri.split(/[=&]/, 2)[1];
    }

    updateCookies(newCookies) {
        const cookies = {};

        // parse old cookies
        for(const cookie of this.cookies.split("; ")) {
            const split = cookie.split('=');
            cookies[split.shift()] = split.join("=");
        }

        // replace with new cookies
        for(const cookie of newCookies) {
            const sep = cookie.indexOf("=");
            cookies[cookie.slice(0, sep)] = cookie.slice(sep + 1, cookie.indexOf(';'));
        }

        const cookieList = [];
        for (let [key, value] of Object.entries(cookies)) {
            cookieList.push(key + "=" + value);
        }

        this.cookies = cookieList.join("; ");
        this.saveData();
    }

    getCookiesFromLauncher() {
        const filepath = process.env.LOCALAPPDATA + "/Riot Games/Riot Client/Data/RiotClientPrivateSettings.yaml";
        
        let fileContents;
        try {
            fileContents = fs.readFileSync(filepath).toString();
        } catch(e) {
            return [false, e];
        }

        const parsedContents = this.parseYaml(fileContents);
        if(parsedContents) {
            const cookies = [];
            for(const cookie of parsedContents.private["riot-login"].persist.session.cookies) {
                if(cookie.domain !== "auth.riotgames.com") continue;
                cookies.push(cookie.name + '=' + cookie.value);
            }
            return [true, cookies.join("; ")];
        }

        return [false, "Could not parse file! Is it corrupt?"];
    }

    parseYaml(yaml) {
        const result = {};
        const path = [];
        let depth = 0;

        let currentObject = result;
        let currentObjectName = "";

        for(const line of yaml.split('\n')) {
            if(!line) continue;

            const array_matches = line.match(/^( {4})*(- {3})(.+):( (.+))?/);
            if(array_matches) {
                let array = path[path.length - 1];
                currentObject = {};
                if(Array.isArray(array)) {
                    array.push(currentObject);
                } else {
                    array = [currentObject];
                    path[path.length - 1][currentObjectName] = array;
                    path.push(array);
                }

                currentObject[array_matches[3]] = JSON.parse(array_matches[5]);
                continue;
            }

            const matches = line.match(/^(( {4})*)(.+):( (.+))?/);
            if(matches) {
                while((matches[1] && matches[1].length || 0) / 4 < depth) {
                    currentObject = path.pop();
                    depth--;
                }

                if(matches[4]) {
                    currentObject[matches[3]] = JSON.parse(matches[5]);
                } else {
                    let newObject = {};
                    currentObjectName = matches[3];
                    currentObject[currentObjectName] = newObject;
                    path.push(currentObject);
                    currentObject = newObject;
                    depth++;
                }
                continue;
            }

            console.error("no matches for line: " + line);
            return false;
        }

        return result;
    }

    async getPAS(token) {
        const res3 = await fetch("https://riot-geo.pas.si.riotgames.com/pas/v1/service/chat", {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + token,
            },
        });
        return res3.body
    }

    decodeToken(token) {
        return JSON.parse(atob(token.split('.')[1]));
    }

    // xmpp stuff
    establishXMPPConnection(RSO, PAS) {
        try {
            const region = this.decodeToken(PAS).affinity;
            const address = this.XMPPRegionURLs[region];
            const port = 5223;
            const XMPPRegion = this.XMPPRegions[region];

            const messages = [
                `<?xml version="1.0"?><stream:stream to="${XMPPRegion}.pvp.net" version="1.0" xmlns:stream="http://etherx.jabber.org/streams">`,
                `<auth mechanism="X-Riot-RSO-PAS" xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><rso_token>${RSO}</rso_token><pas_token>${PAS}</pas_token></auth>`,
                `<?xml version="1.0"?><stream:stream to="${XMPPRegion}.pvp.net" version="1.0" xmlns:stream="http://etherx.jabber.org/streams">`,
                "<iq id=\"_xmpp_bind1\" type=\"set\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"></bind></iq>",
                "<iq id=\"_xmpp_session1\" type=\"set\"><session xmlns=\"urn:ietf:params:xml:ns:xmpp-session\"/></iq>",
                "<iq type=\"get\" id=\"2\"><query xmlns=\"jabber:iq:riotgames:roster\" last_state=\"true\" /></iq>", // get friends list
                "<presence/>"
            ]

            const sock = tls.connect(port, address, {}, () => {
                try {
                    riotLog("Connected!");

                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;

                    sendNext();
                } catch (e) {
                    err(e);
                }
            });
            this.socket = sock;

            const send = data => {
                try {
                    if(sock.readyState === "open") sock.write(data, "utf8", () => riotLog("-> " + data));

                    clearTimeout(this.heartbeat);
                    this.heartbeat = setTimeout(() => send(" "), 150_000);
                } catch (e) {
                    err(e);
                }
            }

            const sendNext = () => send(messages.shift());

            let bufferedMessage = "";

            sock.on("data", data => {
                try {
                    data = data.toString();
                    riotLog("<- " + data);
                    if(messages.length > 0) sendNext();

                    // handle riot splitting messages into multiple parts
                    if(data.startsWith("<?xml")) return;
                    let oldBufferedMessage = null;
                    while(oldBufferedMessage !== bufferedMessage) {
                        oldBufferedMessage = bufferedMessage;
                        data = bufferedMessage + data;
                        if(data === "") return;
                        if(!data.startsWith('<')) return err("RIOT: xml presence data doesn't start with '<'! " + data);

                        const firstTagName = data.substring(1, data.indexOf('>')).split(' ', 1)[0];

                        // check for self closing tag eg <presence />
                        if(data.search(/<[^<>]+\/>/) === 0) data = data.replace("/>", `></${firstTagName}>`);

                        const closingTagIndex = data.indexOf(`</${firstTagName}>`);
                        if(closingTagIndex === -1) {
                            // message is split, we need to wait for the end
                            bufferedMessage = data;
                            break;
                        }

                        const firstTagEnd = closingTagIndex + `</${firstTagName}>`.length;
                        bufferedMessage = data.substr(firstTagEnd); // will be empty string if only one tag
                        data = data.substr(0, firstTagEnd);

                        if(firstTagName === "presence") {
                            this.valorant.processXMLData(data);
                            this.lol.processXMLData(data);
                            this.wildRift.processXMLData(data);
                        } else if(firstTagName === "iq") {
                            if(data.includes("jabber:iq:riotgames:roster")) {
                                this.processFriendsList(data);
                            } else if(data.includes("_xmpp_session") && data.includes("urn:ietf:params:xml:ns:xmpp-session")) {
                                this.processOwnUsername(data, this.decodeToken(PAS).sub);
                            }
                        } else if(firstTagName === "failure") {
                            const errorStartIndex = data.indexOf('>') + 1;
                            const error = data.substring(errorStartIndex, closingTagIndex);
                            if(error.includes("token-expired")) {
                                this.destroy();
                                this.start();
                            } else {
                                console.error(data);
                                err("Riot XMPP Connection failed! " + error);
                                this.destroy();
                            }
                        }

                        data = "";
                    }
                } catch (e) {
                    err(e);
                }
            });

            sock.on("error", console.error);
            sock.on("close", () => {
                if(this.destroyed) return riotLog("Socket disconnected!");

                console.error("Riot Connection Closed! Retrying in 5 seconds...");

                if(this.reconnectInterval) return;

                this.reconnectInterval = setInterval(() => {
                    this.establishXMPPConnection(RSO, PAS);
                }, 5000);

                clearTimeout(this.heartbeat);
            });
        } catch (e) {
            err(e);
        }
    }

    async startXMPPConnection() {
        // todo do not hardcode these, get these from clientconfig endpoint
        this.XMPPRegions = {"as2":"as2","asia":"jp1","br1":"br1","eu":"ru1","eu3":"eu3","eun1":"eu2","euw1":"eu1","jp1":"jp1","kr1":"kr1","la1":"la1","la2":"la2","na1":"na1","oc1":"oc1","pbe1":"pb1","ru1":"ru1","sea1":"sa1","sea2":"sa2","sea3":"sa3","sea4":"sa4","tr1":"tr1","us":"la1","us-br1":"br1","us-la2":"la2","us2":"us2"};
        this.XMPPRegionURLs = {"as2":"as2.chat.si.riotgames.com","asia":"jp1.chat.si.riotgames.com","br1":"br.chat.si.riotgames.com","eu":"ru1.chat.si.riotgames.com","eu3":"eu3.chat.si.riotgames.com","eun1":"eun1.chat.si.riotgames.com","euw1":"euw1.chat.si.riotgames.com","jp1":"jp1.chat.si.riotgames.com","kr1":"kr1.chat.si.riotgames.com","la1":"la1.chat.si.riotgames.com","la2":"la2.chat.si.riotgames.com","na1":"na2.chat.si.riotgames.com","oc1":"oc1.chat.si.riotgames.com","pbe1":"pbe1.chat.si.riotgames.com","ru1":"ru1.chat.si.riotgames.com","sea1":"sa1.chat.si.riotgames.com","sea2":"sa2.chat.si.riotgames.com","sea3":"sa3.chat.si.riotgames.com","sea4":"sa4.chat.si.riotgames.com","tr1":"tr1.chat.si.riotgames.com","us":"la1.chat.si.riotgames.com","us-br1":"br.chat.si.riotgames.com","us-la2":"la2.chat.si.riotgames.com","us2":"us2.chat.si.riotgames.com"};

        const access_token = await this.refreshToken(this.cookies);
        if(!access_token.startsWith('e')) {
            riotLog("Riot Access Token: " + access_token);
            return err("Invalid Riot access token! Most likely your cookies are either invalid or expired.");
        }

        const pas_token = await this.getPAS(access_token);

        if(!this.discordToRiotPUUIDs[discord_id])
            this.discordToRiotPUUIDs[discord_id] = [this.decodeToken(pas_token).sub];

        this.establishXMPPConnection(access_token, pas_token);
    }

    static extractDataFromXML(xml, tagName, startIndex, endIndex) {
        const dataStartIndex = xml.indexOf(`<${tagName}>`, startIndex, endIndex);
        const dataEndIndex = xml.indexOf(`</${tagName}>`, dataStartIndex, endIndex);
        if(dataStartIndex >= 0 && dataEndIndex > dataStartIndex) {
            const data = xml.substring(dataStartIndex + tagName.length + 2, dataEndIndex)
            if(data) return data;
        }
    }

    processOwnUsername(data, puuid) {
        const usernameIndex = data.indexOf("name=") + 6;
        const username = data.substring(usernameIndex, data.indexOf("' ", usernameIndex));

        const taglineIndex = data.indexOf("tagline=") + 9;
        const tagline = data.substring(taglineIndex, data.indexOf("'/>", taglineIndex));

        this.riotPUUIDToUsername[puuid] = `${username}#${tagline}`;
        riotLog("My username is " + this.riotPUUIDToUsername[puuid]);

        const lolTagIndex = data.indexOf("<lol ");

        if(lolTagIndex > -1) {
            const lolNameIndex = data.indexOf("name=", lolTagIndex) + 6;
            const lolName = data.substring(lolNameIndex, data.indexOf("'", lolNameIndex));

            this.riotPUUIDToSummonerName[puuid] = lolName
            riotLog("My summoner name is " + lolName);
        }
    }

    processFriendsList(data) {
        const queryTag = data.substring(data.indexOf("<query xmlns='jabber:iq:riotgames:roster'>") + 42, data.indexOf("</query>"));
        const items = queryTag.split("</item>");

        for(const item of items) {
            if(!item) continue;

            const puuid = item.substr(11, 36);

            // riot ID
            const idTagIndex = item.indexOf("<id ");

            const usernameIndex = item.indexOf("name=", idTagIndex) + 6;
            const username = item.substring(usernameIndex, item.indexOf("' ", usernameIndex));

            const taglineIndex = item.indexOf("tagline=", idTagIndex) + 9;
            const tagline = item.substring(taglineIndex, item.indexOf("'/>", taglineIndex));

            this.riotPUUIDToUsername[puuid] = `${username}#${tagline}`;

            // lol summoner name
            const lolTagIndex = item.indexOf("<lol ");

            if(lolTagIndex > -1) {
                const lolNameIndex = item.indexOf("name=", lolTagIndex) + 6;
                const lolName = item.substring(lolNameIndex, item.indexOf("'", lolNameIndex));

                this.riotPUUIDToSummonerName[puuid] = lolName;
            }

        }
        riotLog(this.riotPUUIDToUsername);
        riotLog(this.riotPUUIDToSummonerName);
    }

    getSettings(discordUserList, discordUsersDatalist) {
        // enabled switch
        const enabledSwitch = SettingsBuilder.enabledSwitch(this);

        // cookies textbox
        const textboxChange = (value) => this.cookies = value;
        const cookiesTextbox = new ZeresPluginLibrary.Settings.Textbox("Auth Cookies", "Your auth.riotgames.com cookies", this.cookies, textboxChange).getElement();
        setTimeout(() => {
            cookiesTextbox.children[0].children[1].children[0].removeAttribute("maxlength");

            const fetchCookiesButton = document.createElement("button");
            fetchCookiesButton.innerText = "Fetch cookies from launcher";
            fetchCookiesButton.classList.add("bd-button");
            fetchCookiesButton.style.marginTop = "10px";
            fetchCookiesButton.onclick = () => {
                const [success, cookies] = this.getCookiesFromLauncher();
                if(success) {
                    this.cookies = cookies;
                    cookiesTextbox.children[0].children[1].children[0].value = cookies;
                } else {
                    console.error(cookies);
                }
            }
            cookiesTextbox.children[0].insertBefore(fetchCookiesButton, cookiesTextbox.children[0].children[2]);
        }, 50);

        const usersList = {
            idToName: this.riotPUUIDToUsername,
            nameToId: {}
        }
        for(const [puuid, username] of Object.entries(this.riotPUUIDToUsername)) {
            usersList.nameToId[username] = puuid;
        }
        const datalist = SettingsBuilder.createDatalist("riot", Object.keys(usersList.nameToId));
        const userMapDiv = SettingsBuilder.userMapInterface(this, datalist, discordUsersDatalist, usersList, discordUserList, this.discordToRiotPUUIDs, "Riot username", /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);

        return SettingsBuilder.settingsPanel(this, enabledSwitch, cookiesTextbox, userMapDiv);
    }
}

platforms.push(Riot);

/****************
 **  VALORANT  **
 ****************/

const valRpcAppID = "811469787657928704"; // https://github.com/colinhartigan/valorant-rpc

class Valorant {
    constructor(riotPUUIDToUsername) {
        this.riotPUUIDToUsername = riotPUUIDToUsername;

        // constants
        this.gamemodes = {
            "newmap": "New Map",
            "competitive": "Competitive",
            "unrated": "Unrated",
            "spikerush": "Spike Rush",
            "deathmatch": "Deathmatch",
            "ggteam": "Escalation",
            "onefa": "Replication",
            "snowball": "Snowball Fight",
            "custom": "Custom",
            "": "Custom"
        }
        this.maps = {
            "Triad": "Haven",
            "Duality": "Bind",
            "Bonsai": "Split",
            "Port": "Icebox",
            "Ascent": "Ascent",
            "Foxtrot": "Breeze",
            "Canyon": "Fracture",
            "Range": "The Range"
        }
        this.ranks = [
            'UNRANKED', 'Unused1', 'Unused2',
            'IRON 1', 'IRON 2', 'IRON 3',
            'BRONZE 1', 'BRONZE 2', 'BRONZE 3',
            'SILVER 1', 'SILVER 2', 'SILVER 3',
            'GOLD 1', 'GOLD 2', 'GOLD 3',
            'PLATINUM 1', 'PLATINUM 2', 'PLATINUM 3',
            'DIAMOND 1', 'DIAMOND 2', 'DIAMOND 3',
            'IMMORTAL 1', 'IMMORTAL 2', 'IMMORTAL 3',
            'RADIANT', 'Better than Radiant'
        ]

        this.presenceCache = {};
        this.assets = {}; // https://discord.com/api/v9/oauth2/applications/811469787657928704/assets
    }

    async fetchRpcAssets() {
        const assetsReq = await fetch(`https://discord.com/api/v9/oauth2/applications/${valRpcAppID}/assets`);
        const assetList = JSON.parse(assetsReq.body);
        for(const asset of assetList) {
            // format: {"id": "821415501942882324", "type": 2, "name": "splash_icebox_square"}
            this.assets[asset.name] = asset.id;
        }
    }

    processXMLData(data) {
        try {
            const puuid = data.substr(16, 36);

            // extract valorant presence
            const valorantData = Riot.extractDataFromXML(data, "valorant");
            if(valorantData) {
                const base64Data = Riot.extractDataFromXML(valorantData, "p");
                const timestamp = parseInt(Riot.extractDataFromXML(valorantData, "s.t"));
                try {
                    const presenceData = JSON.parse(atob(base64Data));
                    this.processPresenceData(puuid, presenceData, timestamp);
                } catch (e) {
                    debugger
                }
            } else {
                delete this.presenceCache[puuid];
            }
        } catch (e) {
            err(e);
        }
    }

    processPresenceData(puuid, presenceData, timestamp) {
        riotLog(presenceData)

        try {
            const parseDate = s => {
                const year = parseInt(s.substr(0, 4)),
                    month = parseInt(s.substr(5, 2)) - 1,
                    day = parseInt(s.substr(8, 2)),
                    hour = parseInt(s.substr(11, 2)),
                    minute = parseInt(s.substr(14, 2)),
                    second = parseInt(s.substr(17, 2));
                if (year === 1) return timestamp;
                return +Date.UTC(year, month, day, hour, minute, second);
            }

            const previousPresence = this.presenceCache[puuid];
            const map = presenceData.provisioningFlow === "ShootingRange" ? "Range" : presenceData.matchMap.split('/').pop();
            const username = this.riotPUUIDToUsername[puuid];

            const getGamemode = () => {
                if(presenceData.queueId === "") {
                    if(previousPresence && previousPresence.details.startsWith("In Queue - ")) return previousPresence.details.substr(11);
                    return "Custom";
                }
                const modeName = this.gamemodes[presenceData.queueId];
                return modeName || presenceData.queueId;
            }
            const getMapName = () => {
                const mapName = this.maps[map] || map;
                if(mapName) return mapName;
                else {
                    // no map data, get map name from previous presence
                    if(previousPresence) {
                        const previousMapName = previousPresence.assets.large_text.split(" | ")[0];
                        if(previousMapName !== "No map data" && previousMapName !== "In Lobby")
                            return previousMapName;
                    }
                }
                return "No map data";
            }
            const getMapIcon = () => {
                if(map === "" && presenceData.sessionLoopState === "INGAME") {
                    // no map data, get map icon from previous presence
                    if(previousPresence && previousPresence.assets.large_image !== this.assets["game_icon"] && previousPresence.assets.large_image !== this.assets["game_icon_yellow"])
                        return previousPresence.assets.large_image;
                }
                const mapCodename = this.maps[map];
                if(!mapCodename) return this.assets["game_icon_white"];
                return this.assets[`splash_${map === "Range" ? "range" : mapCodename.toLowerCase()}_square`];
            }
            const getPartyText = () => `${presenceData.partyAccessibility === "OPEN" ? "Open" : "Closed"} Party${presenceData.isPartyOwner ? " Leader" : ""}`;
            const getStartTimestamp = () => {
                if(presenceData.sessionLoopState === "MENUS") {
                    if(presenceData.partyState === "MATCHMAKING")
                        return parseDate(presenceData.queueEntryTime); // in queue, return start queue time
                    if(previousPresence && (previousPresence.details.startsWith("Lobby - ") || previousPresence.details === "Setting Up Custom Game"))
                        return previousPresence.timestamps.start;
                    return timestamp;
                } else if(presenceData.sessionLoopState === "INGAME") {
                    if(previousPresence && previousPresence.details.startsWith("Custom"))
                        return previousPresence.timestamps.start;
                    if(presenceData.provisioningFlow === "ShootingRange") {
                        if(previousPresence && previousPresence.provisioningFlow === "ShootingRange")
                            return previousPresence.timestamps.start;
                        return timestamp;
                    }
                }

                return parseDate(presenceData.queueEntryTime) || timestamp;
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
                    small_image: this.assets["rank_" + presenceData.competitiveTier] || this.assets["rank_0"],
                    small_text: `${this.ranks[presenceData.competitiveTier]}${presenceData.leaderboardPosition > 0 ? ` #${presenceData.leaderboardPosition}` : ""} | LVL ${presenceData.accountLevel}`
                },
                username: username
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
                    const menusGetLargeText = () => (presenceData.isIdle ? "Away" : "In Lobby") + (username ? " | " + username : "");

                    presence = {
                        ...presenceBoilerplate,
                        details: menusGetDetails(),
                        assets: {
                            ...presenceBoilerplate.assets,
                            large_image: presenceData.isIdle ? this.assets["game_icon_yellow"] : presenceData.partyState === "CUSTOM_GAME_SETUP" ? getMapIcon(presenceData.matchMap) : this.assets["game_icon"],
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
                            large_text: (presenceData.isIdle ? "Away" : getMapName()) + (username ? " | " + username : ""),
                        }
                    }


                    if(pregameGetDetails().includes("Match Found")) // match found 5sec timer
                        presence.timestamps.end = timestamp + 5000;
                    else if(pregameGetDetails().includes("Agent Select")) // start 75sec countdown once agent select has loaded (~79sec including loading time)
                        presence.timestamps.end = timestamp + 79000;
                    break;
                case "INGAME":
                    const ingameGetDetails = () => {
                        const gamemode = getGamemode();
                        if(presenceData.partyState === "MATCHMADE_GAME_STARTING") { // deathmatch skips pregame
                            presenceBoilerplate.timestamps.end = timestamp + 5000;
                            return `Match Found - ${gamemode}`;
                        }

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
                            large_text: (presenceData.isIdle ? "Away" : getMapName()) + (username ? " | " + username : ""),
                        }
                    }
                    break;
            }

            this.presenceCache[puuid] = presence;
            riotLog(presence);
        } catch (e) {
            err(e);
        }
    }

    getPresence(puuid) {
        return this.presenceCache[puuid];
    }
}


/***********
 **  LOL  **
 ***********/

const lolShowSkinName = true;

const lolRpcAppId = "899030985855860756";

class Lol {
    constructor(riotPUUIDToUsername, riotPUUIDToSummonerName) {
        this.riotPUUIDToUsername = riotPUUIDToUsername;
        this.riotPUUIDToSummonerName = riotPUUIDToSummonerName;

        this.gameVersion = ""; // will be overridden by lolGetLatestVersion()
        this.champions = {};
        this.skins = {};
        this.assets = { // to be filled in by lolFetchRpcAssets()
            logo_lol: "899053983879008266",
            logo_tft: "899054046294462494",
            champions: {},
            ranks: {}
        }
        this.queues = { // manually adding in gamemodes not in riot json
            1130: {
                "queueId": 1130,
                "map": "???",
                "description": "Ranked Teamfight Tactics Turbo",
                "notes": "Added in manually"
            }
        }

        this.presenceCache = {};
    }


    processXMLData(data) {
        try {
            const puuid = data.substr(16, 36);

            // extract lol presence
            const lolData = Riot.extractDataFromXML(data, "league_of_legends");
            if(lolData) {
                const presenceUnparsed = Riot.extractDataFromXML(lolData, "p");
                if (presenceUnparsed) {
                    // regalia is an object within the object, causes issues with parser
                    const presenceHalfParsed = presenceUnparsed.replace(/&quot;/g, '"').replace(/&apos;/g, '"').replace(/"regalia":.+}",/, "");
                    try {
                        const presenceData = JSON.parse(presenceHalfParsed);
                        const timestamp = Riot.extractDataFromXML(lolData, "s.t");
                        riotLog(presenceData);
                        this.processPresenceData(puuid, presenceData, timestamp);
                    } catch(e) {
                        debugger
                    }
                }
            } else {
                delete this.presenceCache[puuid];
            }
        } catch (e) {
            err(e);
        }
    }

    async fetchGameVersion() {
        const versionsReq = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        this.gameVersion = JSON.parse(versionsReq.body)[0];
    }

    async fetchChampionData() {
        const championsReq = await fetch(`https://ddragon.leagueoflegends.com/cdn/${this.gameVersion}/data/en_US/champion.json`);
        const champsData = JSON.parse(championsReq.body);
        for(const champ of Object.values(champsData.data)) {
            this.champions[champ.key] = {name: champ.name, id: champ.id};
        }
    }

    async fetchRpcAssets() {
        const assetsReq = await fetch(`https://discord.com/api/v9/oauth2/applications/${lolRpcAppId}/assets`);
        const assetList = JSON.parse(assetsReq.body);
        for(const asset of assetList) {
            // format: {"id": "403244850960662538", "type": 2, "name": "aatrox"}
            if(asset.name === "logo") this.assets.logo_lol = asset.id;
            else if(asset.name === "tft_logo") this.assets.logo_tft = asset.id;
            else if(asset.name.startsWith("rank_")) this.assets.ranks[asset.name.substr(5)] = asset.id;
            else this.assets.champions[asset.name] = asset.id;
        }
    }

    async fetchQueueTypes() {
        const queueTypesReq = await fetch("https://static.developer.riotgames.com/docs/lol/queues.json");
        const queueTypes = JSON.parse(queueTypesReq.body);
        for(const queue of queueTypes) {
            if(queue.description) queue.description = queue.description.replace(" games", "");
            this.queues[queue["queueId"]] = queue;
        }
    }

    fetchData() {
        this.fetchGameVersion().then(() => {
            this.fetchRpcAssets();
            this.fetchChampionData();
            this.fetchQueueTypes();
        });
    }

    async getSkinName(champ_id, skin_id) {
        // doesn't work with chromas atm
        if(!lolShowSkinName) return null;

        if(!this.skins[champ_id]) {
            const req = await fetch(`https://ddragon.leagueoflegends.com/cdn/${this.gameVersion}/data/en_US/champion/${champ_id}.json`);
            this.skins[champ_id] = JSON.parse(req.body).data[champ_id].skins;
        }

        const skins = this.skins[champ_id];

        for(const skin of Object.values(skins)) {
            if(skin.id === skin_id) {
                if(skin.name === "default") return null;
                return skin.name;
            }
        }
    }

    async processPresenceData(puuid, data, timestamp) {
        try {
            const username = this.riotPUUIDToSummonerName[puuid] || this.riotPUUIDToUsername[puuid];
            timestamp = Math.max(data.timeStamp, timestamp) || data.timeStamp || timestamp;

            const getGamemode = (prefix = "", suffix = "") => {
                // add prefix and suffix
                const p_s = s => `${prefix}${s}${suffix}`;

                if (data.queueId && this.queues[data.queueId]) return p_s(this.queues[data.queueId].description);
                if (data.queueId === "-1") return p_s("Custom");
                if (data.gameStatus === "outOfGame") return "In The Lobby";
                return `(?) ${prefix}${data.gameQueueType} ${data.gameStatus}${suffix}`
            }

            let presenceBoilerplate = {
                application_id: lolRpcAppId,
                name: data.gameMode === "TFT" ? "Teamfight Tactics" : "League of Legends",
                type: 0,
                assets: {
                    large_image: data.gameMode === "TFT" ? this.assets.logo_tft : this.assets.logo_lol,
                    large_text: `Level ${data.level} | Mastery ${data.masteryScore}`,
                    small_image: data.rankedLeagueTier ? this.assets.ranks[data.rankedLeagueTier.toLowerCase()] : null,
                    small_text: data.rankedLeagueTier ? `${data.rankedLeagueTier} ${data.rankedLeagueDivision}` : null

                },
                timestamps: {
                    start: timestamp
                },
                username: username
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
            } else if(data.gameId) {
                presenceBoilerplate.party = {
                    id: data.gameId,
                    //size: [1, 5]
                }
            }

            if (data.gameStatus === "outOfGame") {
                presence = {
                    ...presenceBoilerplate,
                    details: getGamemode(),
                    state: "In the Main Menu"
                }
            } else if (data.gameStatus.startsWith("hosting_")) {
                presence = {
                    ...presenceBoilerplate,
                    details: getGamemode(),
                    state: "In the Lobby"
                }
            } else if (data.gameStatus === "inQueue") {
                presence = {
                    ...presenceBoilerplate,
                    details: getGamemode(),
                    state: "In Queue",
                    timestamps: {
                        start: data.timeStamp
                    }
                }
            } else if (data.gameStatus === "championSelect") {
                presence = {
                    ...presenceBoilerplate,
                    details: getGamemode(),
                    state: "In Champion Select"
                }
            } else if (data.gameStatus === "inGame") {
                const champion = this.champions[data.championId];
                const inGameGetLargeImage = () => {
                    if(champion && this.assets.champions[champion.id.toLowerCase()])
                        return this.assets.champions[champion.id.toLowerCase()];
                    return presenceBoilerplate.assets.large_image;
                }
                const inGameGetLargeText = async () => {
                    return await this.getSkinName(champion.id, data.skinVariant) || champion.name;
                }
                presence = {
                    ...presenceBoilerplate,
                    details: getGamemode(),
                    // state: "In Game",
                    timestamps: {
                        start: data.timeStamp
                    },
                    assets: {
                        ...presenceBoilerplate.assets,
                        large_image: champion ? inGameGetLargeImage() : presenceBoilerplate.assets.large_image,
                        large_text: champion ? await inGameGetLargeText() : null
                    }
                }
            }
            if (presence) {
                // do not update timestamp if previous presence is the same
                const previousPresence = this.presenceCache[puuid];
                if(previousPresence && presence.details.startsWith(previousPresence.details.split(' - ')[0]))
                    presence.timestamps.start = previousPresence.timestamps.start;

                this.presenceCache[puuid] = presence;
                riotLog(presence);
            }
        } catch (e) {
            err(e);
        }
    }

    getPresence(puuid) {
        return this.presenceCache[puuid];
    }
}


/*****************
 **  WILD RIFT  **
 *****************/

class WildRift {
    constructor() {
        this.presenceCache = {};
    }

    processXMLData(data) {
        try {
            const puuid = data.substr(16, 36);

            // extract wild rift presence
            const wrData = Riot.extractDataFromXML(data, "wildrift");
            if(wrData) {
                riotLog(wrData);
                try {
                    const timestamp = parseInt(Riot.extractDataFromXML(wrData, "s.t"));
                    const username = Riot.extractDataFromXML(data, "m");
                    this.processPresenceData(puuid, timestamp, username);
                } catch (e) {
                    debugger
                }
            } else {
                delete this.presenceCache[puuid];
            }
        } catch (e) {
            err(e);
        }
    }

    processPresenceData(puuid, timestamp, username) {
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
            },
            username: username
        };

        this.presenceCache[puuid] = presence;
        riotLog(presence);
    }

    getPresence(puuid) {
        return this.presenceCache[puuid];
    }
}


/************
 **  EPIC  **
 ************/

const epicDebug = true; // change this to not output epic debug to console

const epicLog = s => {
    if(!epicDebug) return;
    if(typeof s === "object") console.log("EPIC:", s);
    else console.log("EPIC: " + s);
};

class Epic extends Platform {
    constructor() {
        super("epic");

        this.presenceCache = {};
        this.statusCache = {};

        this.epicIdToDisplayName = {};

        this.loadData();
        if(this.enabled) {
            this.start();
        }
    }

    async start() {
        const success = await this.authenticate();
        if(success) {
            this.fetchFriendsList();
            this.establishXMPPConnection(this.authData.token);
        } else {
            this.enabled = false;
            this.destroy();
        }
    }

    serializeData() {
        return {
            enabled: this.enabled || false,
            authData: this.authData || {},
            usersMap: this.discordToEpicID || {}
        }
    }

    deserializeData(data) {
        this.enabled = data.enabled || false;
        this.authData = data.authData || {};
        this.discordToEpicID = data.usersMap || {};
    }

    getPresence(discord_id) {
        return super.getPresence(discord_id, this.discordToEpicID, this.presenceCache);
    }

    destroy() {
        clearTimeout(this.refreshTimeout);
        clearInterval(this.reconnectInterval);
        clearTimeout(this.heartbeat);
        if(this.socket) {
            this.socket.send("</stream:stream>");
            this.socket.close(1000);
        }
    }

    decodeJWT(token) {
        return JSON.parse(atob(token.split("~", 2)[1].split(".", 2)[1]));
    }

    getID(token) {
        return this.decodeJWT(token).sub;
    }

    getTokenExpiry(token) {
        return this.decodeJWT(token).exp * 1000;
    }

    async authenticate() {
        // returns true or false based on success
        if(this.authData.refresh) {
            if(this.authData.token) {
                const expiry = this.getTokenExpiry(this.authData.token);
                if(expiry - new Date() > 300_000) {
                    // use the token
                    this.setupRefreshTimeout();
                    return true;
                }
            }

            const refreshSuccess = await this.refreshToken();
            if(!refreshSuccess) return false;

            this.setupRefreshTimeout();
            return true;
        }

        return false;
    }

    async refreshToken() {
        epicLog("Refreshing token...");

        // check refresh token is still valid
        const refreshExpiry = this.decodeJWT(this.authData.refresh).exp * 1000;
        if(refreshExpiry - new Date() < 5000) return false;

        const req = await fetch("https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token", {
            method: "POST",
            headers: {
                Authorization: "basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=",
                "Accept-Language": "en-EN",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: `grant_type=refresh_token&refresh_token=${this.authData.refresh}&token_type=eg1&includePerms=false`
        });
        const authData = JSON.parse(req.body);
        if(authData.error) {
            console.error(authData);

            const r = this.authData.refresh;
            const errorMessage = r.length > 20 ? authData.errorMessage.replace(r,  r.substr(0, 10) + "..." + r.substr(r.length - 10)) : r;

            err("Could not refresh token! " + errorMessage);
            return false;
        }
        epicLog("Refreshed token as " + authData.displayName);

        this.authData = {
            token: authData.access_token,
            refresh: authData.refresh_token
        }
        this.saveData();

        return true;
    }

    async redeemExchangeCode(exchangeCode) {
        // returns true or false based on success
        const req = await fetch("https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token", {
            method: "POST",
            headers: {
                Authorization: "basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=",
                "Accept-Language": "en-EN",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: `grant_type=exchange_code&exchange_code=${exchangeCode}&token_type=eg1&includePerms=false`
        });

        const authData = JSON.parse(req.body);
        if(authData.error) {
            err("EPIC: Could not redeem exchange code! " + authData.errorMessage);
            return false;
        }
        epicLog("Redeemed exchange code as " + authData.displayName);

        this.authData = {
            token: authData.access_token,
            refresh: authData.refresh_token
        }
        return true;
    }

    async redeemAuthCode(authCode) {
        // get auth code -> https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code
        // returns true or false based on success
        const req = await fetch("https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token", {
            method: "POST",
            headers: {
                Authorization: "basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=",
                "Accept-Language": "en-EN",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: `grant_type=authorization_code&code=${authCode}&token_type=eg1&includePerms=false`
        });

        const authData = JSON.parse(req.body);
        if(authData.error) {
            err("Could not redeem auth code! " + authData.errorMessage);
            return false;
        }
        epicLog("Redeemed auth code as " + authData.displayName);

        this.authData = {
            token: authData.access_token,
            refresh: authData.refresh_token
        }
        return true;
    }

    setupRefreshTimeout() {
        const tokenExpiry = this.decodeJWT(this.authData.token).exp * 1000;
        this.refreshTimeout = setTimeout(this.refreshToken, tokenExpiry - new Date() - 300_000);
    }

    async fetchFriendsList() {
        const req = await fetch(`https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${this.getID(this.authData.token)}/summary?displayNames=true`, {
            headers: {
                Authorization: "Bearer " + this.authData.token
            }
        });
        const json = JSON.parse(req.body);
        for(const friend of json.friends) {
            this.epicIdToDisplayName[friend.accountId] = friend.displayName;
        }

        epicLog(this.epicIdToDisplayName);
    }

    // xmpp stuff
    establishXMPPConnection(token) {
        try {
            const address = "xmpp-service-prod.ol.epicgames.com";

            const messages = [
                `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" version="1.0" xml:lang="en" to="prod.ol.epicgames.com"/>`, '',
                `<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${btoa("\0" + this.getID(token) + "\0" + token)}</auth>`,
                `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" version="1.0" xml:lang="en" to="prod.ol.epicgames.com"/>`, '',
                `<iq xmlns="jabber:client" type="set" id="4f3712da-95d0-43cd-b5de-c039e88c18c9"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>V2:launcher:WIN::14E35C093CA24212AE2706986DB02768</resource></bind></iq>`,
                //`<iq xmlns="jabber:client" type="get" id="3e1a1bf9-7eed-441e-98a2-2c093add066d"><query xmlns="jabber:iq:roster"/></iq>`, // friends list
                `<presence xmlns="jabber:client" id="638e9399-7760-435d-a351-c168f06bc7fa"/>`
            ]

            const sock = new WebSocket(`wss://${address}`, "xmpp");
            sock.onopen = () => {
                try {
                    epicLog("Connected!");

                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;

                    sendNext();
                } catch (e) {
                    err(e);
                }
            };
            this.socket = sock;

            const send = data => {
                if(!data || this.destroyed) return;
                try {
                    if(sock.readyState === 1) {
                        sock.send(data);
                        epicLog("-> " + data);

                        clearTimeout(this.heartbeat);
                        this.heartbeat = setTimeout(() => send(" "), 60_000);
                    }
                } catch (e) {
                    err(e);
                }
            }

            const sendNext = () => send(messages.shift());

            sock.onmessage = event => {
                try {
                    // const timestamp = performance.timeOrigin + event.timeStamp
                    const data = event.data;
                    epicLog("<- " + data);
                    if(messages.length > 0) sendNext();

                    // process data
                    if(data.startsWith("<presence ")) this.processPresence(data);
                } catch (e) {
                    err(e);
                }
            };

            sock.error = console.error;
            sock.onclose = () => {
                if(this.destroyed || sock !== this.socket) return epicLog("Websocket disconnected!");
                console.error("Epic disconnected! Retrying in 5 seconds...");

                if(this.reconnectInterval) return;

                this.reconnectInterval = setInterval(() => {
                    this.establishXMPPConnection(token);
                }, 5000);

                clearTimeout(this.heartbeat);
            };
        } catch (e) {
            err(e);
        }
    }

    processPresence(presence) {
        const idStart = presence.indexOf("from=\"") + 6;
        const idEnd = presence.indexOf("@", idStart);
        const id = presence.substring(idStart, idEnd);

        const fullIdEnd = presence.indexOf("\"", idStart);
        const fullId = presence.substring(idStart, fullIdEnd);
        const presenceSource = fullId.split(":")[1];

        const statusStart = presence.indexOf("<status>") + 8;
        if(statusStart === 7) return;
        const statusEnd = presence.indexOf("</status>", statusStart);
        const status_raw = presence.substring(statusStart, statusEnd);
        const status = JSON.parse(status_raw);

        let presenceType;
        if(presence.includes("type=")) {
            const presenceTypeStart = presence.indexOf("type=") + 6;
            const presenceTypeEnd = presence.indexOf("\"", presenceTypeStart);
            presenceType = presence.substring(presenceTypeStart, presenceTypeEnd);

        }

        let timestamp;
        if(presence.includes("<delay ")) {
            const timestampStart = presence.indexOf("stamp=\"") + 7;
            const timestampEnd = presence.indexOf("\"", timestampStart);
            timestamp = +new Date(presence.substring(timestampStart, timestampEnd));
        }

        this.renderPresence(id, presenceSource, status, presenceType, timestamp);
    }

    async renderPresence(id, presenceSource, status, presenceType, timestamp) {
        const epicLogoID = "896045315323486238";
        const rlLogoID = "897981076146896937";

        const username = this.epicIdToDisplayName[id];
        const previousPresence = this.presenceCache[id] || {};
        timestamp = timestamp || (previousPresence.timestamps ? previousPresence.timestamps.start : + new Date());

        if(status.Status !== undefined) this.statusCache[id] = status.Status;

        const presenceBoilerplate = {
            application_id: customRpcAppId,
            type: 0,
            timestamps: {
                start: timestamp
            },
            username: username
        }
        let presence;

        switch (presenceSource) {
            case "launcher":
                if(presenceType === "unavailable") return;
                if(!timestamp) return;

                if(status.Properties.OverrideAppId_s) {
                    if(status.Properties.OverrideAppId_s === "fn" && previousPresence && previousPresence.name === "Fortnite") return;
                    else if(status.Properties.OverrideAppId_s === "9773aa1aa54f4f7b80e44bef04986cea" && previousPresence.name && previousPresence.name.startsWith("Rocket League")) {
                        // we can salvage the timestamp
                        presence = {
                            ...previousPresence,
                            timestamps: {
                                start: timestamp
                            }
                        }
                    } else {
                        const appName = await this.getAppName(status.Properties.OverrideAppId_s);
                        presence = {
                            ...presenceBoilerplate,
                            name: appName || status.Properties.OverrideAppId_s,
                            details: "Playing on Epic Games",
                            state: this.statusCache[id] || undefined,
                            assets: {
                                large_image: epicLogoID,
                            },
                        }
                    }
                }
                else return delete this.presenceCache[id];
                break;
            case "fghi4567OXA1CdeeCuAmUWMhmfiO3EAl": // rocket league
                if(presenceType === "unavailable") return delete this.presenceCache[id];

                const currentStatus = this.statusCache[id];

                presence = {
                    ...presenceBoilerplate,
                    name: "Rocket League",
                    details: currentStatus,
                    assets: {
                        large_image: rlLogoID
                    },
                    timestamps: {
                        start: timestamp
                    }
                }

                // sometimes rocket league presence statuses show score + time remaining
                // it's kinda random, probably a gradual rollout?
                const timeRemainingMatches = currentStatus.match(/ \[(.+) remaining]/);
                if(timeRemainingMatches) {
                    const timeRemainingFormatted = timeRemainingMatches[1];
                    const [min, sec] = timeRemainingFormatted.split(':', 2);
                    const seconds = min * 60 + sec;
                    presence.timestamps.end = + new Date() + seconds * 1000;
                    presence.timestamps.status.replace(timeRemainingMatches[0], "");
                } else if(previousPresence.name === "Rocket League") {
                    // reset timestamp if changed state, e.g. main menu -> in game
                    const previousStatus = previousPresence.details;
                    if(previousStatus !== currentStatus) presence.timestamps.start = + new Date();
                }

                break;
            case "fghi4567eJdrrwo5Dgu1RiO2R0vM1XVK": // satisfactory
                if(presenceType === "unavailable") return delete this.presenceCache[id];

                // idk how satisfactory presences work so timestamps never reset

                presence = {
                    ...presenceBoilerplate,
                    name: "Satisfactory",
                    details: this.statusCache[id],
                    assets: {
                        large_image: epicLogoID
                    },
                    timestamps: {
                        start: timestamp
                    }
                }
                break;
            case "Fortnite":
                if(previousPresence.name === "Fortnite") {
                    const previousState = previousPresence.details.split(" - ")[0];
                    const currentState = this.statusCache[id].split(" - ")[0];
                    if(previousState === currentState) timestamp = previousPresence.timestamps.start;
                }
                presence = {
                    ...presenceBoilerplate,
                    name: "Fortnite",
                    details: this.statusCache[id],
                    assets: {
                        large_image: epicLogoID
                    },
                    timestamps: {
                        start: timestamp
                    }
                }
                break;
            default:
                if(presenceSource === "fcb692f0fdf14526b1ffbb77cf1ef288") return; // paladins
                BdApi.alert("Unknown game ID! " + presenceSource);
                return;
        }

        this.presenceCache[id] = presence;
        epicLog(this.presenceCache[id]);
    }

    async getAppName(appID) {
        if(appID === "fn") return "Fortnite";
        const req = await fetch("https://www.epicgames.com/graphql", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                query: "query searchStoreQuery($count: Int = 5, $keywords: String, $namespace: String, $category: String) {\n  Catalog {\n    searchStore(\n      count: $count\n      keywords: $keywords\n      namespace: $namespace\n      category: $category\n    ) {\n      elements {\n        title\n        namespace\n        id\n      }\n    }\n  }\n}\n",
                "variables": {
                    "namespace": appID,
                    "category": "games/edition/base|bundles/games|editors|software/edition/base"
                }
            })
        });

        try {
            return JSON.parse(req.body).data.Catalog.searchStore.elements[0].title;
        } catch(e) {
            err("Could not fetch app name from id!", req.body);
        }
    }

    getSettings(discordUserList, discordUsersDatalist) {
        // enabled switch
        const enabledSwitch = SettingsBuilder.enabledSwitch(this);

        /*// cookies textbox
        const textboxChange = (value) => this.cookies = value;
        const apiKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("Auth Cookies", "Your auth.riotgames.com cookies", this.cookies, textboxChange);*/

        const usersList = {
            idToName: this.epicIdToDisplayName,
            nameToId: {}
        }
        for(const [id, username] of Object.entries(this.epicIdToDisplayName)) {
            usersList.nameToId[username] = id;
        }
        const datalist = SettingsBuilder.createDatalist("epic", Object.keys(usersList.nameToId));
        const userMapDiv = SettingsBuilder.userMapInterface(this, datalist, discordUsersDatalist, usersList, discordUserList, this.discordToEpicID, "Epic username", /^.+$/);

        return SettingsBuilder.settingsPanel(this, enabledSwitch, userMapDiv);
    }
}
platforms.push(Epic);


/**************
 **  PLUGIN  **
 **************/

module.exports = (() => {
    const config = {
        "info": {
            "name": "CrossPlatformPlaying",
            "authors": [{
                "name": "Giorgio",
                "discord_id": "316978243716775947",
                "github_username": "giorgi-o"
            }],
            "version": "0.1",
            "description": "Show what people are playing on other platforms such as Steam and Valorant",
            "github": "https://github.com/giorgi-o/CrossPlatformPlaying",
            "github_raw": "https://raw.githubusercontent.com/giorgi-o/CrossPlatformPlaying/main/CrossPlatformPlaying.plugin.js"
        },
        "main": "CrossPlatformPlaying.plugin.js"
    };

    return !global.ZeresPluginLibrary ? class {
        constructor() {
            this._config = config;
        }
        getName() {
            return config.info.name;
        }
        getAuthor() {
            return config.info.authors.map(a => a.name).join(", ");
        }
        getDescription() {
            return config.info.description;
        }
        getVersion() {
            return config.info.version;
        }
        load() {
            BdApi.showConfirmationModal("Library Missing", `The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`, {
                confirmText: "Download Now",
                cancelText: "Cancel",
                onConfirm: () => {
                    require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", async (error, response, body) => {
                        if (error) return require("electron").shell.openExternal("https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js");
                        await new Promise(r => fs.writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, () => {
                            BdApi.alert("Successfully installed CrossPlatformPlaying! Press Ctrl+R to reload Discord, then go to Settings > Plugins to enable and configure the plugin.");
                            r();
                        }));
                    });
                }
            });
        }
        start() {}
        stop() {}
    } : (([Plugin, Api]) => {
        const plugin = (Plugin, Api) => {
            return class CrossPlatformPlaying extends Plugin {
                saveAndUpdate() {

                }
                onStart() {
                    // Required function. Called when the plugin is activated (including after reloads)

                    // check if config json is valid
                    try {
                        BdApi.loadData("CrossPlatformPlaying", "");
                    } catch(e) {
                        // newlines don't work but whatever
                        BdApi.alert("Your config JSON is invalid!\nTry putting it into an online JSON formatter to look for any errors.\n" + e);
                        return;
                    }

                    this.instances = [];
                    // initialise platforms
                    for(const Platform of platforms) {
                        this.instances.push(new Platform());
                    }

                    // setup getActivity() patch
                    const ActivityStore = ZeresPluginLibrary.DiscordModules.UserStatusStore;
                    BdApi.Patcher.after("CrossPlatformPlaying", ActivityStore, "getActivities", (_this, args, ret) => {

                        const id = args[0];

                        let newActivities = [];

                        for(const platform of this.instances) {
                            const presences = platform.getPresence(id);
                            if(presences) newActivities.push(...presences);
                        }

                        if(newActivities.length > 0) return newActivities.concat(ret); //ret.concat(newActivities);
                        else return ret;
                    });

                    this.loadPatches();
                    this.patchActivityHeader();
                    // patchGetAssetImage();
                    this.reloadActivityRenderModule();
                }

                onStop() {
                    // Required function. Called when the plugin is deactivated
                    BdApi.Patcher.unpatchAll("CrossPlatformPlaying");

                    for(const platform of this.instances) {
                        platform.destroyed = true;
                        platform.destroy();
                    }
                    this.instances.length = 0; // clear array for next time plugin is launched
                }

                getSettingsPanel() {
                    const body = document.createElement("div");

                    const buttons = [];
                    const panels = [];
                    let activePanel;

                    // insert formatted list of all discord users
                    const discordUserList = {
                        idToName: {},
                        nameToId: {}
                    }
                    ZeresPluginLibrary.DiscordModules.UserStore.forEach(user => {
                        const name = user.username + '#' + user.discriminator;
                        discordUserList.idToName[user.id] = name;
                        discordUserList.nameToId[name] = user.id;
                    });
                    const discordUsersDatalist = SettingsBuilder.createDatalist("discordUserList", Object.keys(discordUserList.nameToId));
                    body.append(discordUsersDatalist);

                    // create a panel and button for each platform
                    for(const platform of this.instances) {
                        let platformIndex = buttons.length;

                        // the different panels for different platforms
                        const panel = document.createElement("div");
                        panel.id = "panel-" + platform.platformId;
                        panel.loaded = false;
                        panel.style.display = "none"; // hide the panel initially
                        panels.push(panel);

                        // the buttons clicked to show the different platforms
                        const button = document.createElement("button");
                        button.className = "bd-button";
                        button.style.margin = "6px";
                        button.innerText = platform.constructor.name;
                        button.onclick = () => {
                            if(activePanel) activePanel.style.display = "none";
                            if(this.activePanelIndex !== undefined) {
                                buttons[this.activePanelIndex].disabled = false;
                                buttons[this.activePanelIndex].classList.remove("bd-button-disabled");
                            }

                            activePanel = panel;
                            this.activePanelIndex = platformIndex;

                            if(!panel.loaded) {
                                panel.append(platform.getSettings(discordUserList, discordUsersDatalist));
                                panel.loaded = true;
                            }

                            panel.style.display = "block";
                            button.disabled = true;
                            button.classList.add("bd-button-disabled");
                        }

                        buttons.push(button);
                    }

                    // start inserting the elements
                    const buttonsDiv = document.createElement("div");
                    buttonsDiv.id = "platform-buttons";
                    buttonsDiv.style.margin = "10px";
                    body.append(buttonsDiv);

                    for(const button of buttons) {
                        buttonsDiv.append(button);
                    }

                    const panelsDiv = document.createElement("div");
                    panelsDiv.id = "platform-panels";
                    panelsDiv.style.padding = "10px";
                    body.append(panelsDiv);

                    for(const panel of panels) {
                        panelsDiv.append(panel);
                    }

                    buttons[this.activePanelIndex || 0].click();

                    return body;
                }

                loadPatches() {
                    // discord webpack module helper functions
                    const moduleList = Object.values(ZeresPluginLibrary.WebpackModules.getAllModules());

                    const stringsModule = moduleList.filter(m => m.exports.default && m.exports.default.Messages && m.exports.default.Messages.USER_ACTIVITY_HEADER_PLAYING)[0];

                    const activityRenderModule = moduleList.filter(m => m.exports.default && m.exports.default.prototype && m.exports.default.prototype.renderImage && m.exports.default.prototype.renderHeader)[0];
                    const activityAssetModule = moduleList.filter(m => m.exports.getAssetImage)[0];
                    const activityHeaderModule = moduleList.filter(m => m.exports.default && m.exports.default.toString().includes("default.Messages.USER_ACTIVITY_HEADER_PLAYING"))[0];

                    this.patchActivityHeader = () => {
                        // only works with "playing ..." headers
                        BdApi.Patcher.after("CrossPlatformPlaying", activityHeaderModule.exports, "default", (_this, args, ret) => {
                            if(!args[0].username) return ret;
                            const presence = args[0];

                            if(ret === stringsModule.exports.default.Messages.USER_ACTIVITY_HEADER_PLAYING)
                                return "Playing as " + presence.username;

                            // playing on xbox -> playing on xbox as urmom420
                            return ret + " as " + presence.username;
                        });
                    }

                    this.patchGetAssetImage = () => {
                        // setup getAssetImage patch
                        BdApi.Patcher.instead("CrossPlatformPlaying", activityAssetModule.exports, "getAssetImage", (_this, args, func) => {
                            if(args[1].startsWith("url:")) return args[1].substr(4);
                            return func(...args);
                        });
                    }

                    this.reloadActivityRenderModule = () => {
                        // the activityRenderModule.renderImage function stores a reference to the unpatched getAssetImage function
                        // we need to reload the webpack to update the reference
                        const reloadedModule = {exports: {}};
                        ZeresPluginLibrary.WebpackModules.require.m[activityRenderModule.id](reloadedModule, reloadedModule.exports, ZeresPluginLibrary.WebpackModules.require);
                        activityRenderModule.exports.default.prototype.renderImage = reloadedModule.exports.default.prototype.renderImage;
                        activityRenderModule.exports.default.prototype.renderHeader = reloadedModule.exports.default.prototype.renderHeader;

                    }

                    discord_id = ZeresPluginLibrary.DiscordModules.UserInfoStore.getId();
                }
            };
        };
        return plugin(Plugin, Api);
    })(global.ZeresPluginLibrary.buildPlugin(config));
})();
/*@end@*/