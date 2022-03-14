# CrossPlatformPlaying
A [BetterDiscord](https://betterdiscord.app/) plugin that lets you see what your friends are playing even if they turned off game activity, and brings Rich Presence to games that don't support it.

<img src="https://user-images.githubusercontent.com/20621396/147405144-5b87a3f7-0795-4733-9d0f-6d4d5b78fe72.png" alt="illustration"/>


CrossPlatformPlaying is a plugin that lets you see what your friends are playing, as well as any additional information available such as gamemode, score, map, etc.

## Currently supports
- Valorant/League of Legends
- Steam
- Epic Games (Fortnite, Rocket League...)
- EA (Apex, FIFA...)
- Twitch
- Hypixel

## Installation
- Download [CrossPlatformPlaying.plugin.js](https://github.com/giorgi-o/CrossPlatformPlaying/blob/main/CrossPlatformPlaying.plugin.js) and move it to your plugins folder.
- If it asks you to install **Zere's Plugin Library**, click "Download Now" and once it finished installing, restart Discord using `Ctrl+R`.
- Open BetterDiscord's plugin settings menu, enable CrossPlatformPlaying and click on the cog wheel to enable and configure the platforms you want to use.

## Current status
This is my first time writing a BetterDiscord plugin, so any feedback and/or contributions are greatly appreciated, especially if this project is to support more platforms and games that I don't play or have the knowledge of how they work.

Feel free to DM me or ping me in the BetterDiscord server to give feedback or to ask any questions.

**Future improvements:**
- Platform support:
  - Support for Steam Rich Presence _(to show extra info in games that use Steam's RPC such as CS:GO)_
  - Xbox Live _(this is useful as it shows what people are playing on Xbox but also on PC via Game Bar)_
  - Playstation
  - Battle.net/Uplay/Rockstar/GoG
  - Any other platform or game that lets you see what your friends are playing, theoretically
  - Apple Music _(integrate it just like Spotify)_
- The Code
  - Make it modular to easily install/remove platforms
  - Improve the way the plugin injects the custom activities (doesn't currently update the member list)
- See if your invisible friends are online _(the plugin already has the data, I just need to figure out the best way to display online vs invisible vs offline)_
- Create a [Wiki](https://github.com/giorgi-o/CrossPlatformPlaying/wiki) to document how my findings of how each platform works
- Add guides on how to get the tokens/keys/cookies of each platform
- Make the settings panel less ugly

Again, most of this is out of my reach, so any contribution is greatly appreciated.
