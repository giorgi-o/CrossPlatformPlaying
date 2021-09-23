## How to setup
In order for Riot presences to work, you need to provide two things
1. Your `auth.riotgames.com` cookies
2. The list of Riot XMPP JIDs and their respective Discord IDs

## How to get your riot cookies
Your cookies can be used by anyone to log into your riot account, be careful what you do with them.

You're going to have to be logged into your Riot Games account on your browser of choice (although I'll use Chrome screenshots here).

1. Open a new tab and press `F12` (or `Ctrl+Shift+I`) to open the devtools, and head to the `Network` tab on the top right.
2. With the Network tab open, go to the following link on that tab: `https://auth.riotgames.com/`
3. A new network request should appear called `auth.riotgames.com` in the Network tab, click on it.

<img src="https://user-images.githubusercontent.com/20621396/134549149-058975d4-5680-42ff-b282-fe6c0f349c5c.png" alt="valorant demo" width="500"/>

4. In the new window that appeared, scroll all the way down to the paragraph called `Request Headers` and look for the `cookie` header.

<img src="https://user-images.githubusercontent.com/20621396/134550706-76d1b5a0-ed45-454f-9f4c-e0740a4c6a27.png" alt="valorant demo" width="800"/>

Thoses are your cookies.  

Open `CrossPlatformPlaying.plugin.js` in your text editor of choice and look for the following towards the top of the file:
```js
// riot
const riotCookies = ""; // <- insert cookies here
const riotDiscordToJid = {
    // "discord id": ["riot jid", "other riot jid", ...]
    "316978243716775947": ["1c98a66c-621b-56fc-aff0-4f6d5404af45"], // example
}
```
Paste the cookies between the two quotes.

## How to get Riot JIDs

TODO
