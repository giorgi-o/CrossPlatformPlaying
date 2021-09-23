# CrossPlatformPlaying
A plugin that brings Rich Presence to games that don't support it, and lets you see what your friends are playing even if they turned off game activity.

<img src="https://user-images.githubusercontent.com/20621396/134491197-54986bfc-9fe9-4a59-8e4d-a9391a792bf4.png" alt="valorant demo" width="250"/>
<img src="https://user-images.githubusercontent.com/20621396/134491995-4141367c-e9ba-47ab-b5e6-735ac1f36abe.png" alt="valorant demo" width="250"/>
<img src="https://user-images.githubusercontent.com/20621396/134492653-09bc1e14-2ad5-45cc-9f9d-ceeb15ad8d00.png" alt="valorant demo" width="250"/>


CrossPlatformPlaying is a plugin that lets you see what your friends are playing, as well as any additional information available such as gamemode, score, map, etc.

## Currently supports
- Valorant/League of Legends/Wild Rift
- Steam
- Hypixel

## Installation
- Download `CrossPlatformPlaying.plugin.js` but don't move it to the plugins folder yet.
- Open it in your favorite text editor
- Do the appropriate setup for the platform(s) you want to use

## Current status
This is my first time writing a BetterDiscord plugin, as well as my first open-source project. Any feedback and/or contributions greatly appreciated, especially if this project is to support more platforms and games that I don't play or have the knowledge of how they work.

**Future improvements:**
- Platform support:
  - Epic Games _(currently working on it)_
  - Xbox Live _(this is useful as it shows what people are playing on Xbox but also on PC via Game Bar)_
  - Support for Steam Rich Presence _(to show extra info in games that use Steam's RPC such as CS:GO)_
  - Implement the rest of Riot Games (TFT, Runeterra)
  - Rocket League
  - Playstation
  - Battle.net
  - Any other game that lets you see what your friends are playing, theoretically
- Improve the settings panel
  - Enable toggling individual platforms on/off
  - Make inputting API keys and tokens easier
  - Add user-friendly interface to easily link discord users to in-game IDs
- The Code
  - Make it modular to easily install/remove platforms
  - Improve the way the plugin injects the custom activities (doesn't currently update the member list)

Again, most of this is out of my reach, so any contribution is greatly appreciated.
