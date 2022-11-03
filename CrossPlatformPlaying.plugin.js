/**
 * @name CrossPlatformPlaying
 * @author Giorgio
 * @description Show what friends are playing even if they have their game activity turned off
 * @version 0.2.8
 * @authorId 316978243716775947
 * @source https://github.com/giorgi-o/CrossPlatformPlaying
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

 const fs = require("fs");
 const crypto = require("crypto");
 const preload = global.CPP_preload;
 
 // send an HTTP request to a URL, bypassing CORS policy
 const fetch = preload.https.fetch;
 
 // basic error handling
 const err = e => {
     console.error(e);
     for(const errCode of ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "ENOENT", "ECONNABORTED"]) {
         if(e.code === errCode || e.errno === errCode) return; // steam & hypixel sometimes time out for no reason
     }
     debugger;
     BdApi.alert("Error happened!\n" + e);
 }
 
 // convert a Buffer (UInt8Array) to a utf-8 string
 const textDecoder = new TextDecoder();
 const bufToString = (buffer) => textDecoder.decode(buffer);
 
 // format an application asset URL to properly render, without needing to patch getAssetImage
 // this takes advantage of the fact you can pass a discord media proxy url as an asset image using "mp:"
 // as well as properties of the URL() constructor to tell it not to prepend the media proxy hostname
 // while bypassing the split at the : character that discord does
 const formatAsset = (url) => {
     if(!url) return null;
     const urlObject = new URL(url);
     return `mp:${urlObject.toString().substring(urlObject.protocol.length)}`;
 }
 
 const pluginName = "CrossPlatformPlaying";
 const customRpcAppId = "883483733875892264";
 
 const config = {
     "info": {
         "name": pluginName,
         "authors": [{
             "name": "Giorgio",
             "discord_id": "316978243716775947",
             "github_username": "giorgi-o"
         }],
         "version": "0.2.8",
         "description": "Lets you see what your friends are playing even if they turned off game activity",
         "github": "https://github.com/giorgi-o/CrossPlatformPlaying",
         "github_raw": "https://raw.githubusercontent.com/giorgi-o/CrossPlatformPlaying/main/CrossPlatformPlaying.plugin.js"
     },
     "changelog": [ // added: green, improved: blurple, fixed: red, progress: yellow
         {
             "title": "Beta testing",
             "type": "added",
             "items": [
                 "If you see this, it's because you installed the beta version of the plugin. Welcome :)",
                 "This version is probably very buggy, but at least it's better than nothing'.",
                 "If you encounter any bugs, don't hesitate to tell me! I'm not going to fix a bug if no one tells me about it."
             ]
         },
     ]
 };
 
 // the discord id of the current user (once the plugin loads)
 let discord_id = 0;
 
 // update the user's status in the guild member list
 // call this when the user changes game (not just the game state)
 let updateUser = (id) => {};
 
 
 // to implement a new platform, create a subclass of Platform
 // and override constructor(), start(), serializeData(), deserializeData(), getPresence(), destroy() and getSettings()
 class Platform {
     // all platforms should call super() with their platformId
     constructor(platformId) {
         this.platformId = platformId; // used when storing the platform settings
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
         if(presences.length) return presences;
     }
 
     // helper method to call updateUser() on a user using their user id
     // because typically the processPresence() functions only have the platform id, not discord id
     updateUser(platformId, discordToPlatformId) {
         const discordIds = [];
         for(const [discordId, platformIds] of Object.entries(discordToPlatformId)) {
             let matches;
             if(Array.isArray(platformIds)) matches = platformIds.includes(platformId);
             else matches = platformIds === platformId;
 
             if(matches) discordIds.push(discordId);
         }
 
         for(const discordId of discordIds)
             updateUser(discordId);
     }
 
     // called when the plugin is stopped or the platform is disabled
     // pluginShutdown is true if the whole plugin is being disabled
     destroy(pluginShutdown) {};
 
     // helper function to restart the platform, for example to re-authenticate.
     restart() {
         this.destroy(false);
         this.enabled = true;
         this.saveData();
         this.start();
     }
 
     // should return an HTML element containing the settings panel
     // takes as argument an object containing a map of discord IDs to and from usernames
     getSettings() {
         const div = document.createElement("div");
         div.innerText = "No settings panel for " + this.platformId;
         return div;
     }
 
     log(s) {
         if(!this.debug) return;
         if(typeof s === "object") console.log(`[${this.platformId.toUpperCase()}]`, s);
         else console.log(`[${this.platformId.toUpperCase()}] ${s}`);
     }
 }
 
 const removeFromList = (list, value) => {
     const index = list.indexOf(value);
     if(index !== -1) list.splice(index, 1);
 }
 
 const timeouts = [];
 const intervals = [];
 
 const setTimeout = (fn, delay) => {
     const id = window.setTimeout(() => {
         removeFromList(timeouts, id);
         try {fn()}
         catch(e) {err(e)}
     }, delay);
     timeouts.push(id);
     return id;
 }
 const setInterval = (fn, delay) => {
     const id = window.setInterval(() => {
         try {fn()}
         catch(e) {err(e)}
     }, delay);
     intervals.push(id);
     return id;
 }
 
 
 // custom websocket client adding support for HTTP headers and cookies
 const SimpleSocket = {
     create: preload.https.simpleSocket,
     send: preload.https.sendToSocket,
     close: preload.https.closeSocket
 }
 
 const Priorities = {
     PLAYING:                7, // user has game open & actively playing
     IN_LOBBY:               6, // user has game open and is about to launch (in lobby)
     DISCORD_RICH_PRESENCE:  5, // discord presence, with rich presence
     IN_LOBBY_AFK:           4, // user has game open but is afk
     NONPRIMARY_PLAYING:     3, // user has their game open, but this is not the primary presence (e.g. Steam)
     DISCORD_NORMAL:         2, // discord presence, without rich presence
     SECONDARY:              1  // secondary activity (e.g. Spotify/Twitch)
 }
 
 // helper functions for building the settings panel
 const SettingsBuilder = {
     enabledSwitch: (platform) => {
         const onChange = (value) => {
             const wasEnabled = platform.enabled;
             platform.enabled = value;
             if(!wasEnabled && value) platform.start();
             if(wasEnabled && !value) platform.destroy();
             platform.saveData();
         }
         return new ZeresPluginLibrary.Settings.Switch("Enabled", "Whether this platform is enabled", platform.enabled, onChange);
     },
     toggleEnabledSwitch: (enabledSwitch) => {
         enabledSwitch.getElement().children[0].children[0].children[1].children[0].children[1].click();
     },
     debugSwitch: (platform) => {
         const onChange = (value) => {
             platform.debug = value;
             if(value) platform.log("Debug enabled!");
         }
         return new ZeresPluginLibrary.Settings.Switch("Debug", "Whether to print debug info to the console", platform.debug, onChange);
     },
     getTextboxInput: (textbox) => {
         return textbox.children[0].children[1].children[0];
     },
     textboxWithButton: (name, note, value, onChange, textboxOptions, buttonText, onClick, timeout=50) => {
         if(!name) name = ""; // if name is null, button formatting doesn't work for some reason
         const textbox = new ZeresPluginLibrary.Settings.Textbox(name, note, value, onChange, textboxOptions).getElement();
         setTimeout(() => {
             const button = document.createElement("button");
             button.innerText = buttonText;
             button.onclick = onClick;
 
             button.classList.add("bd-button");
             button.style.fontSize = "16px";
             button.style.marginLeft = "10px";
             button.style.whiteSpace = "nowrap";
 
             const div = textbox.children[0].children[1];
 
             div.style.flexDirection = "row";
 
             div.append(button);
         }, timeout);
         return textbox;
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
     userMapInterface: (platform, platformDatalist, discordDatalist, platformUserList, discordUserList, usersMap, description, platformHeaderValue, platformIdRegex=/./, discordIdRegex=/^\d{15,}$/) => {
         /** userList format: {
          *      idToName: {
          *          1234: "gary"
          *      },
          *      nameToId: {
          *          "gary": 1234
          *      }
          *  }
          */
 
         // get a few class names from discord (can't find them in ZLibrary)
         if(!SettingsBuilder.inputClassNames) SettingsBuilder.inputClassNames = BdApi.findModuleByProps("input", "inputMini", "inputWrapper");
         if(!SettingsBuilder.descriptionClassNames) SettingsBuilder.descriptionClassNames = BdApi.findModuleByProps('labelBold', 'labelDescriptor', 'labelSelected');
 
         const userMapDiv = document.createElement("div");
         userMapDiv.classList.add(ZeresPluginLibrary.DiscordClassModules.Dividers.container);
         if(platformDatalist) userMapDiv.append(platformDatalist);
 
         if(description) {
             const descriptionDiv = document.createElement("div");
             descriptionDiv.className = (SettingsBuilder.descriptionClassNames.description);
             descriptionDiv.innerHTML = description;
             descriptionDiv.style.marginBottom = "6px";
             userMapDiv.append(descriptionDiv);
         }
 
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
         topRow.append(platformColumnTitle);
 
         const discordColumnTitle = document.createElement("th");
         discordColumnTitle.innerText = "Discord user";
         discordColumnTitle.style.color = "var(--header-primary)";
         topRow.append(discordColumnTitle);
 
         table.append(topRow);
 
         // handle saving data to json
         let saveTimeout;
         const saveData = () => {
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
 
             saveTimeout = setTimeout(() => {
                 platform.saveData();
             }, 500);
         }
 
         let id = 0;
 
         const addRow = (platformValue, discordValue, insertAtEnd=false) => {
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
             platformInput.className = SettingsBuilder.inputClassNames.input;
             platformInput.style.width = "100%";
             platformInput.oninput = saveData;
             if(platformValue) platformInput.value = platformValue;
             if(platformDatalist) platformInput.setAttribute("list", platformDatalist.id);
 
             const platformInputColumn = document.createElement("th");
             platformInputColumn.style.width = "50%";
             platformInputColumn.append(platformInput);
             row.append(platformInputColumn);
 
             // discord dropdown
             const discordInput = document.createElement("input");
             discordInput.className = SettingsBuilder.inputClassNames.input;
             discordInput.style.width = "100%";
             discordInput.oninput = saveData;
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
             if(table.children.length === 1) addRow();
             saveData();
         }
 
         const userCount = Object.values(usersMap).flat().length;
         if(userCount === 0) {
             addRow("", "");
         }
         else if(userCount === 1) {
             const [[discord_id, platform_ids]] = Object.entries(usersMap);
             addRow(platform_ids[0], discord_id);
         }
         else {
             for(const [discord_id, platform_ids] of Object.entries(usersMap)) {
                 for(const platform_id of platform_ids) {
                     addRow(platformUserList && platformUserList.idToName[platform_id] || platform_id,
                         discordUserList && discordUserList.idToName[discord_id] || discord_id, true);
                 }
             }
         }
 
         // add divider
         const divider = document.createElement("div");
         divider.classList.add(ZeresPluginLibrary.DiscordClassModules.Dividers.divider);
         divider.classList.add(ZeresPluginLibrary.DiscordClassModules.Dividers.dividerDefault);
         userMapDiv.append(divider);
 
         return userMapDiv;
     },
     list: (platform, theList, description, header, regex=/./) => {
         // get a few class names from discord (can't find them in ZLibrary)
         if(!SettingsBuilder.inputClassNames) SettingsBuilder.inputClassNames = BdApi.findModuleByProps("input", "inputMini", "inputWrapper");
         if(!SettingsBuilder.descriptionClassNames) SettingsBuilder.descriptionClassNames = BdApi.findModuleByProps('labelBold', 'labelDescriptor', 'labelSelected');
 
         const listDiv = document.createElement("div");
         listDiv.classList.add(ZeresPluginLibrary.DiscordClassModules.Dividers.container);
 
         if(description) {
             const descriptionDiv = document.createElement("div");
             descriptionDiv.className = (SettingsBuilder.descriptionClassNames.description);
             descriptionDiv.innerHTML = description;
             descriptionDiv.style.marginBottom = "6px";
             listDiv.append(descriptionDiv);
         }
 
         const table = document.createElement("table");
         table.style.width = "100%";
         listDiv.append(table);
 
         // top row with + button and labels
         const topRow = document.createElement("tr");
         topRow.id = platform.platformId + "-list-row-top";
 
         const addRowButton = document.createElement("button");
         addRowButton.innerText = "+";
         addRowButton.className = "bd-button";
         const addRowButtonColumn = document.createElement("th");
         addRowButtonColumn.append(addRowButton);
         topRow.append(addRowButtonColumn);
 
         const inputColumnTitle = document.createElement("th");
         inputColumnTitle.innerText = header || "Value";
         inputColumnTitle.style.color = "var(--header-primary)";
         topRow.append(inputColumnTitle);
 
         table.append(topRow);
 
         // handle saving data to json
         let saveTimeout;
         const saveData = () => {
             clearTimeout(saveTimeout);
 
             // delete all entries in old list
             theList.length = 0;
 
             for(const row of table.children) {
                 if(row.id === platform.platformId + "-list-row-top") continue;
 
                 const inputElement = row.children[1].children[0];
                 const inputValue = inputElement.value;
 
                 if(regex && !regex.test(inputValue)) {
                     inputElement.style.color = "red";
                     continue;
                 }
                 inputElement.style.color = null;
 
                 if(!inputValue) continue;
 
                 theList.push(inputValue);
             }
 
             saveTimeout = setTimeout(() => {
                 platform.saveData();
             }, 500);
         }
 
         let id = 0;
 
         const addRow = (value, insertAtEnd=false) => {
             const row = document.createElement("tr");
             row.style.width = "100%";
             row.id = platform.platformId + "-list-row-" + id.toString();
 
             // X button
             const removeButton = document.createElement("button");
             removeButton.className = "bd-button";
             removeButton.innerText = "X";
             removeButton.onclick = () => removeRow(row.id);
 
             const removeButtonColumn = document.createElement("th");
             removeButtonColumn.append(removeButton);
             row.append(removeButtonColumn);
 
             // input
             const platformInput = document.createElement("input");
             platformInput.className = SettingsBuilder.inputClassNames.input;
             platformInput.style.width = "100%";
             platformInput.oninput = saveData;
             if(value) platformInput.value = value;
 
             const platformInputColumn = document.createElement("th");
             platformInputColumn.style.width = "100%";
             platformInputColumn.append(platformInput);
             row.append(platformInputColumn);
 
             if(insertAtEnd) table.append(row);
             else table.insertBefore(row, table.children[1]);
 
             id++;
         }
         addRowButton.onclick = () => addRow();
 
         const removeRow = (id) => {
             table.removeChild(document.getElementById(id));
             if(table.children.length === 1) addRow();
             saveData();
         }
 
         if(theList.length <= 1) {
             addRow(theList[0]);
         } else {
             for(const item of theList) {
                 addRow(item, true);
             }
         }
 
         // add divider
         const divider = document.createElement("div");
         divider.classList.add(ZeresPluginLibrary.DiscordClassModules.Dividers.divider);
         divider.classList.add(ZeresPluginLibrary.DiscordClassModules.Dividers.dividerDefault);
         listDiv.append(divider);
 
         return listDiv;
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
             usersMap: this.discordToSteamIDs || {},
             debug: this.debug || false
         }
     }
 
     deserializeData(data) {
         this.enabled = data.enabled || false;
         this.apiKey = data.apiKey || "";
         this.discordToSteamIDs = data.usersMap || {};
         this.debug = data.debug || false;
     }
 
     async getPlayerSummaries(ids) {
         const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${ids.join(',')}`;
         const req = await fetch(url);
 
         if(req.statusCode !== 200) {
             console.error(req);
             if(req.statusCode === 403) {
                 console.error(req);
                 if(this.apiKey) BdApi.alert("Your Steam API key is invalid! Steam has been disabled, reenable it in settings.");
                 else BdApi.alert("You haven't provided a Steam API key!");
                 this.destroy();
                 return;
             }
             console.error("HTTP error " + req.statusCode + " when fetching steam data");
             return;
         }
 
         try {
             const json_data = JSON.parse(req.body);
             if (!json_data.response || !json_data.response.players) return;
             this.log(json_data);
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
             const previousPresence = this.presenceCache[summary.steamid];
             const playingSameGame = previousPresence && summary.gameextrainfo === previousPresence.name;
 
             const presence = {
                 application_id: customRpcAppId,
                 name: summary.gameextrainfo,
                 details: `${statuses[summary.personastate]} on Steam`,
                 type: 0,
                 timestamps: {start: playingSameGame ? previousPresence.timestamps.start : +new Date()},
                 assets: {
                     large_image: "883490890377756682",
                     large_text: "Playing as " + summary.personaname
                 },
                 username: summary.personaname,
                 priority: Priorities.NONPRIMARY_PLAYING
             };
 
             this.presenceCache[summary.steamid] = presence;
             this.log(presence);
 
             if(!playingSameGame) this.updateUser(summary.steamid, this.discordToSteamIDs);
         } else {
             this.deletePresence(summary.steamid);
         }
     }
 
     deletePresence(id) {
         if(this.presenceCache[id]) {
             delete this.presenceCache[id];
             this.updateUser(id, this.discordToSteamIDs);
         }
     }
 
     updateCache() {
         if(!this.enabled) return clearInterval(this.cacheUpdateinterval);
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
         const textboxChange = (value) => {
             this.apiKey = value;
             if(this.enabled) {
                 SettingsBuilder.toggleEnabledSwitch(enabledSwitch);
             }
         }
         const apiKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("API Key", "Your Steam API key. Get one at https://steamcommunity.com/dev/apikey", this.apiKey, textboxChange);
         setTimeout(() => {
             apiKeyTextbox.getElement().children[0].children[2].innerHTML = `Your Steam API key. Get one at <a href="https://steamcommunity.com/dev/apikey" target="_blank">https://steamcommunity.com/dev/apikey</a>`
         }, 50);
 
         const userMapDiv = SettingsBuilder.userMapInterface(this, null, discordUsersDatalist, null, discordUserList, this.discordToSteamIDs,
             "To get IDs, use a site such as <a href='https://www.steamidfinder.com/' target=\"_blank\">Steam ID Finder</a> and copy the SteamID64 (Dec).", "Steam ID", /^\d+$/);
 
         const debugSwitch = SettingsBuilder.debugSwitch(this);
 
         return SettingsBuilder.settingsPanel(this, enabledSwitch, apiKeyTextbox, userMapDiv, debugSwitch);
     }
 
     destroy(pluginShutdown) {
         this.enabled = false;
         for(const id in this.presenceCache) this.deletePresence(id);
         clearInterval(this.cacheUpdateinterval);
         if(!pluginShutdown) this.saveData();
     }
 }
 
 /*****************
  **  MINECRAFT  **
  *****************/
 
 class Minecraft extends Platform {
     constructor() {
         super("minecraft");
 
         this.mcUUIDToUsername = {};
 
         this.loadData();
         this.UUIDs = [...new Set(Object.values(this.discordToMinecraftUUIDs).flat())] // remove duplicates
 
         this.log = this.log.bind(this);
         this.updateUser = uuid => super.updateUser(uuid, this.discordToMinecraftUUIDs);
         this.hypixel = new Hypixel(this.UUIDs, this.hypixelApiKey, this);
         this.private = new MCPrivate(this.UUIDs, this.servers, this);
 
         if(this.enabled) {
             this.start();
         }
     }
 
     start() {
         this.fetchUsernames().then(() => {
             this.hypixel.start();
         });
         this.private.start();
     }
 
     loadData() {
         const data = BdApi.loadData(pluginName, "minecraft");
         if(data) super.loadData();
         else {
             // fetch data from old version of CrossPlatformPlaying
             const data = BdApi.loadData(pluginName, "hypixel");
             if(data) {
                 this.enabled = data.enabled || false;
                 this.hypixelApiKey = data.apiKey || "";
                 this.discordToMinecraftUUIDs = data.usersMap || {};
                 this.debug = data.debug || false;
             }
             this.saveData();
             this.loadData();
         }
     }
 
     serializeData() {
         return {
             enabled: this.enabled || false,
             hypixelApiKey: this.hypixelApiKey || "",
             usersMap: this.removeDashesFromUUIDs(this.discordToMinecraftUUIDs || {}),
             servers: this.servers || [],
             debug: this.debug || false
         }
     }
 
     deserializeData(data) {
         this.enabled = data.enabled || false;
         this.hypixelApiKey = data.hypixelApiKey || "";
         this.discordToMinecraftUUIDs = data.usersMap || {};
         this.servers = data.servers || [];
         this.debug = data.debug || false;
     }
 
     removeDashesFromUUIDs(discordToMinecraftUUIDs) {
         for(const UUIDs of Object.values(discordToMinecraftUUIDs)) {
             for(const [index, UUID] of Object.entries(UUIDs)) {
                 UUIDs[index] = UUID.replaceAll(/-/g, "");
             }
         }
         return discordToMinecraftUUIDs;
     }
 
     getPresence(discord_id) {
         const uuids = this.discordToMinecraftUUIDs[discord_id];
         if (!uuids) return;
 
         const presences = [];
 
         for (const uuid of uuids) {
             const hypixelPresence = this.hypixel.getPresence(uuid);
             if(hypixelPresence) presences.push(hypixelPresence);
 
             const privatePresences = this.private.getPresence(uuid);
             if(privatePresences) presences.push(...privatePresences);
         }
 
         if(presences.length) return presences;
     }
 
     destroy(pluginShutdown) {
         this.enabled = false;
         this.hypixel.destroy();
         this.private.destroy();
         if(!pluginShutdown) this.saveData();
     }
 
     async fetchUsernames() {
         await Promise.all(this.UUIDs.map(this.fetchUsername.bind(this)));
     }
 
     async fetchUsername(UUID) {
         // https://wiki.vg/Mojang_API#UUID_to_Profile_and_Skin.2FCape
         const req = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${UUID}`);
         const json = JSON.parse(req.body);
         this.mcUUIDToUsername[UUID] = json.name;
     }
 
     getSettings(discordUserList, discordUsersDatalist) {
         // enabled switch
         const enabledSwitch = SettingsBuilder.enabledSwitch(this);
 
         // api key textbox
         const textboxChange = (value) => {
             this.apiKey = value;
             if(this.enabled) {
                 SettingsBuilder.toggleEnabledSwitch(enabledSwitch);
             }
         }
         const apiKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("Hypixel API Key", "Your Hypixel API key. Use the /api command in-game to get it.", this.hypixelApiKey, textboxChange);
 
         // uuid regex from https://github.com/bribes/Minecraft-UUID-RegEx
         const userMapDiv = SettingsBuilder.userMapInterface(this, null, discordUsersDatalist, null, discordUserList, this.discordToMinecraftUUIDs,
             "To get UUIDs, use <a href='https://namemc.com' target=\"_blank\">NameMC</a>.", "Minecraft UUID", /^([0-9a-f]{8})(?:-|)([0-9a-f]{4})(?:-|)(4[0-9a-f]{3})(?:-|)([89ab][0-9a-f]{3})(?:-|)([0-9a-f]{12})$/);
         // todo make them username instead of UUID
         // todo make it work when adding/removing users (changing hypixel timeout, etc.)
 
         const serverListDiv = SettingsBuilder.list(this, this.servers,
             "A list of Minecraft servers to regularly query. Only works for small private servers, and only when there are less than ~12 players online.", "Server URL");
 
         const debugSwitch = SettingsBuilder.debugSwitch(this);
 
         return SettingsBuilder.settingsPanel(this, enabledSwitch, apiKeyTextbox, userMapDiv, serverListDiv, debugSwitch);
     }
 }
 
 
 /***************
  **  HYPIXEL  **
  ***************/
 
 class Hypixel {
 
     constructor(UUIDs, apiKey, mc) {
         this.UUIDs = UUIDs;
         this.apiKey = apiKey;
         this.log = mc.log;
         this.updateUser = mc.updateUser;
 
         this.timeouts = [];
         this.presenceCache = {};
         this.games = {
             MAIN: {name: "Main Lobby", modes: []}
         };
     }
 
     start() {
         if(this.apiKey) {
             this.fetchGames().then(() => {
                 this.updateCache();
                 this.cacheInterval = setInterval(this.updateCache.bind(this), this.calculateRefreshInterval());
             });
         }
     }
 
     getPresence(uuid) {
         return this.presenceCache[uuid];
     }
 
     destroy() {
         for(const uuid in this.presenceCache) this.deletePresence(uuid);
         clearInterval(this.cacheInterval);
         for(const timeout of this.timeouts)
             clearTimeout(timeout);
     }
 
     async fetchGames() {
         const modes_req = await fetch("https://raw.githubusercontent.com/slothpixel/hypixelconstants/master/build/modes.json");
         const modes = JSON.parse(modes_req.body);
 
         const extract_modes = game => {
             if(!game.modes) return [];
             let modes = {};
             for(const mode of game.modes) {
                 if(mode.modes) modes = {...modes, ...extract_modes(mode)}
                 else modes[mode.key] = mode.name;
             }
             return modes;
         }
 
         for(const game of modes) {
             this.games[game.key] = {
                 name: game.check || game.name,
                 modes: extract_modes(game)
             }
         }
 
         // slothpixel is slow to update when new games come out (e.g. seasonal minigames)
         const hypixel_req = await fetch("https://api.hypixel.net/resources/games");
         const hypixel_modes = JSON.parse(hypixel_req.body);
         if(!hypixel_modes.success) return;
 
         for(const game_id of Object.keys(hypixel_modes.games)) {
             const game = hypixel_modes.games[game_id];
             const game_data = this.games[game_id] || {name: game.name, modes: {}};
 
             game_data.modes = {
                 ...game.modeNames,
                 ...game_data.modes
             }
 
             this.games[game_id] = game_data;
         }
     }
 
     calculateRefreshInterval() {
         // hypixel allows 2 requests per second
         // each player takes 1 request if offline, 2 if online
         // to be safe, I do max 1 request / 2 sec -> 1 player / 4 sec
         // aka if there are 3 players, we request all players every 12 seconds
         return this.UUIDs.length * 4000;
 
     }
 
     async getPlayerStatus(uuid) {
         const url = `https://api.hypixel.net/status?key=${this.apiKey}&uuid=${uuid}`;
         const req = await fetch(url);
 
         if(req.statusCode !== 200) {
             console.error(req);
             if(req.statusCode === 403) {
                 if(this.apiKey) BdApi.alert("Your Hypixel API key is invalid! The Hypixel plugin has been disabled, reenable it in settings.");
                 else BdApi.alert("You haven't provided a Hypixel API key!");
                 this.destroy();
             }
             else console.error("HTTP error " + req.statusCode + " when fetching hypixel player status data");
             return;
         }
 
         try {
             const json_data = JSON.parse(req.body);
             if(json_data.success && json_data.session.online) {
                 this.log(json_data);
                 this.getPlayerInfo(uuid, json_data.session);
             } else {
                 this.deletePresence(uuid);
                 if(!json_data.success) {
                     console.error(json_data);
                     err("Could not fetch player status for player with UUID " + uuid + "!");
                 }
             }
         } catch (e) {
             console.error(req);
             console.error(e);
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
                 this.log(json_data);
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
             const format = s => {
                 const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
                 return "(?) " + s.split(/[ _]/).map(capitalize).join(' ');
             }
 
             const game = this.games[session.gameType] || {};
             const mode = session.mode === "LOBBY" ? "In the Lobby" :
                 game.modes ? game.modes[session.mode] :
                     format(session.mode);
 
             const presence = {
                 application_id: customRpcAppId,
                 name: "Hypixel",
                 details: "Playing " + game.name || format(session.gameType),
                 state: mode,
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
 
             const previousPresence = this.presenceCache[uuid];
             if(!previousPresence) this.updateUser(uuid);
 
             this.presenceCache[uuid] = presence;
             this.log(presence);
         } catch(e) {
             console.error(e);
             console.error(player, session);
             err("Error while processing Hypixel data!");
         }
     }
 
     deletePresence(uuid) {
         if(this.presenceCache[uuid]) {
             delete this.presenceCache[uuid];
             this.updateUser(uuid);
         }
     }
 
     updateCache() {
         try {
             for (let i = 0; i < this.UUIDs.length; i++) {
                 this.timeouts.push(setTimeout(() => {
                     this.getPlayerStatus(this.UUIDs[i]);
                     this.timeouts.shift();
                 }, 4000 * i));
             }
         } catch (e) {
             err(e);
         }
     }
 }
 
 /******************
  **  MC PRIVATE  **
  ******************/
 
 class MCPrivate {
 
     constructor(UUIDs, servers, mc) {
         this.UUIDs = UUIDs;
         this.servers = servers;
         this.log = mc.log;
         this.updateUser = mc.updateUser;
 
         this.presenceCache = {};
         this.pingTimeouts = [];
         this.bufferedMessages = {};
     }
 
     start() {
         this.pingServers();
         this.interval = setInterval(this.pingServers.bind(this), 30_000);
     }
 
     pingServers() {
         for(const url of this.servers) {
             this.pingServer(url);
         }
     }
 
     parseServerAddress(url) {
         const colonIndex = url.indexOf(':');
         if(colonIndex === -1) return [url, 25565];
         return[url.substring(0, colonIndex), parseInt(url.substring(colonIndex + 1))];
     }
 
     pingServer(url) {
         const [address, port] = this.parseServerAddress(url);
 
         const ondata = (data) => {
             clearTimeout(timeout);
             removeFromList(this.pingTimeouts, timeout);
 
             const roundTrip = Date.now() - sentAt;
             this.log(`Ping to ${url} took ${roundTrip}ms`);
 
             this.parseData(data, url);
             preload.net.closeSocket(socketId);
         }
         const onerror = (e) => {
             if(e.message.includes("ETIMEDOUT")) return;
             console.error("Error connecting to Minecraft server", e);
         }
         const socketId = preload.net.createSocket(address, port, null, ondata, onerror);
 
         // handshake
         const handshake = [];
         handshake.push(this.varInt(47)) // protocol version (1.8)
         handshake.push(this.utfString(address));
         handshake.push(this.shortInt(port));
         handshake.push(this.varInt(1)); // status query (as opposed to login)
         this.sendPayload(socketId, 0, Buffer.concat(handshake));
 
         // request
         this.sendPayload(socketId, 0, Buffer.from([]));
 
         // in case of no response
         const sentAt = Date.now();
         let timeout = setTimeout(() => {
             removeFromList(this.pingTimeouts, timeout);
             this.log(`Server ${url} didn't respond within 5 seconds! Assuming the server is down`);
             this.clearServerPresences(url);
         }, 5000);
         this.pingTimeouts.push(timeout);
     }
 
     varInt(int) {
         // https://wiki.vg/Protocol#VarInt_and_VarLong
         const bytes = [];
         while (true) {
             if ((int & ~0x7F) === 0) {
                 bytes.push(int);
                 return Buffer.from(bytes);
             }
             bytes.push((int & 0x7F) | 0x80);
             int >>>= 7;
         }
     }
 
     utfString(str) {
         return Buffer.concat([this.varInt(str.length), Buffer.from(str, 'utf-8')]);
     }
 
     shortInt(int) {
         const buf = Buffer.alloc(2);
         buf.writeUInt16BE(int);
         return buf;
     }
 
     sendPayload(socketId, packetId, payload) {
         packetId = this.varInt(packetId);
         const packetLength = this.varInt(packetId.length + payload.length);
         const packet = Buffer.concat([packetLength, packetId, payload]);
 
         preload.net.sendToSocket(socketId, packet);
     }
 
     readVarInt (buf, start=0) {
         // https://github.com/PassTheMayo/minecraft-server-util/blob/master/src/util/varint.ts#L1
         let value = 0;
         let i = start;
         let currentByte;
 
         do {
             currentByte = buf[i];
             value |= ((currentByte & 0x7F) << (7 * (i - start)));
             i++;
         } while ((currentByte & 0x80) !== 0);
 
         return [value, i];
     }
 
     parseData(buf, url) {
         try {
             if(this.bufferedMessages[url]) {
                 buf = Buffer.concat([this.bufferedMessages[url], buf]);
                 delete this.bufferedMessages[url];
             }
 
             const [packetLength, i] = this.readVarInt(buf);
             if(buf.length < packetLength) {
                 this.log(`Received chunk of data from ${url}, waiting for the rest...`);
                 this.bufferedMessages[url] = buf;
                 return;
             }
 
             const [packetID, j] = this.readVarInt(buf, i);
             const [JSONLength, k] = this.readVarInt(buf, j);
             const unparsed = buf.slice(k, k + JSONLength).toString();
 
             const data = JSON.parse(unparsed);
             this.log(data);
 
             this.processData(data, url);
         } catch(e) {
             console.error(buf);
             console.error(e);
             err("Failed to parse server data for " + url);
         }
     }
 
     processData(data, url) {
         const players = data.players.sample || [];
         for(const player of players) {
             const uuid = player.id.replaceAll('-', "");
             let previousPresence;
             if(this.presenceCache[uuid] === undefined) this.presenceCache[uuid] = {};
             else previousPresence = this.presenceCache[uuid][url];
 
             const presence = {
                 application_id: customRpcAppId,
                 name: "Minecraft",
                 details: "Playing on " + url,
                 state: "In Game",
                 party: {
                     id: url,
                     size: [data.players.online, data.players.max]
                 },
                 type: 0,
                 timestamps: {
                     start: previousPresence ? previousPresence.timestamps.start : Date.now()
                 },
                 assets: {
                     large_image: formatAsset(`https://crafatar.com/renders/head/${uuid}?overlay=true`),
                     large_text: data.version.name,
                     small_image: formatAsset(data.favicon),
                     small_text: (data.description.text || data.description.toString() || "").replaceAll(/( {2})|\n/g, ' ').replaceAll(/§./g, '')
                 },
                 username: player.name
             };
 
             if(previousPresence) presence.timestamps.start = previousPresence.timestamps.start;
             else this.updateUser(uuid);
 
             this.presenceCache[uuid][url] = presence;
             this.log(presence);
         }
 
         // clear players not on server anymore
         const UUIDs = players.map(player => player.id.replaceAll('-', ""));
         for(const uuid in this.presenceCache) {
             if(!UUIDs.includes(uuid)) {
                 this.deletePresence(uuid);
             }
         }
     }
 
     deletePresence(uuid) {
         if(this.presenceCache[uuid]) {
             delete this.presenceCache[uuid];
             this.updateUser(uuid);
         }
     }
 
     clearServerPresences(url) {
         for(const presences of Object.values(this.presenceCache))
             delete presences[url];
     }
 
     getPresence(uuid) {
         if(this.presenceCache[uuid]) return Object.values(this.presenceCache[uuid]);
     }
 
     destroy() {
         clearInterval(this.interval);
         for(const uuid in this.presenceCache) this.deletePresence(uuid);
     }
 }
 
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
             this.interval = setInterval(this.getOnlineFriends.bind(this), 60_000);
         }
     }
 
     serializeData() {
         return {
             enabled: this.enabled || false,
             oauthKey: this.oauthKey || "",
             usersMap: this.discordToTwitchID || {},
             debug: this.debug || false
         }
     }
 
     deserializeData(data) {
         this.enabled = data.enabled || false;
         this.oauthKey = data.oauthKey || "";
         this.discordToTwitchID = data.usersMap || {};
         this.debug = data.debug || false;
     }
 
     destroy(pluginShutdown) {
         this.enabled = false;
         for(const id in this.presenceCache) this.deletePresence(id);
         clearInterval(this.interval);
         if(!pluginShutdown) this.saveData();
     }
 
     async getOnlineFriends() {
         if(!this.enabled || !this.oauthKey) return this.destroy();
 
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
                 this.destroy();
                 console.error(json_data);
                 return err("Error 401 when fetching twitch friends!");
             }
 
             if(json_data.status === 502) {
                 console.error(json_data);
                 return console.error("Error 502 when fetching twitch friends!");
             }
 
             if(json_data[0].errors) {
                 console.error(json_data);
                 if(["service timeout", "service error", "service unavailable"].includes(json_data[0].errors[0].message)) return;
                 console.error(data);
                 return err("Twitch friends request returned error!");
 
             }
 
             if(!json_data[0].data.currentUser) {
                 this.destroy();
                 console.error(json_data);
                 return err("Twitch friends request returned no currentUser! Is your account active?");
             }
 
             this.log(json_data);
 
             const streamerList = this.extractStreamerList(json_data[0].data.currentUser.friends.edges);
             const streamsMetadata = await this.fetchStreamsMetadata(streamerList);
             if(!streamerList || !streamsMetadata) return;
 
             this.usersList = {
                 idToName: {},
                 nameToId: {}
             }
             for (const friend of json_data[0].data.currentUser.friends.edges) {
                 this.processFriend(friend.node, streamsMetadata);
             }
         } catch (e) {
             console.error(e);
             console.error(data);
             err("Couldn't JSON Parse Twitch response!", data);
         }
     }
 
     extractStreamerList(friend_edges) {
         const streamerLogins = [];
         for(const edge of friend_edges) {
             if(edge.node.activity &&
                 edge.node.activity.type === "WATCHING" &&
                 edge.node.activity.user.stream &&
                 edge.node.activity.user.login &&
                 !streamerLogins.includes(edge.node.activity.user.login))
                 streamerLogins.push(edge.node.activity.user.login)
         }
         return streamerLogins;
     }
 
     async fetchStreamsMetadata(streamerLogins) {
         const requestBody = [];
         for(const streamerLogin of streamerLogins) {
             requestBody.push({
                 "operationName": "StreamMetadata",
                 "variables": {"channelLogin": streamerLogin},
                 "extensions": {
                     "persistedQuery": {
                         "version": 1,
                         "sha256Hash": "059c4653b788f5bdb2f5a2d2a24b0ddc3831a15079001a3d927556a96fb0517f"
                     }
                 }
             });
         }
 
         const data = await fetch("https://gql.twitch.tv/gql", {
             method: "POST",
             headers: {
                 "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko",
                 "Authorization": "OAuth " + this.oauthKey
             },
             body: JSON.stringify(requestBody)
         });
         const body = JSON.parse(data.body);
 
         try {
             const streamsMetadata = {};
             for(let i = 0; i < body.length; i++) {
                 const stream = body[i].data.user;
                 streamsMetadata[streamerLogins[i]] = {
                     title: stream.lastBroadcast.title,
                     viewers: stream.stream.viewersCount,
                     start: +new Date(stream.stream.createdAt),
                     profilePicture: stream.profileImageURL//.replace("70x70", "300x300") // 600x600 also works
                 }
             }
 
             return streamsMetadata;
         } catch(e) {
             console.error(e);
             console.error(data);
             console.error(body);
             err("Error while trying to fetch twitch metadata!");
         }
     }
 
     processFriend(friend, streamsMetadata) {
         try { // add friend to usersList
             this.usersList.idToName[friend.id] = friend.login;
             this.usersList.nameToId[friend.login] = friend.id;
 
             if(friend.activity) {
                 let previousPresence = this.presenceCache[friend.id];
                 if(previousPresence) previousPresence = previousPresence();
                 if(friend.activity.type === "WATCHING") {
                     if(!friend.activity.user.stream || !friend.activity.user.stream.game) // they are watching someone that is no longer streaming (their presence hasn't updated yet)
                         return delete this.presenceCache[friend.id];
 
                     const isWatchingSamePerson = previousPresence && previousPresence.details.substr(9) === friend.activity.user.displayName;
                     const away = friend.availability === "AWAY";
                     const metadata = streamsMetadata[friend.activity.user.login];
 
                     // the way type 3 (watching) presences are rendered is weird
                     // the large_text is shown both when hovering the image but also underneath the details (this is because that's how spotify Listening activities are rendered)
                     // in the "Active Now" tab in the friends list it only says "watching a stream" instead of rendering the whole activity like type 0 (playing) does
                     // the only reason type 3 exists in the first place is for YouTube Together as far as I can tell, so not much thought has been put into it
 
                     // also timestamps (01:23:45 elapsed) aren't rendered, so the presences are stored as functions
                     // when the presence is requested, the function is called and parses the current time into the large_text
 
                     this.presenceCache[friend.id] = () => {
                         return {
                             application_id: away ? customRpcAppId : null,
                             name: "Twitch",
                             details: `Watching ${friend.activity.user.displayName}`,
                             state: metadata.title,
                             type: 3,
                             party: {id: friend.activity.user.login},
                             timestamps: {start: isWatchingSamePerson ? previousPresence.timestamps.start : +new Date()},
                             assets: {
                                 large_image: away ? "899072297216913449" : "twitch:" + friend.activity.user.login,
                                 large_text: `${friend.activity.user.stream.game.displayName} | 👤 ${metadata.viewers} | 🕐 ${this.parseStartTime(metadata.start)}`,
                                 small_image: formatAsset(metadata.profilePicture),
                                 small_text: friend.activity.user.displayName
                             },
                             username: friend.displayName,
                             priority: Priorities.SECONDARY
                         }
                     }
                 } else if(friend.activity.type === "STREAMING") this.presenceCache[friend.id] = () => {
                     return {
                         name: "Twitch",
                         state: friend.activity.stream.game.displayName,
                         type: 1,
                         assets: {
                             large_image: "twitch:" + friend.login,
                             large_text: "As " + friend.displayName
                         },
                         url: "https://twitch.tv/" + friend.login,
                         id: "",
                         username: friend.displayName,
                         priority: Priorities.NONPRIMARY_PLAYING // should this be above the actual game presence?
                     }
                 }
 
                 this.log(this.presenceCache[friend.id]());
 
                 if(!previousPresence) this.updateUser(friend.id, this.discordToTwitchID);
             } else {
                 this.deletePresence(friend.id);
             }
         } catch(e) {
             console.error(friend, streamsMetadata);
             console.error(e);
             err("Error while processing Twitch friend data! " + e);
         }
     }
 
     deletePresence(id) {
         if(this.presenceCache[id]) {
             delete this.presenceCache[id];
             this.updateUser(id, this.discordToTwitchID);
         }
     }
 
     parseStartTime(start) {
         let streamingFor = Date.now() - start;
         streamingFor -= streamingFor % 5000; // to mitigate discord's weird polling/rendering frequency
         const sec = Math.floor(streamingFor / 1000 % 60),
             min = Math.floor(streamingFor / 1000 / 60 % 60),
             hour = Math.floor(streamingFor / 1000 / 60 / 60);
 
         const p = n => n.toString().padStart(2, '0'); // 5:3 -> 05:03
 
         if(hour) return `${hour}:${p(min)}:${p(sec)}`;
         return `${p(min)}:${p(sec)}`;
     }
 
     getPresence(discord_id) {
         const presenceFunctions = super.getPresence(discord_id, this.discordToTwitchID, this.presenceCache);
         if(presenceFunctions && presenceFunctions.length) return presenceFunctions.map(presenceFunction => presenceFunction());
     }
 
     getSettings(discordUserList, discordUsersDatalist) {
         // enabled switch
         const enabledSwitch = SettingsBuilder.enabledSwitch(this);
 
         // api key textbox
         const textboxChange = (value) => {
             this.oauthKey = value;
             if(this.enabled) {
                 SettingsBuilder.toggleEnabledSwitch(enabledSwitch);
             }
         }
         const apiKeyTextbox = new ZeresPluginLibrary.Settings.Textbox("OAuth Key", "How to get your Twitch OAuth key", this.oauthKey, textboxChange);
         setTimeout(() => {
             apiKeyTextbox.getElement().children[0].children[2].innerHTML = `<a href="https://github.com/giorgi-o/CrossPlatformPlaying/issues/4#issuecomment-1069634982" target="_blank">How to get your Twitch OAuth key</a>`
         }, 50);
 
         const datalist = SettingsBuilder.createDatalist("twitch", Object.keys(this.usersList.nameToId));
         const userMapDiv = SettingsBuilder.userMapInterface(this, datalist, discordUsersDatalist, this.usersList, discordUserList, this.discordToTwitchID, null, "Twitch username", /^\d+$/);
 
         const debugSwitch = SettingsBuilder.debugSwitch(this);
 
         return SettingsBuilder.settingsPanel(this, enabledSwitch, apiKeyTextbox, userMapDiv, debugSwitch);
     }
 }
 
 /************
  **  RIOT  **
  ************/
 
 class Riot extends Platform {
 
     constructor() {
         super("riot");
 
         this.riotPUUIDToUsername = {};
         this.riotPUUIDToSummonerName = {};
 
         const log = this.log.bind(this);
         const updateUser = puuid => super.updateUser(puuid, this.discordToRiotPUUIDs);
 
         this.valorant = new Valorant(this.riotPUUIDToUsername, log, updateUser);
         this.lol = new Lol(this.riotPUUIDToUsername, this.riotPUUIDToSummonerName, log, updateUser);
         this.wildRift = new WildRift(this.riotPUUIDToUsername, this.riotPUUIDToSummonerName, log, updateUser);
 
         this.loadData();
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
             usersMap: this.discordToRiotPUUIDs || {},
             debug: this.debug || false
         }
     }
 
     deserializeData(data) {
         this.enabled = data.enabled || false;
         this.cookies = data.cookies || "";
         this.discordToRiotPUUIDs = data.usersMap || {};
         this.debug = data.debug || false;
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
 
         if(presences.length) return presences;
     }
 
     destroy(pluginShutdown) {
         this.enabled = false;
         clearInterval(this.reconnectInterval);
         clearTimeout(this.heartbeat);
         if(this.socket) {
             preload.tls.sendToSocket(this.sock_id, "</stream:stream>");
             preload.tls.closeSocket(this.sock_id, true);
         }
 
         this.valorant.deleteAllPresences();
         this.lol.deleteAllPresences();
         this.wildRift.deleteAllPresences();
 
         if(!pluginShutdown) this.saveData();
     }
 
     async refreshToken(cookies) {
         const res = await fetch("https://auth.riotgames.com/authorize?" +
             "redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&" +
             "client_id=play-valorant-web-prod&" +
             "response_type=token%20id_token&" +
             "scope=account%20ban%20link%20lol%20offline_access%20openid&" +
             "nonce=123", {
             method: "GET",
             headers: {
                 // "cloudflare bitches at us without a user-agent" - molenzwiebel
                 "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36",
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
         // I doubt this works on Mac
         const filepath = process.env.LOCALAPPDATA + "/Riot Games/Riot Client/Data/RiotGamesPrivateSettings.yaml";
 
         let fileContents;
         try {
             fileContents = fs.readFileSync(filepath).toString();
         } catch(e) {
             return [false, e];
         }
 
         const parsedContents = this.parseYaml(fileContents);
         if(parsedContents) {
             const cookies = [];
             for(const cookie of parsedContents["riot-login"].persist.session.cookies) {
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
             this.presenceCache = {};
 
             const region = this.decodeToken(PAS).affinity;
             const address = this.XMPPRegionURLs[region];
             const port = 5223;
             const XMPPRegion = this.XMPPRegions[region];
 
             const messages = [
                 `<?xml version="1.0"?><stream:stream to="${XMPPRegion}.pvp.net" version="1.0" xmlns:stream="http://etherx.jabber.org/streams">`, "",
                 `<auth mechanism="X-Riot-RSO-PAS" xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><rso_token>${RSO}</rso_token><pas_token>${PAS}</pas_token></auth>`,
                 `<?xml version="1.0"?><stream:stream to="${XMPPRegion}.pvp.net" version="1.0" xmlns:stream="http://etherx.jabber.org/streams">`, "",
                 "<iq id=\"_xmpp_bind1\" type=\"set\"><bind xmlns=\"urn:ietf:params:xml:ns:xmpp-bind\"></bind></iq>",
                 "<iq id=\"_xmpp_session1\" type=\"set\"><session xmlns=\"urn:ietf:params:xml:ns:xmpp-session\"/></iq>",
                 "<iq type=\"get\" id=\"2\"><query xmlns=\"jabber:iq:riotgames:roster\" last_state=\"true\" /></iq>", // get friends list
                 "<presence/>"
             ]
 
             const onconnect = () => {
                 try {
                     this.socketReady = true;
 
                     this.log("Connected!");
 
                     clearInterval(this.reconnectInterval);
                     this.reconnectInterval = null;
 
                     sendNext();
                 } catch (e) {
                     err(e);
                 }
             }
 
             let bufferedMessage = "";
             const ondata = (data) => {
                 try {
                     data = bufToString(data);
                     this.log("<- " + data);
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
 
                         let closingTagIndex = data.indexOf(`</${firstTagName}>`);
                         if(closingTagIndex === -1) {
                             // message is split, we need to wait for the end
                             bufferedMessage = data;
                             break;
                         }
 
                         // check for tag inside itself eg <a><a></a></a>
                         // this happens when you send a message to someone
                         let containedTags = 0;
                         let nextTagIndex = data.indexOf(`<${firstTagName}`, 1);
                         while(nextTagIndex !== -1 && nextTagIndex < closingTagIndex) {
                             containedTags++;
                             nextTagIndex = data.indexOf(`<${firstTagName}`, nextTagIndex + 1);
                         }
 
                         while(containedTags > 0) {
                             closingTagIndex = data.indexOf(`</${firstTagName}>`, closingTagIndex + 1);
                             containedTags--;
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
                             if(data.includes("token-expired")) {
                                 // BdApi.alert("token expired!")
                                 this.log(error);
                                 this.restart();
                             } else {
                                 console.error(data);
                                 err("Riot XMPP Connection failed! " + data);
                                 this.destroy();
                             }
                         }
 
                         data = "";
                     }
                 } catch (e) {
                     err(e);
                 }
             }
 
             const onerror = console.error;
             const onclose = () => {
                 if(!this.enabled) return this.log("Socket disconnected!");
 
                 console.error("Riot Connection Closed! Retrying in 5 seconds...");
 
                 if(this.reconnectInterval) return;
 
                 this.reconnectInterval = setInterval(() => {
                     this.log("Reconnecting...");
                     this.establishXMPPConnection(RSO, PAS);
                 }, 5000);
 
                 clearTimeout(this.heartbeat);
             }
 
             this.socketReady = false;
             this.sock_id = preload.tls.createSocket(address, port, {}, onconnect, ondata, onerror, onclose);
 
             const send = data => {
                 try {
                     if(this.socketReady) preload.tls.sendToSocket(this.sock_id, data, "utf8", () => {
                         if(data !== " ") this.log("-> " + data)
                     });
 
                     clearTimeout(this.heartbeat);
                     this.heartbeat = setTimeout(() => send(" "), 150_000);
                 } catch (e) {
                     err(e);
                 }
             }
 
             const sendNext = () => send(messages.shift());
 
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
             this.log("Riot Access Token: " + access_token);
             err("Invalid Riot access token! Most likely your cookies are either invalid or expired.");
             return this.destroy();
         }
 
         const pas_token = await this.getPAS(access_token);
         if(!access_token.startsWith('e')) {
             this.log("Invalid Riot PAS: " + pas_token);
             // riot sometimes returns error 520 when fetching PAS
             // note: this is a very dangerous workaround
             return setTimeout(this.startXMPPConnection.bind(this), 1000);
         }
 
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
         this.log("My username is " + this.riotPUUIDToUsername[puuid]);
 
         const lolTagIndex = data.indexOf("<lol ");
 
         if(lolTagIndex > -1) {
             const lolNameIndex = data.indexOf("name=", lolTagIndex) + 6;
             const lolName = data.substring(lolNameIndex, data.indexOf("'", lolNameIndex));
 
             this.riotPUUIDToSummonerName[puuid] = lolName
             this.log("My summoner name is " + lolName);
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
         this.log(this.riotPUUIDToUsername);
         this.log(this.riotPUUIDToSummonerName);
     }
 
     getSettings(discordUserList, discordUsersDatalist) {
         // enabled switch
         const enabledSwitch = SettingsBuilder.enabledSwitch(this);
 
         // cookies textbox
         const textboxChange = (value) => {
             this.cookies = value;
             if(this.enabled) {
                 SettingsBuilder.toggleEnabledSwitch(enabledSwitch);
             }
         }
         const buttonClick = () => {
             const [success, cookies] = this.getCookiesFromLauncher();
             if(success) {
                 this.cookies = cookies;
                 cookiesTextbox.children[0].children[1].children[0].value = cookies;
             } else {
                 err(cookies);
             }
         }
         const cookiesTextbox = SettingsBuilder.textboxWithButton("Auth Cookies", "Your auth.riotgames.com cookies. Will only work if you're currently logged in with 'Remember me', and until you log out. Otherwise, use this guide.",
             this.cookies, textboxChange, {}, "Fetch cookies from launcher", buttonClick);
         setTimeout(() => {
             cookiesTextbox.children[0].children[1].children[0].removeAttribute("maxlength");
             cookiesTextbox.children[0].children[2].innerHTML = "Your auth.riotgames.com cookies. Will only work if you're currently logged in with 'Remember me', and until you log out. Otherwise, use <a href='https://github.com/giorgi-o/SkinPeek/wiki/How-to-get-your-Riot-cookies' target='_blank'>this guide</a>."
         }, 50);
 
         const usersList = {
             idToName: this.riotPUUIDToUsername,
             nameToId: {}
         }
         for(const [puuid, username] of Object.entries(this.riotPUUIDToUsername)) {
             usersList.nameToId[username] = puuid;
         }
         const datalist = SettingsBuilder.createDatalist("riot", Object.keys(usersList.nameToId));
         const userMapDiv = SettingsBuilder.userMapInterface(this, datalist, discordUsersDatalist, usersList, discordUserList, this.discordToRiotPUUIDs,
             "If you see numbers instead of names, it's either because the friends list hasn't loaded, or you are no longer friends with them.", "Riot ID", /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 
         const debugSwitch = SettingsBuilder.debugSwitch(this);
 
         return SettingsBuilder.settingsPanel(this, enabledSwitch, cookiesTextbox, userMapDiv, debugSwitch);
     }
 }
 
 /****************
  **  VALORANT  **
  ****************/
 
 const valRpcAppID = "811469787657928704"; // https://github.com/colinhartigan/valorant-rpc
 
 class Valorant {
     constructor(riotPUUIDToUsername, log, updateUser) {
         this.riotPUUIDToUsername = riotPUUIDToUsername;
         this.log = log;
         this.updateUser = updateUser;
 
         // constants
         // todo get these from valorant-api
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
             "Pitt": "Pearl",
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
         this.assets = {};
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
                     console.error(data);
                     err("Could not JSON parse Valorant presence data! " + e);
                 }
             } else {
                 const previousPresence = this.presenceCache[puuid];
                 delete this.presenceCache[puuid];
                 if(previousPresence) this.updateUser(puuid);
             }
         } catch (e) {
             console.error(data);
             err(e);
         }
     }
 
     processPresenceData(puuid, presenceData, timestamp) {
         this.log(presenceData);
 
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
             /* A bit of backstory:
              * On 21/09/2021 Riot removed map data from the presence, so you could no longer
              * know which map your friend was playing on.
              * Except they forgot to remove it during agent select. So the plugin would store
              * the map data when they were in agent select, and "remember" it during the
              * actual match, even though Riot didn't send it anymore.
              * (This wouldn't work if the plugin was started mid-match or for deathmatch).
              * Then on 20/10/2021, they mysteriously put it back. No idea if it's here to stay,
              * but having the extra code doesn't hurt :)
              */
             const getMapName = () => {
                 const mapName = this.maps[map] || map;
                 if(mapName) return mapName;
                 else {
                     // no map data, get map name from previous presence
                     if(previousPresence) {
                         const previousMapName = previousPresence.assets.large_text.split(" | ")[0];
                         if(previousMapName !== "No map data" && previousMapName !== "Lobby")
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
             const getPartyText = () => `${presenceData.partyAccessibility === "OPEN" ? "Open" : "Closed"} Party${presenceData.isPartyOwner && presenceData.partySize > 1 ? " Leader" : ""}`;
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
                 username: username,
                 priority: Priorities.PLAYING
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
                     const menusGetLargeImage = () => {
                         if(presenceData.isIdle) return this.assets["game_icon_yellow"];
                         if(presenceData.partyState === "CUSTOM_GAME_SETUP") return getMapIcon(presenceData.matchMap);
                         if(presenceData.playerCardId) return formatAsset(`https://media.valorant-api.com/playercards/${presenceData.playerCardId}/smallart.png`);
                         return this.assets["game_icon"];
                     }
                     const menusGetLargeText = () => (presenceData.isIdle ? "Away" : "Lobby");
 
                     presence = {
                         ...presenceBoilerplate,
                         details: menusGetDetails(),
                         assets: {
                             ...presenceBoilerplate.assets,
                             large_image: menusGetLargeImage(),
                             large_text: menusGetLargeText(),
                         },
                         priority: presenceData.isIdle ? Priorities.IN_LOBBY_AFK : Priorities.IN_LOBBY
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
                             large_text: (presenceData.isIdle ? "Away" : getMapName())
                         }
                     }
 
                     if(pregameGetDetails().endsWith("Match Found")) // match found 5sec timer
                         presence.timestamps.end = timestamp + 5000;
                     else if(pregameGetDetails().endsWith("Agent Select")) // start 75sec countdown once agent select has loaded (~79sec including loading time)
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
 
                         if(map === "Range")
                             s += presenceData.provisioningFlow === "NewPlayerExperience" ? "Tutorial" : "The Range";
                         else
                             s += gamemode;
 
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
                             large_text: (presenceData.isIdle ? "Away" : getMapName()) // + (username ? " | " + username : ""),
                         }
                     }
                     break;
             }
 
             this.presenceCache[puuid] = presence;
             this.log(presence);
 
             if(!previousPresence || presence.priority !== previousPresence.priority) {
                 this.updateUser(puuid);
             }
         } catch (e) {
             console.error(puuid, presenceData, timestamp);
             err(e);
         }
     }
 
     getPresence(puuid) {
         return this.presenceCache[puuid];
     }
 
     deleteAllPresences() {
         for(const puuid in this.presenceCache) {
             if(this.presenceCache[puuid]) {
                 delete this.presenceCache[puuid];
                 this.updateUser(puuid);
             }
         }
     }
 }
 
 
 /***********
  **  LOL  **
  ***********/
 
 const lolShowSkinName = true;
 
 const lolRpcAppId = "899030985855860756";
 
 class Lol {
     constructor(riotPUUIDToUsername, riotPUUIDToSummonerName, log, updateUser) {
         this.riotPUUIDToUsername = riotPUUIDToUsername;
         this.riotPUUIDToSummonerName = riotPUUIDToSummonerName;
 
         this.gameVersion = ""; // will be overridden by lolGetLatestVersion()
         this.champions = {};
         this.skins = {};
         this.assets = { // to be filled in by fetchRpcAssets()
             logo_lol: "899053983879008266",
             logo_tft: "899054046294462494",
             champions: {},
             ranks: {}
         }
         this.queues = { // manually adding in gamemodes not in riot json
             1130: {
                 "queueId": 1130,
                 "map": "Convergence",
                 "description": "Teamfight Tactics Hyper Roll",
                 "notes": "Added in manually"
             },
             1150: {
                 "queueId": 1150,
                 "map": "Convergence",
                 "description": "Teamfight Tactics Double Up",
                 "notes": "Added in manually"
             },
             1160: {
                 "queueId": 1160,
                 "map": "Convergence",
                 "description": "Teamfight Tactics Double Up (Workshop)",
                 "notes": "Added in manually"
             }
         }
         this.maps = {};
 
         this.presenceCache = {};
         this.log = log;
         this.updateUser = updateUser;
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
                         const status = Riot.extractDataFromXML(lolData, "st");
                         this.log(presenceData);
                         this.processPresenceData(puuid, presenceData, status, timestamp);
                     } catch(e) {
                         console.error(data);
                         err("Could not JSON parse Lol presence data!" + e);
                     }
                 }
             } else {
                 const previousPresence = this.presenceCache[puuid];
                 delete this.presenceCache[puuid];
                 if(previousPresence) this.updateUser(puuid);
             }
         } catch (e) {
             console.error(data);
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
             this.queues[queue.queueId] = queue;
         }
     }
 
     async fetchMapsData() {
         const mapsReq = await fetch("https://static.developer.riotgames.com/docs/lol/maps.json");
         const maps = JSON.parse(mapsReq.body);
         for(const map of maps) {
             this.maps[map.mapId.toString()] = {
                 name: map.mapName,
                 notes: map.notes
             };
         }
     }
 
     fetchData() {
         this.fetchGameVersion().then(() => {
             this.fetchRpcAssets();
             this.fetchMapsData();
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
 
     async processPresenceData(puuid, data, status, timestamp) {
         try {
             const username = this.riotPUUIDToSummonerName[puuid] || this.riotPUUIDToUsername[puuid];
             timestamp = Math.max(data.timeStamp, timestamp) || data.timeStamp || timestamp;
 
             let gamemode, map;
             if(data.mapId in this.maps) map = this.maps[data.mapId].name;
             if(data.gameQueueType === "PRACTICETOOL") [gamemode, map] = ["Practice Tool", "Summoner's Rift"];
             else if (data.queueId && this.queues[data.queueId]) {
                 const gamemodeData = this.queues[data.queueId];
                 [gamemode, map] = [gamemodeData.description, gamemodeData.map];
             } else if (data.queueId === "-1") gamemode = "Custom";
             else if (data.gameStatus === "outOfGame") gamemode = "In the Lobby"
             else gamemode = `(?) ${data.queueId} ${data.gameQueueType} ${data.gameStatus}`;
 
             const isAway = status === "away";
 
             const previousPresence = this.presenceCache[puuid];
 
             let presenceBoilerplate = {
                 application_id: lolRpcAppId,
                 name: data.gameMode === "TFT" ? "Teamfight Tactics" : "League of Legends",
                 type: 0,
                 details: gamemode,
                 assets: {
                     large_image: data.gameMode === "TFT" ? this.assets.logo_tft : this.assets.logo_lol, //`url:https://ddragon.leagueoflegends.com/cdn/${this.gameVersion}/img/profileicon/${data.profileIcon}.png`,
                     large_text: `Level ${data.level} | Mastery ${data.masteryScore}`,
                     small_image: data.rankedLeagueTier ? this.assets.ranks[data.rankedLeagueTier.toLowerCase()] : null,
                     small_text: data.rankedLeagueTier ? `${data.rankedLeagueTier} ${data.rankedLeagueDivision}` : null
 
                 },
                 timestamps: {
                     start: timestamp
                 },
                 username: username,
                 priority: Priorities.PLAYING
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
                 }
             }
 
             if (data.gameStatus !== "inGame" && ["SCOUTING", "LOCKED_IN"].includes(data.clashTournamentState)) {
                 presence = {
                     ...presenceBoilerplate,
                     details: "Clash",
                     state: data.clashTournamentState === "SCOUTING" ? "Scouting" : "Locked In"
                 }
             } else if (data.gameStatus === "outOfGame") {
                 presence = {
                     ...presenceBoilerplate,
                     details: isAway ? "Main Menu (away)" : "In the Main Menu",
                     priority: isAway ? Priorities.IN_LOBBY_AFK : Priorities.IN_LOBBY,
                     inLobby: true
                 }
                 if(previousPresence && previousPresence.inLobby)
                     presence.timestamps.start = previousPresence.timestamps.start;
             } else if (data.gameStatus.startsWith("hosting_")) {
                 presence = {
                     ...presenceBoilerplate,
                     state: isAway ? "In the Lobby (away)" : "In the Lobby",
                     priority: isAway ? Priorities.IN_LOBBY_AFK : Priorities.IN_LOBBY,
                     inLobby: true
                 }
                 if(data.gameStatus === "hosting_Custom")
                     presence.details = "Custom";
                 if(previousPresence && previousPresence.inLobby)
                     presence.timestamps.start = previousPresence.timestamps.start;
             } else if (data.gameStatus === "inQueue") {
                 presence = {
                     ...presenceBoilerplate,
                     state: "In Queue",
                     timestamps: {
                         start: data.timeStamp
                     }
                 }
             } else if (data.gameStatus === "championSelect") {
                 presence = {
                     ...presenceBoilerplate,
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
                     state: "In Game" + (map ? ` (${map})` : ""),
                     timestamps: {
                         start: data.timeStamp
                     },
                     assets: {
                         ...presenceBoilerplate.assets,
                         large_image: champion ? inGameGetLargeImage() : presenceBoilerplate.assets.large_image,
                         large_text: champion ? await inGameGetLargeText() : presenceBoilerplate.assets.large_text
                     }
                 }
             } else {
                 console.error(data);
                 console.error("Unknown LoL gameStatus! " + data.gameStatus);
             }
 
 
             if (presence) {
                 this.presenceCache[puuid] = presence;
                 this.log(presence);
 
                 if(!previousPresence || presence.priority !== previousPresence.priority) {
                     this.updateUser(puuid);
                 }
             }
         } catch (e) {
             console.error(puuid, data, timestamp)
             err(e);
         }
     }
 
     getPresence(puuid) {
         return this.presenceCache[puuid];
     }
 
     deleteAllPresences() {
         for(const puuid in this.presenceCache) {
             if(this.presenceCache[puuid]) {
                 delete this.presenceCache[puuid];
                 this.updateUser(puuid);
             }
         }
     }
 }
 
 
 /*****************
  **  WILD RIFT  **
  *****************/
 
 class WildRift {
     constructor(riotPUUIDToUsername, riotPUUIDToSummonerName, log, updateUser) {
         this.riotPUUIDToUsername = riotPUUIDToUsername;
         this.riotPUUIDToSummonerName = riotPUUIDToSummonerName;
         this.presenceCache = {};
         this.log = log;
         this.updateUser = updateUser;
     }
 
     processXMLData(data) {
         try {
             const puuid = data.substr(16, 36);
 
             // extract wild rift presence
             const wrData = Riot.extractDataFromXML(data, "wildrift");
             if(wrData) {
                 this.log(wrData);
                 try {
                     const timestamp = parseInt(Riot.extractDataFromXML(wrData, "s.t"));
                     const username = Riot.extractDataFromXML(data, "m");
                     this.processPresenceData(puuid, timestamp, username);
                 } catch (e) {
                     console.error(wrData);
                     err("Could not parse Wild Rift presence data!" + e);
                 }
             } else {
                 const previousPresence = this.presenceCache[puuid];
                 delete this.presenceCache[puuid];
                 if(previousPresence) this.updateUser(puuid);
             }
         } catch (e) {
             console.error(data);
             err(e);
         }
     }
 
     processPresenceData(puuid, timestamp, username) {
         username = username || this.riotPUUIDToSummonerName[puuid] || this.riotPUUIDToUsername[puuid];
 
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
             username: username,
             priority: Priorities.PLAYING
         };
 
         const previousPresence = this.presenceCache[puuid];
 
         this.presenceCache[puuid] = presence;
         this.log(presence);
 
         if(!previousPresence) {
             this.updateUser(puuid);
         }
     }
 
     getPresence(puuid) {
         return this.presenceCache[puuid];
     }
 
     deleteAllPresences() {
         for(const puuid in this.presenceCache) {
             if(this.presenceCache[puuid]) {
                 delete this.presenceCache[puuid];
                 this.updateUser(puuid);
             }
         }
     }
 }
 
 
 /************
  **  EPIC  **
  ************/
 
 class Epic extends Platform {
     constructor() {
         super("epic");
 
         this.presenceCache = {};
         this.statusCache = {};
 
         this.epicIdToDisplayName = {};
 
         this.fortniteGamemodes = {};
         this.fortniteRpcAppId = "432980957394370572";
 
         this.loadData();
         if(this.enabled) {
             this.start();
         }
     }
 
     async start() {
         if(!this.authData.refresh) {
             return this.destroy();
         }
         const success = await this.authenticate();
         if(success) {
             await Promise.all([this.fetchFortniteGamemodes(), this.fetchFortniteAssets()]);
             this.establishXMPPConnection(this.authData.token);
         } else {
             this.destroy();
         }
     }
 
     serializeData() {
         return {
             enabled: this.enabled || false,
             authData: this.authData || {},
             usersMap: this.discordToEpicID || {},
             debug: this.debug || false
         }
     }
 
     deserializeData(data) {
         this.enabled = data.enabled || false;
         this.authData = data.authData || {};
         this.discordToEpicID = data.usersMap || {};
         this.debug = data.debug || false;
     }
 
     getPresence(discord_id) {
         return super.getPresence(discord_id, this.discordToEpicID, this.presenceCache);
     }
 
     destroy(pluginShutdown) {
         this.enabled = false;
         for(const id in this.presenceCache) this.deletePresence(id);
         clearTimeout(this.refreshTimeout);
         clearInterval(this.reconnectInterval);
         clearTimeout(this.heartbeat);
         if(this.socket) {
             try {
                 this.socket.send("</stream:stream>");
             } catch(e) {console.error("Error while sending epic disconnect signal!", e)}
             this.socket.close(1000);
         }
         if(!pluginShutdown) this.saveData();
     }
 
     restart() {
         this.destroy();
         setTimeout(() => {
             this.enabled = true;
             this.saveData();
             this.start();
         }, 500); // sockets take a while to close
     }
 
     async fetchFortniteGamemodes() {
         const req = await fetch("https://fortnite-api.com/v1/playlists"); // big thanks to Officer and his excellent API
         const json = JSON.parse(req.body);
         for(const gamemode of json.data) {
             this.fortniteGamemodes[gamemode.id.toLowerCase()] = {
                 name: gamemode.name === "CREATIVE MATCHMAKING" ? "Creative (Fill)" : gamemode.name || gamemode.id, // oh epic...
                 subName: gamemode.subName,
                 maxSquadSize: gamemode.maxSquadSize,
                 maxPlayers: gamemode.maxPlayers,
                 smallIcon: gamemode.images.missionIcon
             }
         }
 
         // arena duos has null name/subname for some reason
         this.fortniteGamemodes["playlist_showdownalt_duos"] = {
             name: "Arena",
             subName: "Duos",
             maxSquadSize: 2,
             maxPlayers: 100,
             smallIcon: "https://fortnite-api.com/images/playlists/playlist_showdownalt_duos/missionicon.png"
         }
     }
 
     async fetchFortniteAssets() {
         const req = await fetch(`https://discord.com/api/v9/oauth2/applications/${this.fortniteRpcAppId}/assets`);
         const json = JSON.parse(req.body);
         for(const asset of json) {
             if(asset.name === "fortnite") this.fortniteLogoAssetId = asset.id;
         }
     }
 
     decodeJWT(token) {
         return JSON.parse(atob(token.split("~", 2)[1].split(".", 2)[1]));
     }
 
     getID(token) {
         return this.decodeJWT(token).sub;
     }
 
     getDisplayName(token) {
         return this.decodeJWT(token).dn;
     }
 
     getTokenExpiry(token) {
         return this.decodeJWT(token).exp * 1000;
     }
 
     async authenticate() {
         // returns true or false based on success
         if(this.authData.refresh) {
             if(this.authData.token) {
                 const expiry = this.getTokenExpiry(this.authData.token);
                 this.log("Token expiring at " + expiry);
                 if(expiry - new Date() > 300_000) {
                     // fetch friends list to see if token is valid
                     const success = await this.fetchFriendsList();
                     if(success) {
                         // use the token
                         this.setupRefreshTimeout();
                         return true;
                     }
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
         this.log("Refreshing token...");
 
         // check refresh token is still valid
         const refreshExpiry = this.decodeJWT(this.authData.refresh).exp * 1000;
         if(refreshExpiry - new Date() < 5000) {
             this.authData.refresh = null;
             BdApi.alert("Your refresh token has expired! Please generate a new one.");
             return false;
         }
 
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
 
             err("EPIC: Could not refresh token! You may need to login again. " + errorMessage);
             return false;
         }
 
         this.authData = {
             token: authData.access_token,
             refresh: authData.refresh_token
         }
         this.saveData();
 
         this.log("Refreshed token as " + authData.displayName);
 
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
         this.log("Redeemed exchange code as " + authData.displayName);
 
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
         this.log("Redeemed auth code as " + authData.displayName);
 
         this.authData = {
             token: authData.access_token,
             refresh: authData.refresh_token
         }
 
         this.restart();
 
         return true;
     }
 
     setupRefreshTimeout() {
         const tokenExpiry = this.decodeJWT(this.authData.token).exp * 1000;
         this.refreshTimeout = setTimeout(this.refreshToken.bind(this), tokenExpiry - new Date() - 300_000);
     }
 
     async fetchFriendsList() {
         this.epicIdToDisplayName[this.getID(this.authData.token)] = this.getDisplayName(this.authData.token);
 
         // get friends list
         const req = await fetch(`https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${this.getID(this.authData.token)}/summary?displayNames=true`, {
             headers: {
                 Authorization: "Bearer " + this.authData.token
             }
         });
         const json = JSON.parse(req.body);
 
         if(req.statusCode !== 200) {
             console.error(req);
             console.error(this.authData);
 
             if(req.statusCode.toString().startsWith('5')) {
                 console.error(`Error ${req.statusCode} when trying to fetch friends list! Retrying in 5 seconds...`);
                 await new Promise(r => setTimeout(r, 5000));
                 return await this.fetchFriendsList()
             } else if(req.statusCode !== 401) {
                 err("Error while fetching Epic friends!");
             }
 
             return false;
         }
 
         // get username of friends
         // we can request in batches of 100, partition the list of IDs
         const friendIDs = json.friends.map(friend => friend.accountId);
         const reqs = [];
         for (let i = 0; i < friendIDs.length; i += 100) {
             const partition = friendIDs.slice(i, i + 100);
             const req = fetch("https://account-public-service-prod.ol.epicgames.com/account/api/public/account?accountId=" + partition.join("&accountId="), {
                 headers: {
                     Authorization: "Bearer " + this.authData.token
                 }
             });
             reqs.push(req);
         }
 
         for(const req of reqs) {
             const reqResult = await req;
             if(reqResult.statusCode !== 200) {
                 console.error(reqResult);
                 err("Error while fetching Epic friends partition!");
                 continue;
             }
 
             const json = JSON.parse(reqResult.body);
             for(const friend of json) {
                 this.epicIdToDisplayName[friend.id] = friend.displayName;
             }
         }
 
         this.log(this.epicIdToDisplayName);
         return true;
     }
 
     // xmpp stuff
     establishXMPPConnection(token) {
         try {
             this.presenceCache = {};
 
             const address = "xmpp-service-prod.ol.epicgames.com";
             const accountId = this.getID(token);
 
             const messages = [
                 `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" version="1.0" xml:lang="en" to="prod.ol.epicgames.com"/>`, '',
                 `<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${btoa("\0" + accountId + "\0" + token)}</auth>`,
                 `<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" version="1.0" xml:lang="en" to="prod.ol.epicgames.com"/>`, '',
                 `<iq xmlns="jabber:client" type="set" id="4f3712da-95d0-43cd-b5de-c039e88c18c9"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>V2:launcher:WIN::</resource></bind></iq>`,
                 `<presence xmlns="jabber:client" id="638e9399-7760-435d-a351-c168f06bc7fa"/>`
             ]
 
             const sock = new WebSocket(`wss://${address}`, "xmpp");
             sock.onopen = () => {
                 try {
                     this.log("Connected!");
 
                     clearInterval(this.reconnectInterval);
                     this.reconnectInterval = null;
 
                     sendNext();
                     this.heartbeat = setInterval(sendPing, 60_000);
                 } catch (e) {
                     err(e);
                 }
             };
             this.socket = sock;
 
             const send = (data, log=true) => {
                 if(!data || !this.enabled) return;
                 try {
                     if(sock.readyState === 1) {
                         sock.send(data);
                         if(log) this.log("-> " + data);
                     }
                 } catch (e) {
                     err(e);
                 }
             }
 
             const sendNext = () => send(messages.shift());
 
             let lastPing = 0;
             const sendPing = () => {
                 if(lastPing > 0 && Date.now() - lastPing > 150_000) {
                     this.log("Haven't received a ping back in 150sec, reconnecting...");
                     return this.restart();
                 }
 
                 send("<iq xmlns=\"jabber:client\" id=\"acbeabf8-b04b-4e94-a044-6d6b8f04514e\" type=\"get\"><ping xmlns=\"urn:xmpp:ping\"/></iq>", false);
             }
 
             sock.onmessage = event => {
                 try {
                     // const timestamp = performance.timeOrigin + event.timeStamp
                     const data = event.data;
 
                     if(data.includes("acbeabf8-b04b-4e94-a044-6d6b8f04514e"))
                         lastPing = Date.now();
                     else
                         this.log("<- " + data);
 
                     if(data.startsWith("<failure")) {
                         this.restart();
                     }
                     else if(messages.length > 0) sendNext();
 
                     // process data
                     if(data.startsWith("<presence ")) this.processPresence(data);
                 } catch (e) {
                     console.error(event);
                     console.error(event.data);
                     err(e);
                 }
             };
             global.epicreceive = sock.onmessage; // TODO remove this
 
             sock.error = console.error;
             sock.onclose = () => {
                 if(!this.enabled || sock !== this.socket) return this.log("Websocket disconnected!");
                 console.error("Epic disconnected! Retrying in 5 seconds...");
 
                 if(this.reconnectInterval) return;
 
                 this.reconnectInterval = setInterval(() => {
                     this.log("Reconnecting...");
                     this.establishXMPPConnection(token);
                 }, 5000);
 
                 clearTimeout(this.heartbeat);
             };
         } catch (e) {
             console.error(token);
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
 
         let show;
         const showStart = presence.indexOf("<show>") + 6;
         if(showStart > 5) {
             const showEnd = presence.indexOf("</show>", showStart);
             show = presence.substring(showStart, showEnd);
         }
 
         const statusStart = presence.indexOf("<status>") + 8;
         if(statusStart === 7) return;
         const statusEnd = presence.indexOf("</status>", statusStart);
         const status_raw = presence.substring(statusStart, statusEnd);
         const status = JSON.parse(status_raw);
         this.log(status);
 
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
 
         this.renderPresence(id, presenceSource, status, presenceType, show, timestamp);
     }
 
     deletePresence(id) {
         if(this.presenceCache[id]) {
             delete this.presenceCache[id];
             this.updateUser(id, this.discordToEpicID);
         }
     }
 
     async renderPresence(id, presenceSource, status, presenceType, show, timestamp) {
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
             username: username,
             priority: Priorities.NONPRIMARY_PLAYING
         }
         let presence;
 
         switch (presenceSource) {
             case "launcher":
                 if(presenceType === "unavailable") return;
                 if(!timestamp) return;
 
                 if(status.Properties.OverrideAppId_s) {
                     if(status.Properties.OverrideAppId_s === "fn" && previousPresence && previousPresence.name === "Fortnite") return;
                     else if(status.Properties.OverrideAppId_s === "9773aa1aa54f4f7b80e44bef04986cea" && previousPresence.name && previousPresence.name.startsWith("Rocket League")) {
                         if(previousPresence.details.includes("InGame")) return; // we already have score + timestamp data
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
                 else return this.deletePresence(id);
                 break;
             case "fghi4567OXA1CdeeCuAmUWMhmfiO3EAl": // rocket league
                 if(presenceType === "unavailable") return this.deletePresence(id);
 
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
                 const timeRemainingMatches = currentStatus.match(/ \[(.+) remaining]/); // example "InGame 0:1 [2:45 remaining]"
                 const overtimeMatches = currentStatus.match(/ \[Overtime (.+)]/); // example "InGame 2:2 [Overtime 0:15]"
                 if(timeRemainingMatches) {
                     const timeRemainingFormatted = timeRemainingMatches[1];
                     const [min, sec] = timeRemainingFormatted.split(':', 2);
                     const seconds = parseInt(min) * 60 + parseInt(sec);
                     presence.timestamps.end = + new Date() + seconds * 1000;
                     presence.details = presence.details.replace(timeRemainingMatches[0], "").replace("InGame", "In Game - ");
                 } else if(overtimeMatches) {
                     const overtimeFormatted = overtimeMatches[1];
                     const [min, sec] = overtimeFormatted.split(':', 2);
                     const seconds = parseInt(min) * 60 + parseInt(sec);
                     presence.timestamps.start = + new Date() - seconds * 1000;
                     presence.details = presence.details.replace(overtimeMatches[0], "").replace("InGame", "In Game - ");
                 } else if(previousPresence.name === "Rocket League") {
                     // reset timestamp if changed state, e.g. main menu -> in game
                     if(previousPresence.details !== currentStatus) presence.timestamps.start = + new Date();
                 }
 
                 break;
             case "Fortnite":
                 try {
                     const gamemode = this.fortniteGamemodes[(status.Properties.GamePlaylistName_s || "").toLowerCase()] || {name: status.Properties.GamePlaylistName_s || "", maxSquadSize: 0, maxPlayers: 100};
                     const partyData = Object.keys(status.Properties).filter(s => s.startsWith("party.joininfodata"))[0];
 
                     const detailsTemplate = (name, subName) => name + (subName ? ` (${subName})` : "");
                     const stateTemplate = (kills, players, maxPlayers=100) => `💀 ${kills}  👤 ${players}/${maxPlayers}`; // thin space because discord removes double spaces
 
                     let details, state;
                     if(status.bIsPlaying) {
                         const kills = parseInt(status.Properties.FortGameplayStats_j.numKills);
                         if(status.bIsJoinable) { // creative
                             details = detailsTemplate(gamemode.name || "Creative", gamemode.subName);
 
                             if(status.Properties.ServerPlayerCount_i) state = stateTemplate(kills, status.Properties.ServerPlayerCount_i, gamemode.maxPlayers || 16);
                             else state = "Loading";
                         } else if(status.Properties.GamePlaylistName_s) { // battle royale
                             details = detailsTemplate(gamemode.name || status.Properties.GamePlaylistName_s, gamemode.subName);
 
                             if(status.Properties.ServerPlayerCount_i) state = stateTemplate(kills, status.Properties.ServerPlayerCount_i);
                             else state = `Loading`;
                         }
                         if(status.Properties.FortGameplayStats_j.bFellToDeath) state += " - Died of fall damage";
                     } else if (status.Properties.FortGameplayStats_j) { // in the lobby, hasn't launched a gamemode yet
                         if(gamemode.name) details = detailsTemplate(gamemode.name || status.Properties.GamePlaylistName_s, gamemode.subName);
                         if(show === "xa" || show === "away") state = "Away - In the Lobby";
                         else state = "In the Lobby";
                     } else { // game loading
                         details = "Loading";
                     }
 
                     const partySize = status.Properties.FortPartySize_i || status.Properties.Event_PartySize_s;
                     const maxPartySize = gamemode.maxSquadSize || (partySize <= 4 ? 4 : 16);
 
                     presence = {
                         ...presenceBoilerplate,
                         application_id: this.fortniteRpcAppId,
                         name: "Fortnite",
                         details: details,
                         state: state,
                         assets: {
                             large_image: this.fortniteLogoAssetId,
                             small_image: formatAsset(gamemode.smallIcon),
                             small_text: gamemode.subName
                         },
                         party: {
                             id: status.SessionId,
                             size: [partySize, maxPartySize]
                         },
                         timestamps: {
                             start: timestamp
                         },
                         priority: Priorities.PLAYING,
                         gameId: status.SessionId
                     }
 
                     if(previousPresence.gameId === presence.gameId)
                         presence.timestamps.start = previousPresence.timestamps.start;
 
                     if(partyData) {
                         const partyInfo = status.Properties[partyData];
                         if(partyInfo.sourceDisplayName) presence.username = partyInfo.sourceDisplayName;
                         if(partyInfo.partyId) presence.party.id = partyInfo.partyId;
                     }
                 } catch(e) {
                     console.error(presence);
                     console.error(status);
                     err(e);
                 }
 
                 break;
             default: // misc
                 if(presenceType === "unavailable") return this.deletePresence(id);
 
                 let name;
                 switch(presenceSource) {
                     case "fghi4567eJdrrwo5Dgu1RiO2R0vM1XVK":
                         name = "Satisfactory";
                         break;
                     case "fcb692f0fdf14526b1ffbb77cf1ef288":
                         name = "Paladins";
                         break;
                     case "f71b1231985f48d1af3de723e0a6acdd":
                         name = "Smite";
                         break;
                     case "fghi4567gDK32qevrArU3uezn7r9kY8Y":
                         name = "Rocket League Sideswipe";
                         break;
                     case "68d2cc08f9a94b8fb51af4f5cfa6d41b":
                         name = "Grand Theft Auto V";
                         break;
                     default:
                         if(this.debug) err("Unknown game ID! " + presenceSource);
                         else console.error("Unknown game ID! " + presenceSource);
                         return;
                 }
 
                 presence = {
                     ...presenceBoilerplate,
                     name: name,
                     details: this.statusCache[id],
                     assets: {
                         large_image: epicLogoID
                     },
                     timestamps: {
                         start: timestamp
                     }
                 }
         }
 
         this.presenceCache[id] = presence;
         this.log(presence);
 
         if(!previousPresence || presence.name !== previousPresence.name) {
             this.updateUser(id, this.discordToEpicID);
         }
     }
 
     async getAppName(appID) {
         // uses store search. definitely not the best way since it won't work on hidden/unlisted games.
         if(appID === "fn") return "Fortnite";
         if(appID === "ue") return "Unreal Engine";
         const req = await fetch("https://www.epicgames.com/graphql", {
             method: "POST",
             headers: {"Content-Type": "application/json"},
             body: JSON.stringify({
                 query: "query searchStoreQuery($count: Int = 5, $keywords: String, $namespace: String, $category: String) {\n  Catalog {\n    searchStore(\n      count: $count\n      keywords: $keywords\n      namespace: $namespace\n      category: $category\n    ) {\n      elements {\n        title\n        namespace\n        id\n      }\n    }\n  }\n}\n",
                 variables: {
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
 
         // cookies textbox
         const deleteButtonClick = () => {
             this.authData = {};
             SettingsBuilder.getTextboxInput(tokenTextbox).value = "";
             if(this.enabled) SettingsBuilder.toggleEnabledSwitch(enabledSwitch);
             this.saveData();
         }
         const tokenTextbox = SettingsBuilder.textboxWithButton("Refresh Token", null, this.authData.refresh, null, {placeholder: "Refresh token", disabled: true}, "Delete", deleteButtonClick);
 
         const codeButtonClick = async (textbox, redeemFunction) => {
             const code = SettingsBuilder.getTextboxInput(textbox).value;
             if(!code) return;
 
             const button = textbox.children[0].children[1].children[1];
             button.classList.remove("bd-button-danger");
             button.innerHTML = "Redeeming...";
 
             const success = await redeemFunction(code);
 
             if(success) {
                 button.innerHTML = "Success!";
                 SettingsBuilder.getTextboxInput(tokenTextbox).value = this.authData.refresh;
                 SettingsBuilder.getTextboxInput(textbox).value = "";
                 this.saveData();
             } else {
                 button.innerHTML = "Retry";
                 button.classList.add("bd-button-danger");
             }
         }
 
         const authCodeButtonClick = () => codeButtonClick(authCodeTextbox, this.redeemAuthCode.bind(this));
         const authCodeTextbox = SettingsBuilder.textboxWithButton(null, null, null, null, {placeholder: "Auth code"}, "Redeem auth code", authCodeButtonClick);
 
         const exchangeCodeButtonClick = () => codeButtonClick(exchangeCodeTextbox, this.redeemExchangeCode.bind(this));
         const exchangeCodeTextbox = SettingsBuilder.textboxWithButton(null, "If you're signed in in your browser, get your auth code here. Otherwise, generate an exchange code.", null, null, {placeholder: "Exchange code"}, "Redeem exchange code", exchangeCodeButtonClick);
         setTimeout(() => {
             exchangeCodeTextbox.children[0].children[2].innerHTML = `If you're signed in in your browser, get your auth code <a href="https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code" target="_blank">here</a>. Otherwise, <a href="https://github.com/xMistt/fortnitepy-bot/wiki/Exchange-Code" target="_blank">generate an exchange code</a>.`
         }, 50);
 
         // remove spacing between textboxes
         setTimeout(() => {
             tokenTextbox.children[0].children[3].classList.remove("divider-1Jfi9s");
             authCodeTextbox.children[0].children[3].classList.remove("divider-1Jfi9s");
             exchangeCodeTextbox.children[0].children[3].classList.remove("divider-1Jfi9s");
         }, 50);
 
         const usersList = {
             idToName: this.epicIdToDisplayName,
             nameToId: {}
         }
         for(const [id, username] of Object.entries(this.epicIdToDisplayName)) {
             usersList.nameToId[username] = id;
         }
         const datalist = SettingsBuilder.createDatalist("epic", Object.keys(usersList.nameToId));
         const userMapDiv = SettingsBuilder.userMapInterface(this, datalist, discordUsersDatalist, usersList, discordUserList, this.discordToEpicID,
             "If you see numbers instead of names, it's either because the friends list hasn't loaded, or you are no longer friends with them.","Epic username", /^.+$/);
 
         const debugSwitch = SettingsBuilder.debugSwitch(this);
 
         return SettingsBuilder.settingsPanel(this, enabledSwitch, tokenTextbox, authCodeTextbox, exchangeCodeTextbox, userMapDiv, debugSwitch);
     }
 }
 
 /**********
  **  EA  **
  **********/
 
 class EA extends Platform {
 
     constructor() {
         super("ea");
 
         this.eaLogoAssetId = "950210006509289492";
         this.apexRpcAppId = "893911040713191444"; // https://github.com/Holfz/ApexRPC
 
         this.apexAssetNames = {
             "Logo": "apex-legends",
             "Training": "firing-range",
             "World's Edge": "world-edge",
             "King's Canyon": "king-canyon",
             "Olympus": "olympus",
             "Stormpoint": "stormpoint",
             "Encore": "encore"
         }
 
         this.presenceCache = {};
         this.friendIdToDisplayName = {};
         this.assetCache = {};
         this.apexAssets = {};
 
         this.loadData();
         if(this.enabled) {
             this.start();
         }
     }
 
     async start() {
         if(!this.remid) return this.destroy();
         this.fetchApexAssets();
         const accessToken = await this.authenticate(this.remid);
         if(!accessToken) return;
         await Promise.all([this.getOwnUsername(), this.getFriendsList()]);
         if(accessToken) await this.connectWebsocket(accessToken);
     }
 
     serializeData() {
         return {
             enabled: this.enabled || false,
             remid: this.remid || "",
             usersMap: this.discordToEaIDs || {},
             debug: this.debug || false
         }
     }
 
     deserializeData(data) {
         this.enabled = data.enabled || false;
         this.remid = (data.remid || "").trim();
         this.discordToEaIDs = data.usersMap || {};
         this.debug = data.debug || false;
     }
 
     async fetchApexAssets() {
         const req = await fetch(`https://discord.com/api/v9/oauth2/applications/${this.apexRpcAppId}/assets`);
         const json = JSON.parse(req.body);
         for(const asset of json) {
             this.apexAssets[asset.name] = asset.id;
         }
     }
 
     async authenticate(remid) {
         try { // step 1
             const req1 = await fetch("https://accounts.ea.com/connect/auth?" +
                 "client_id=JUNO_PC_CLIENT&" +
                 "response_type=code&" +
                 "nonce=1&" +
                 "pc_sign=eyJhdiI6InYxIiwiYnNuIjoiRzJDN002MyIsImdpZCI6Mzk4NzYsImhzbiI6IkFSUkFZMCIsIm1hYyI6IiQwMGZmOWJiNGMyYTAiLCJtaWQiOiI3NTc3MTg0MDY1MDM5NjIzNTkxIiwibXNuIjoiLkcyQzdNNjMuQ05DTUswMDA5NDAwMjYuIiwic3YiOiJ2MSIsInRzIjoiMjAyMi0yLTI3IDEzOjM1OjQyOjI0NiJ9.XPSVI2ksrbveN_FcG2ep_1QpqLphs-cWZRgcsSnIfsI&" +
                 "", {
                 headers: {
                     "Cookie": `remid=${remid}`,
                 }
             });
             this.log(req1);
 
             if(!req1.headers['set-cookie']) {
                 BdApi.alert("Could not login to EA! Most likely your RemID is invalid.");
                 this.destroy();
                 return;
             }
 
             const remidHeader = req1.headers['set-cookie'][0];
             remid = remidHeader.split('=')[1].split(';')[0];
             this.log("New RemID: " + remid);
             this.remid = remid;
             this.saveData();
 
             const redirectUrl = req1.headers.location;
             const code = redirectUrl.match(/code=(.+)&?/)[1];
             this.log("Auth Code: " + code);
 
             // step 2
             const req2 = await fetch("https://accounts.ea.com/connect/token", {
                 method: "POST",
                 headers: {
                     "content-type": "application/x-www-form-urlencoded"
                 },
                 body:
                     "grant_type=authorization_code" +
                     `&code=${code}&` +
                     "client_id=JUNO_PC_CLIENT&" +
                     "client_secret=4mRLtYMb6vq9qglomWEaT4ChxsXWcyqbQpuBNfMPOYOiDmYYQmjuaBsF2Zp0RyVeWkfqhE9TuGgAw7te&" +
                     ""
             });
             this.log(req2);
 
             const authResponse = JSON.parse(req2.body)
             this.log(authResponse);
 
             authResponse.accessTokenExpires = Date.now() + authResponse.expires_in * 1000;
             this.auth = authResponse;
             return authResponse.access_token;
         } catch(e) {
             console.error(remid);
             err(e);
         }
     }
 
     getRemIDFromEaApp() {
         // I doubt this works on Mac
         const filepath = process.env.LOCALAPPDATA + "/Electronic Arts/EA Desktop/cookie.ini";
 
         let fileContents;
         try {
             fileContents = fs.readFileSync(filepath).toString();
         } catch(e) {
             return [false, e.toString() || "Could not read file!"];
         }
 
         for(const line of fileContents.split('\n')) {
             if(line.startsWith("remid=")) {
                 return [true, line.substring(26).trim()];
             }
         }
 
         return [false, "Could not parse file! Is it corrupt? (Note: EA have started encrypting the cookie.ini file, so this plugin won't work until I find a way to bypass the encryption)"];
     }
 
     async getOwnUsername() {
         this.log("Fetching own username...");
 
         const req = await fetch("https://service-aggregation-layer.juno.ea.com/graphql?" +
             "operationName=GetPersonas&" +
             `variables=${encodeURIComponent(JSON.stringify({overrideCountryCode: ""}))}&` +
             `extensions=${encodeURIComponent(JSON.stringify({persistedQuery: {version: 1, sha256Hash: "b81297d11a35ee6e21f5c5582452121dccf7ef54fd60e66218ee7dd199fb310d"}}))}`, {
             headers: {
                 "Authorization": `Bearer ${this.auth.access_token}`,
             }
         });
         const json = JSON.parse(req.body);
         this.log(json);
 
         this.ownId = json.data.me.id;
         this.log("My id is " + this.ownId);
 
         for(const persona of json.data.me.personas) {
             if(persona.namespaceName === "cem_ea_id")
                 this.ownUsername = persona.displayName;
             else if(persona.namespaceName === "discord" && persona.displayName) {
                 this.log(`My linked discord account is ${persona.displayName}`);
                 const [username, discriminator] = persona.displayName.split("#");
                 if(username && discriminator) {
                     const user = ZeresPluginLibrary.DiscordModules.UserStore.findByTag(username, discriminator);
                     if(user && !(user.id in this.discordToEaIDs))
                         this.discordToEaIDs[user.id] = [this.ownId];
                 }
             }
         }
 
         if(this.ownUsername) {
             this.log("My username is " + this.ownUsername);
             this.friendIdToDisplayName[this.ownId] = this.ownUsername;
         } else {
             console.error("[EA] Couldn't find my username!");
         }
     }
 
     async getFriendsList() {
         this.log("Fetching friends list...");
 
         const req = await fetch("https://service-aggregation-layer.juno.ea.com/graphql?" +
             "operationName=GetMyFriends&" +
             `variables=${encodeURIComponent(JSON.stringify({offset: 0, limit: 99}))}&` +
             `extensions=${encodeURIComponent(JSON.stringify({persistedQuery: {version: 1, sha256Hash: "f8856d3ce53eac1d88ee1780851888a25575fad4f142e7b6142c0ace28797baa"}}))}`, {
             headers: {
                 "Authorization": `Bearer ${this.auth.access_token}`,
             }
         });
         const json = JSON.parse(req.body);
         this.log(json);
 
         for(const friendData of json.data.me.friends.items) {
             if(!friendData.player.uniqueName) continue; // ghost friend
             this.friendIdToDisplayName[friendData.id] = friendData.player.displayName;
         }
 
         this.log(this.friendIdToDisplayName);
     }
 
     async connectWebsocket(accessToken) {
         if(!this.enabled) return;
 
         const onconnect = () => {
             this.log("Connected to WebSocket!");
 
             clearInterval(this.reconnectInterval);
             this.reconnectInterval = null;
 
             this.messageNumber = 0;
             this.login(accessToken);
 
             this.heartbeat = setInterval(this.sendHeartbeat.bind(this), 10000);
         }
         const onmessage = this.messageReceived.bind(this);
         const onclose = () => {
             if(!this.enabled || sock !== this.socket) return this.log("Websocket disconnected!");
             console.error("EA disconnected! Retrying in 5 seconds...");
 
             if(this.reconnectInterval) return;
 
             this.reconnectInterval = setInterval(async () => {
                 if(this.auth.accessTokenExpires - Date.now() < 10_000) {
                     accessToken = await this.authenticate(this.remid);
                 }
 
                 this.log("Reconnecting...");
                 this.connectWebsocket(accessToken);
             }, 5000);
 
             clearTimeout(this.heartbeat);
         }
 
         this.socket_id = SimpleSocket.create("wss://rtm.tnt-ea.com:8095/websocket", {
             headers: {
                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.15.2 Chrome/83.0.4103.122 Safari/537.36 Origin/10.6.0.00000 EAApp/12.0.179.5090"
             }
         }, onconnect, onmessage, onclose);
         this.sendToSocket = (data) => SimpleSocket.send(this.socket_id, data);
     }
 
     varInt(int) {
         const bytes = [];
         while (true) {
             if ((int & ~0x7F) === 0) {
                 bytes.push(int);
                 return Buffer.from(bytes);
             }
             bytes.push((int & 0x7F) | 0x80);
             int >>>= 7;
         }
     }
 
     readVarInt (buf, start=0) {
         let value = 0;
         let i = start;
         let currentByte;
 
         do {
             currentByte = buf[i];
             value |= ((currentByte & 0x7F) << (7 * (i - start)));
             i++;
         } while ((currentByte & 0x80) !== 0);
 
         return [value, i];
     }
 
     readString(buf, start) {
         // start is the index of the string length, not the string itself
         const [length, lengthEnd] = this.readVarInt(buf, start);
         const subarray = buf.subarray(lengthEnd, lengthEnd + length);
         return [subarray.toString(), lengthEnd + length];
     }
 
     stringifyBuffer = (buf, step=25) => {
         const lines = [];
         for(let i = 0; i < buf.length; i += step) {
             let line = [...buf.slice(i, i + step)];
             let s = "";
             s += (line.map(n => n.toString(16).toUpperCase().padStart(2, '0')).join(' ')).padEnd(step * 3 - 1, ' ');
             s += " | ";
             s += line.map(n => 32 <= n && n <= 126 ? String.fromCharCode(n) : '.').join('');
             lines.push(s);
         }
         return lines.join('\n');
     }
 
     messageReceived(buf) {
         this.log(" <-\n" + this.stringifyBuffer(buf));
 
         try { // check if buffer has timestamp
             const [bufferLength, bufferLengthEnd] = this.readVarInt(buf, 5);
             if(buf[bufferLengthEnd] === 0x0A) {
                 // there is a timestamp
                 const [timestampString, timestampStringEnd] = this.readString(buf, bufferLengthEnd + 1);
                 const timestamp = timestampString.split('-')[2];
 
                 const packetTypeIndex = timestampStringEnd;
                 const packetType = buf[packetTypeIndex];
                 switch (packetType) {
                     case 0x7A:
                         // Auth response
                         this.log("Got auth response!");
 
                         const [messageLength1, messageLength1End] = this.readVarInt(buf, packetTypeIndex + 1);
                         const [messageLength2, messageLength2End] = this.readVarInt(buf, messageLength1End + 1);
 
                         const [ownIdString, ownIdEnd] = this.readString(buf, messageLength2End + 1);
                         this.ownId = ownIdString.split(':')[1];
                         this.log("My id is " + this.ownId);
 
                         this.requestOwnPresence();
                         this.requestFriendPresences();
                         break;
                     case 0x92:
                         // friends list
                         this.log("Got friends list!");
                         break;
                     case 0x62:
                         // friend name
                         this.log("Got friend name!");
                         break;
                 }
             } else if(buf[bufferLengthEnd] === 0x3A) {
                 // there is no timestamp
                 const [bufferLengthAgain, bufferLengthAgainEnd] = this.readVarInt(buf, bufferLengthEnd + 1);
                 const [userId, userIdEnd] = this.readString(buf, bufferLengthAgainEnd + 1);
 
                 const packetTypeIndex = userIdEnd;
                 const packetType = buf[packetTypeIndex];
                 switch (packetType) {
                     case 0x12:
                         // presence
                         if(userId === this.ownId) this.log("Received my own presence");
                         else this.log("Received presence for user " + userId);
 
                         const [presenceJson, presenceJsonEnd] = this.readString(buf, packetTypeIndex + 1);
                         const presence = JSON.parse(presenceJson);
                         this.log(presence);
 
                         if(presence.gameActivity_richPresence) this.log(JSON.parse(presence.gameActivity_richPresence));
 
                         const [timestamp, timestampEnd] = this.readString(buf, presenceJsonEnd + 1);
 
                         this.processPresence(userId, presence, +new Date(timestamp)); // does this work with timezones?
 
                         break;
                     case 0x28:
                         // no presence for user
                         this.log(`User ${userId} is offline`);
 
                         delete this.presenceCache[userId];
                         break;
                 }
             } else {
                 if(
                     buf[bufferLengthEnd] !== 0xC2 && // "session changed"
                     buf[bufferLengthEnd] !== 0x82 && // game invite
                     buf[bufferLengthEnd] !== 0x72 // unknown, short buffer e.g. "00 00 00 04 0A 02 72 00"
                 ) {
                     if(this.debug) err("Neither 0A or 3A after message! " + buf[bufferLengthEnd].toString(16));
                 }
             }
         } catch(e) {
             err(e);
         }
     }
 
     send(buf, log=true) {
         if(log) this.log(" ->\n" + this.stringifyBuffer(buf));
         this.sendToSocket(buf);
     }
 
     encodeString(s) {
         const stringLength = this.varInt(s.length);
         const stringEncoded = Buffer.from(s, 'utf-8');
         return Buffer.concat([stringLength, stringEncoded]);
     }
 
     createTimestampBuffer() {
         const timestamp = Date.now();
         const timestampString = `c-${this.messageNumber++}-${timestamp}-${timestamp}`;
         return this.encodeString(timestampString);
     }
 
     formatAndSendBuffer(buf, log=true) {
         try {
             const timestampBuffer = this.createTimestampBuffer();
 
             const totalLength = timestampBuffer.length + buf.length;
             const totalLengthVarInt = this.varInt(totalLength + 1);
             const totalLength32Bit = Buffer.allocUnsafe(4);
             totalLength32Bit.writeUint32BE(totalLength + totalLengthVarInt.length + 2);
 
             const newline = Buffer.from([0x0A]);
             const header = Buffer.concat([totalLength32Bit, newline, totalLengthVarInt, newline]);
 
             this.send(Buffer.concat([header, timestampBuffer, buf]), log);
         } catch(e) {
             err(e);
         }
     }
 
     login(accessToken) {
         try {
             const packetType = Buffer.from([0xF2, 0x02]);
 
             const newline = Buffer.from([0x0A]);
             const accessTokenBuffer = this.encodeString(accessToken);
             const middleData = Buffer.from([0x10, 0x00, 0x18, 0x00, 0x20, 0x00, 0x2A, 0x06, 0x6F, 0x72, 0x69, 0x67, 0x69, 0x6E, 0x30, 0x04, 0x3A]);
             const platformJson = this.encodeString('{"clientType":"ClientWeb","version":"juno-spa-0.0.1-15146-80d8a20","integrations":"LoginV3"}');
 
             const restOfPacketLengthBuffer = this.varInt(newline.length + accessTokenBuffer.length + middleData.length + platformJson.length);
 
             const handshakeBuffer = Buffer.concat([packetType, restOfPacketLengthBuffer, newline, accessTokenBuffer, middleData, platformJson]);
             this.formatAndSendBuffer(handshakeBuffer);
         } catch(e) {
             err(e);
         }
     }
 
     sendHeartbeat() {
         try { // the function is called in setInterval, so any unhandled error will crash the whole discord
             this.formatAndSendBuffer(Buffer.from([0xA2, 0x01, 0x00]), false);
         } catch(e) {
             err(e);
         }
     }
 
     requestOwnPresence() {
         const header = Buffer.from([0x12, 0x19, 0x12, 0x17, 0x0A]);
         const ownIdBuffer = this.encodeString(this.ownId);
         const middleNumber = Buffer.from([0x12]);
         const originString = this.encodeString("origin");
         this.formatAndSendBuffer(Buffer.concat([header, ownIdBuffer, middleNumber, originString]));
     }
 
     requestFriendPresences() {
         this.formatAndSendBuffer(Buffer.from([0x9A, 0x03, 0x00]));
     }
 
     async processPresence(id, data, timestamp) {
         try {
             if(data.gameActivity_isNull) return this.deletePresence(id);
             if(data.presence_null === undefined) return; // is own status (not presence, just online/away/invisible)
 
             const presenceData = JSON.parse(data.gameActivity_gamePresence);
             const richPresenceData = data.gameActivity_richPresence ? JSON.parse(data.gameActivity_richPresence) : {};
             const gameArtUrl = await this.getGameArt(data.gameActivity_productId)
             const presence = {
                 application_id: customRpcAppId,
                 name: data.gameActivity_gameTitle,
                 details: richPresenceData.data,
                 type: 0,
                 timestamps: {start: timestamp},
                 assets: {
                     large_image: formatAsset(gameArtUrl) || this.eaLogoAssetId,
                     large_text: data.gameActivity_gameTitle
                 },
                 username: this.friendIdToDisplayName[id],
                 priority: Priorities.PLAYING,
                 session: presenceData.data.session
             };
 
             const previousPresence = this.presenceCache[id];
             const wasPlayingSameGame = previousPresence && previousPresence.name === presence.name;
             const status = richPresenceData.data;
 
             switch (data.gameActivity_productId) {
                 case "Origin.OFR.50.0002694": { // Apex Legends
                     presence.application_id = this.apexRpcAppId;
                     presence.assets.large_image = this.apexAssets[this.apexAssetNames["Logo"]];
 
                     let match = status.match(/(.+) - (.+)/);
                     if(match) {
                         const map = match[1];
                         presence.assets.large_image = this.apexAssets[this.apexAssetNames[map]] || formatAsset(gameArtUrl);
 
                         presence.details = "Playing " + match[2]; // gamemode
                         match = status.match(/(.+) - (.+) \((.+)\)/);
                         if(match) {
                             presence.state = match[3]; // "10 Squads Left"
                         }
                     }
 
                     if(wasPlayingSameGame && presence.session === previousPresence.session) {
                         presence.timestamps = previousPresence.timestamps;
                     }
                     break;
                 }
                 case "Origin.OFR.50.0004567": { // FIFA 22
                     let match = status.match(/^\((.+)\)$/);
                     if(match) presence.details = match[1];
 
                     match = status.match(/^(.+) (\d+-\d+ [A-Za-z]{1,3} [V\-] [A-Za-z]{1,3}.+$)/);
                     if(match) {
                         presence.details = "Playing " + match[1];
                         presence.state = match[2];
 
                         if(wasPlayingSameGame && previousPresence.state) {
                             presence.timestamps = previousPresence.timestamps;
                         }
                     }
 
                     match = status.match(/^(.+) \((.+)\)$/);
                     if(match) {
                         presence.details = match[1];
                         presence.state = match[2];
                         presence.priority = Priorities.IN_LOBBY;
                     }
                     break;
                 }
                 default: {
                     if(previousPresence && status === previousPresence.details) {
                         presence.timestamps = previousPresence.timestamps;
                     }
                 }
             }
 
             this.presenceCache[id] = presence;
             this.log(presence);
 
             if(!previousPresence || presence.name !== previousPresence.name) {
                 this.updateUser(id, this.discordToEaIDs);
             }
         } catch(e) {
             console.error(id, data, timestamp);
             err(e);
         }
     }
 
     deletePresence(id) {
         if(this.presenceCache[id]) {
             delete this.presenceCache[id];
             this.updateUser(id, this.discordToEaIDs);
         }
     }
 
     async getGameArt(productId) {
         try {
             if(this.assetCache[productId]) return this.assetCache[productId];
 
             const req = await fetch("https://service-aggregation-layer.juno.ea.com/graphql?" +
                 "operationName=inGamePresenceData&" +
                 `variables=${encodeURIComponent(JSON.stringify({locale: "en", offerIds: [productId]}))}&` +
                 `extensions=${encodeURIComponent(JSON.stringify({persistedQuery: {version: 1, sha256Hash: "6d7316368c350bbf3de50676add3d1d00d73021270f9d365e5a5e388fd9741c8"}}))}`);
             const json = await JSON.parse(req.body);
 
             if(!json.data.gameProducts.items[0].baseItem) return null;
 
             this.assetCache[productId] = json.data.gameProducts.items[0].baseItem.keyArt.aspect1x1Image.path;
             return json.data.gameProducts.items[0].baseItem.keyArt.aspect1x1Image.path;
         } catch(e) {
             console.error(e);
             err("Could not get game art for game " + productId);
         }
     }
 
     getPresence(discord_id) {
         return super.getPresence(discord_id, this.discordToEaIDs, this.presenceCache);
     }
 
     getSettings(discordUserList, discordUsersDatalist) {
         // enabled switch
         const enabledSwitch = SettingsBuilder.enabledSwitch(this);
 
         // cookies textbox
         const textboxChange = (value) => {
             this.cookies = value;
             if(this.enabled) {
                 SettingsBuilder.toggleEnabledSwitch(enabledSwitch);
             }
         }
         const buttonClick = () => {
             BdApi.showConfirmationModal("Warning", "Fetching your RemID will log you out of the EA App. Are you sure?", {
                 danger: true,
                 confirmText: "Yes, I'm sure",
                 onConfirm: getRemID
             });
         }
         const getRemID = () => {
             const button = remidTextbox.children[0].children[1].children[1];
             button.classList.remove("bd-button-danger");
             button.innerHTML = "Fetching...";
 
             const [success, remid] = this.getRemIDFromEaApp();
             if(success) {
                 this.remid = remid;
                 remidTextbox.children[0].children[1].children[0].value = remid;
                 button.innerHTML = "Success!";
                 this.saveData();
             } else {
                 const error = remid;
                 button.classList.add("bd-button-danger");
                 if(error.message && error.message.includes("no such file")) {
                     button.innerHTML = "File not found";
                 } else {
                     button.innerHTML = "Failed";
                     console.error(error);
                     BdApi.alert(error);
                 }
             }
         }
         const remidTextbox = SettingsBuilder.textboxWithButton("RemID Cookie", "Your EA RemID cookie. Fetching it only works on the new 'EA App', not Origin.",
             this.remid, textboxChange, {}, "Fetch RemID from EA App", buttonClick);
 
         const usersList = {
             idToName: this.friendIdToDisplayName,
             nameToId: {}
         }
         for(const [id, username] of Object.entries(this.friendIdToDisplayName)) {
             usersList.nameToId[username] = id;
         }
         const datalist = SettingsBuilder.createDatalist("ea", Object.keys(usersList.nameToId));
         const userMapDiv = SettingsBuilder.userMapInterface(this, datalist, discordUsersDatalist, usersList, discordUserList, this.discordToEaIDs, null, "EA Username", /^\d+$/);
 
         const debugSwitch = SettingsBuilder.debugSwitch(this);
 
         return SettingsBuilder.settingsPanel(this, enabledSwitch, remidTextbox, userMapDiv, debugSwitch);
     }
 
     destroy(pluginShutdown) {
         this.enabled = false;
         for(const id in this.presenceCache) this.deletePresence(id);
         clearInterval(this.heartbeat);
         clearInterval(this.reconnectInterval);
         if(this.socket_id) SimpleSocket.close(this.socket_id, 1001);
         if(!pluginShutdown) this.saveData();
     }
 }
 
 
 
 /**************
  **  PLUGIN  **
  **************/
 
 const platforms = [Riot, Epic, Steam, EA, Minecraft, Twitch];
 
 const CrossPlatformPlaying = (() => {
     return !global.ZeresPluginLibrary ? class {
         constructor() {this._config = config;}
         getName() {return config.info.name;}
         getAuthor() {return config.info.authors.map(a => a.name).join(", ");}
         getDescription() {return config.info.description;}
         getVersion() {return config.info.version;}
 
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
         const plugin = (Plugin, Library) => {
             return class CrossPlatformPlaying extends Plugin {
                 constructor() {
                     super();
                 }
 
                 onStart() {
                     // Required function. Called when the plugin is activated (including after reloads)
 
                     console.log("[CrossPlatformPlaying] Starting...");
                     const loadStart = Date.now();
 
                     // for debugging
                     global.CPP = {
                         plugin: this, platforms, config, preload,
                         fetch, setTimeout, setInterval, updateUser, removeFromList,
                         Platform, SimpleSocket, SettingsBuilder, Priorities,
                         timeouts, intervals
                     };
 
                     // check if config json is valid
                     try {
                         BdApi.loadData(pluginName, "");
                     } catch(e) {
                         return console.error("[CrossPlatformPlaying] Could not load config JSON! Is it corrupt?");
                     }
 
                     discord_id = BdApi.findModuleByProps("getUser", "getCurrentUser").getCurrentUser().id;
 
                     this.loadPatches();
                     this.patchGetActivity();
                     this.patchRenderHeader();
                     this.setUpdateUser();
 
                     // initialise platforms
                     this.instances = [];
                     for(const platform of platforms) {
                         this.instances.push(new platform());
                     }
 
                     console.log(`[CrossPlatformPlaying] Started in ${Date.now() - loadStart}ms`);
                 }
 
                 onStop() {
                     // Required function. Called when the plugin is deactivated
                     BdApi.Patcher.unpatchAll(pluginName);
 
                     for(const platform of this.instances) platform.destroy(true);
                     this.instances.length = 0; // clear array for next time plugin is launched
 
                     for(const timeout of timeouts) clearTimeout(timeout);
                     for(const interval of intervals) clearInterval(interval);
                     timeouts.length = 0; intervals.length = 0;
                 }
 
                 getSettingsPanel() {
                     if(!this.buttonClassNames) this.buttonClassNames = BdApi.findModuleByProps("button", "lookFilled", "grow");
 
                     const body = document.createElement("div");
 
                     // to check if settings panel is still open
                     const bodyId = crypto.randomBytes(16).toString("base64");
                     body.id = bodyId;
 
                     const theInterval = setInterval(() => {
                         if(document.getElementById(bodyId)) {
                             for(let i = 0; i < buttons.length; i++) {
                                 const platform = this.instances[i];
                                 const button = buttons[i];
 
                                 if(platform.enabled) {
                                     button.classList.remove(this.buttonClassNames.colorTransparent);
                                     button.classList.add(this.buttonClassNames.colorBrand);
                                 } else {
                                     button.classList.remove(this.buttonClassNames.colorBrand);
                                     button.classList.add(this.buttonClassNames.colorTransparent);
                                 }
 
                             }
                         } else { // settings panel closed
                             clearInterval(theInterval);
                         }
                     }, 100);
 
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
                         button.classList.add(this.buttonClassNames.button, this.buttonClassNames.lookFilled, this.buttonClassNames.colorBrand, this.buttonClassNames.sizeMedium, this.buttonClassNames.grow);
                         button.style.margin = "5px";
                         button.style.display = "inline"; // to make the buttons appear side by side
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
 
                     const activityRenderModule = moduleList.find(m => m.exports?.Z?.prototype?.renderImage);
 
                     // module that returns "Playing a game" header
                     // fetching it is slow though, so I opted to compare the final header name to the one in the strings module
                     // const gameHeaderModule = moduleList.find(m => m.exports.Z?.toString().includes("USER_ACTIVITY_HEADER_PLAYING")).exports.Z.name
                     
                     const stringsModule = moduleList.find(m => m.exports.Z?.Messages?.USER_ACTIVITY_HEADER_PLAYING);
 
                     const ActivityStore = ZeresPluginLibrary.DiscordModules.UserStatusStore;
 
                     this.patchGetActivity = () => {
                         BdApi.Patcher.after(pluginName, ActivityStore, "getActivities", (_this, args, ret) => {
                             const start = Date.now();
 
                             try {
                                 const id = args[0];
 
                                 let newActivities = [];
 
                                 for(const platform of this.instances) {
                                     const presences = platform.getPresence(id);
                                     if(presences && presences.length) newActivities.push(...presences);
                                 }
 
                                 if(newActivities.length === 0) return ret;
 
                                 const activityPriority = (act) => {
                                     if(act.priority) return act.priority;
                                     if(act.type === 2) return Priorities.SECONDARY; // Spotify
                                     if(act.application_id === "307998818547531777") return Priorities.SECONDARY; // Medal.tv
                                     if(act.details || act.state) return Priorities.DISCORD_RICH_PRESENCE;
                                     return Priorities.DISCORD_NORMAL;
                                 }
                                 const sortFunction = (a, b) => {
                                     return activityPriority(b) - activityPriority(a);
                                 }
                                 return newActivities.concat(ret).sort(sortFunction);
                             } finally {
                                 const time = Date.now() - start;
                                 if(time > 5) console.warn(`[${pluginName}] getActivities took ${time}ms`);
                             }
                         });
 
                         global.CPP.getActivities = ZeresPluginLibrary.DiscordModules.UserStatusStore.getActivities;
                     }
 
                     this.setUpdateUser = () => {
                         const dispatchFunction = ZeresPluginLibrary.DiscordModules.UserStatusStore._dispatcher.dispatch.bind(ZLibrary.DiscordModules.UserStatusStore._dispatcher);
 
                         updateUser = (id) => {
                             const user = ZeresPluginLibrary.DiscordModules.UserStore.getUser(id);
                             /*if(user) console.log(`Updating user ${user.username}#${user.discriminator}`);
                             else console.log(`Updating user with id ${id}...`);*/
 
                             if(user) dispatchFunction({
                                 type: "GUILD_MEMBER_UPDATE",
                                 guildId: null, // update in all guilds
                                 user: user
                             });
                         }
                         global.CPP.updateUser = updateUser;
                     }
 
                     this.patchRenderHeader = () => {
                         BdApi.Patcher.after(pluginName, activityRenderModule.exports.Z.prototype, "renderHeader", (_this, args, ret) => {
                             if(!ret) return ret;
 
                             const activity = _this.activity;
                             if(!activity?.username) return ret;
 
                             const prop = ret.props.children[1].props.children.props;
                             const playingAGame = stringsModule.exports.Z.Messages.USER_ACTIVITY_HEADER_PLAYING;
 
                             if(prop.children === playingAGame) prop.children = `Playing as ${activity.username}`;
                             else prop.children += ` as ${activity.username}`;
 
                             return ret;
                         });
                     }
 
                     /*this.reloadActivityRenderModule = () => {
                         // the activityRenderModule.renderImage function stores a reference to the unpatched getAssetImage function
                         // we need to reload the webpack to update the reference
                         const reloadedModule = {exports: {}};
                         ZeresPluginLibrary.WebpackModules.require.m[activityRenderModule.id](reloadedModule, reloadedModule.exports, ZeresPluginLibrary.WebpackModules.require);
 
                         BdApi.Patcher.instead(pluginName, activityRenderModule.exports.default.prototype, "renderImage", (_this, args) => reloadedModule.exports.default.prototype.renderImage.call(_this, ...args));
                         BdApi.Patcher.instead(pluginName, activityRenderModule.exports.default.prototype, "renderHeader", (_this, args) => reloadedModule.exports.default.prototype.renderHeader.call(_this, ...args));
                     }*/
                 }
             };
         };
         return plugin(Plugin, Api);
     })(global.ZeresPluginLibrary.buildPlugin(config));
 })();
 /*@end@*/
 