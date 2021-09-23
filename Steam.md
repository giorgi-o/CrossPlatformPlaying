## How to setup
In order for Steam presences to work, you need to provide two things
1. A Steam API key
2. The list of Steam users and their respective Discord IDs

## How to get a Steam API key
Just go [here](https://steamcommunity.com/dev/apikey). You will need to login to your Steam account.
Your API key should look something like `123456789ABCDEF123456789ABCDEF12`

## How to get Steam IDs
Use [steamidfinder.com](https://www.steamidfinder.com/). You need to get the `steamID64 (Dec)` ID of each of the friends you want to see the presence of on Discord.

## Where to put the API Key and the Steam IDs
Open `CrossPlatformPlaying.plugin.js` in your favorite text editor and look at the top of the file for the following:
```js
// steam
const SteamApiKey = "" || BdApi.loadData("CrossPlatformPlaying", "steam_key");
const discordToSteamIDs = {
    // "discord id": ["steam id", "other steam id", ...]
    "316978243716775947": ["76561198255445061"], // example
}
```
Put your API key between the two quotes on the second line, and fill in the list of friend IDs using the same format.
Your file should look something like this:
```js
// steam
const SteamApiKey = "123456789ABCDEF123456789ABCDEF12" || BdApi.loadData("CrossPlatformPlaying", "steam_key");
const discordToSteamIDs = {
    "316978243716775947": ["76561194458255096"], // James
    "316937167824775948": ["76561501982554445"], // Rob
    "316371978246775949": ["76525544611985060", "76528506055446119"], // John (he has two steam accounts)
    "316978243757167940": ["76565445119825061"], // Mike
    "316978677594243711": ["76561255445061198"], // Will
}
```
You can also edit the Steam API Key in the plugin settings.
