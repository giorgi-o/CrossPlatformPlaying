## How to setup
In order for Steam presences to work, you need to provide two things
1. A Steam API key
2. The list of Steam users and their respective Discord IDs

## How to get a Steam API key
Just go [here](https://steamcommunity.com/dev/apikey). You will need to login to your Steam account.

Your API key should look something like `123456789ABCDEF123456789ABCDEF12`.

## How to get Steam IDs
Use [steamidfinder.com](https://www.steamidfinder.com/). You need to get the `steamID64 (Dec)` ID of each of the friends you want to see the presence of on Discord.

## Where to put the API Key and the Steam IDs
Open `CrossPlatformPlaying.config.json` in your favorite text editor and look for the following:
```json
"steam": {
    "api_key": "",
    "usersMap": {
    }
},
```
Put your API between the two quotes, and fill in the `usersMap` like this:
```json
"usersMap": {
    "<discord id>": ["<steam id>"]
}
```
You can also put multiple Steam IDs between the square brackets.

Your config file should look something like this:
```json
"steam": {
    "api_key": "123456789ABCDEF123456789ABCDEF12",
    "usersMap": {
        "316978243716775947": ["76561194458255096"],
        "316937167824775948": ["76561501982554445"],
        "316371978246775949": ["76525544611985060", "76528506055446119"],
        "316978243757167940": ["76565445119825061"],
        "316978677594243711": ["76561255445061198"]
    }
},
```
Make sure all lines have commas at the end, except for the last one. JSON formatting is quite strict, so you may want to paste your file into a [JSON formatter](https://jsonformatter.curiousconcept.com/) to check for any errors.

You can also edit the Steam API Key in the plugin settings.
