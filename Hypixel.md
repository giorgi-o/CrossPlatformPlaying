## How to setup
In order for Hypixel presences to work, you need to provide two things
1. A Hypixel API key
2. The list of Minecraft UUIDs and their respective Discord IDs

## How to get a Hypixel API key
Join Hypixel and type `/api` in the chat.

Your API key should look something like `12345678-9abcd-ef12-3456-789abcdef123`.

## How to get Minecraft UUIDs
Search for their username on [NameMC](https://namemc.com/), and copy their UUID without the dashes.

## Where to put the API Key and the Minecraft UUIDs
Open `CrossPlatformPlaying.config.json` in your favorite text editor and look for the following:
```json
"hypixel": {
    "api_key": "",
    "usersMap": {
    }
},
```
Put your API key between the two quotes, and fill in the `usersMap` like this:
```json
"usersMap": {
    "<discord id>": "<minecraft uuid>"
}
```
Your config file should look something like this:
```json
"hypixel": {
    "api_key": "12345678-9abcd-ef12-3456-789abcdef123",
    "usersMap": {
        "316978243477167759": "b2a90b224315403f9a12a374c94ed176",
        "316243716797875947": "b374c94e02a90b2243154a12a3f9d176",
        "316978275947437165": "b2a12a374c94e03f9a90b2243154d176",
        "316978472437167759": "b2a90b224374c94e03f9d154a12a3176",
        "317167759469782437": "b2243154a12b2a90a374c94e03f9d176"
    }
},
```
Make sure all lines have commas at the end, except for the last one. JSON formatting is quite strict, so you may want to paste your file into a [JSON formatter](https://jsonformatter.curiousconcept.com/) to check for any errors.

You can also edit the Hypixel API Key in the plugin settings.
