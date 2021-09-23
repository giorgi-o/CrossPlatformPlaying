## How to setup
In order for Hypixel presences to work, you need to provide two things
1. A Hypixel API key
2. The list of Minecraft UUIDs and their respective Discord IDs

## How to get a Hypixel API key
Join Hypixel and type `/api` in the chat.  
Your API key should look something like `12345678-9abcd-ef12-3456-789abcdef123`.

## How to get Minecraft UUIDs
Use [namemc.com](https://namemc.com/) by searching their username, and getting their UUID without the dashes.

## Where to put the API Key and the Minecraft UUIDs
Open `CrossPlatformPlaying.plugin.js` in your favorite text editor and look at the top of the file for the following:
```js
// hypixel
const hypixelApiKey = "" || BdApi.loadData("CrossPlatformPlaying", "hypixel_key");
const discordToMinecraftUUIDs = {
    // "discord id": "minecraft uuid"
    "316978243716775947": "b2a90b2243154a12a374c94e03f9d176", // example
}
```
Put your API key between the two quotes on the second line, and fill in the list of UUIDs using the same format.

Your file should look something like this:
```js
// hypixel
const hypixelApiKey = "" || BdApi.loadData("CrossPlatformPlaying", "hypixel_key");
const discordToMinecraftUUIDs = {
    // "discord id": "minecraft uuid"
    "316978243477167759": "b2a90b224315403f9a12a374c94ed176", // James
    "316243716797875947": "b374c94e02a90b2243154a12a3f9d176", // Rob
    "316978275947437165": "b2a12a374c94e03f9a90b2243154d176", // John
    "316978472437167759": "b2a90b224374c94e03f9d154a12a3176", // Mike
    "317167759469782437": "b2243154a12b2a90a374c94e03f9d176", // Will
}
```
You can also update your Hypixel API Key in the plugin settings.
