# CrossPlatformPlaying
A [BetterDiscord](https://betterdiscord.app/) plugin that brings Rich Presence to games that don't support it, and lets you see what your friends are playing even if they turned off game activity.

<img src="https://user-images.githubusercontent.com/20621396/134491197-54986bfc-9fe9-4a59-8e4d-a9391a792bf4.png" alt="valorant demo" width="250"/>
<img src="https://user-images.githubusercontent.com/20621396/134491995-4141367c-e9ba-47ab-b5e6-735ac1f36abe.png" alt="steam demo" width="250"/>
<img src="https://user-images.githubusercontent.com/20621396/134492653-09bc1e14-2ad5-45cc-9f9d-ceeb15ad8d00.png" alt="hypixel demo" width="250"/>


CrossPlatformPlaying is a plugin that lets you see what your friends are playing, as well as any additional information available such as gamemode, score, map, etc.

## Currently supports
- Valorant/League of Legends
- Steam
- Epic Games (Fortnite, Rocket League...)
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
  - Battle.net/Uplay/Origin
  - Any other platform or game that lets you see what your friends are playing, theoretically
  - Apple Music _(integrate it just like Spotify)_
- The Code
  - Make it modular to easily install/remove platforms
  - Improve the way the plugin injects the custom activities (doesn't currently update the member list)
- See if your invisible friends are online _(the plugin already has the data, I just need to figure out the best way to display online vs invisible vs offline)_
- Add a Wiki of how it works _(how it interacts with each platform)_
- Add guides on how to get the tokens/keys/cookies of each platform
- Make the settings panel less ugly

Again, most of this is out of my reach, so any contribution is greatly appreciated.
