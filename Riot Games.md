# How to setup
In order for Riot presences to work, you need to provide two things
1. Your `auth.riotgames.com` cookies
2. The list of Riot XMPP JIDs and their respective Discord IDs

## How to get your riot cookies
Your cookies can be used by anyone to log into your riot account, be careful what you do with them.

You'll need to be logged into your Riot Games account on your browser of choice (although I'll use Chrome screenshots here).

1. Open a new tab and press `F12` (or `Ctrl+Shift+I`) to open the devtools, and head to the `Network` tab on the top right.
2. With the Network tab open, open the following link on that tab: `https://auth.riotgames.com/`
3. A new network request should appear called `auth.riotgames.com` in the Network tab, click on it.

<img src="https://user-images.githubusercontent.com/20621396/134549149-058975d4-5680-42ff-b282-fe6c0f349c5c.png" alt="valorant demo" width="500"/>

4. In the new window that appeared, scroll all the way down to the paragraph called `Request Headers` and look for the `cookie` header.

<img src="https://user-images.githubusercontent.com/20621396/134550706-76d1b5a0-ed45-454f-9f4c-e0740a4c6a27.png" alt="valorant demo" width="800"/>

Thoses are your cookies, you'll need them for later.

# How to get Riot JIDs

There are two ways of getting the JIDs of your friends: the easy way or the DIY way.

## The Easy Way

1. Download and install [Node.JS](https://nodejs.org/)
2. Download [riotGetAndFilterJIDs.js](https://github.com/giorgi-o/CrossPlatformPlaying/blob/main/riotGetAndFilterJIDs.js)
3. Right click > edit it to add your cookies on line 5, between the two quotes
4. Run it using Node.JS

## The DIY Way

1. Open `CrossPlatformPlaying.plugin.js` in your text editor of choice
2. Go to line 402
3. Remove the two slashes at the beginning to uncomment the line
```xml
"<iq id=\"_xmpp_session1\" type=\"set\"><sessi...
//"<iq type=\"get\" id=\"2\"><query xmlns=\"ja... <-- remove the first two slashes
"<presence id=\"presence_6\"><show>offline</sh...
```
4. Save the file
5. In Discord, press `Ctrl+Shift+I` and go to the Console tab

You should see the XMPP communications between your Discord and Riot's servers. They look something like this:

<img src="https://user-images.githubusercontent.com/20621396/134750719-98b32b2c-2db8-42d6-8f10-6d03aa0d4b37.png" alt="valorant demo" width="800"/>

If you uncommented line 402, you should then see a huge log containing all your friends names. Paste that into an [XML Formatter](https://jsonformatter.org/xml-formatter) to make it easier to read.

# Where to put the cookies and JIDs

Open `CrossPlatformPlaying.config.json` and look for the following:
```json
"riot": {
    "cookies": "",
    "usersMap": {
    }
},
```
Put your cookies between the two quotes, and fill in the `usersMap` like this:
```json
"usersMap": {
    "<discord id>": ["<riot jid>"]
}
```
You can also put multiple JIDs per discord user between the square brackets (if they have multiple accounts).

Your config file should look something like this:
```json
"riot": {
    "cookies": "did=abcdefghijklmnopqrstuvwxyz123456; osano_consentmanager=789abcdefghijklmnopqrstuvwxyz123456...",
    "usersMap": {
        "316978243716775947": ["12345678-9abcd-ef12-3456-789abcdef123"],
        "316937167824775948": ["12345678-9abcd-ef12-0123-789abcdef123"],
        "316371978246775949": ["12345678-9abcd-ef12-7895-789abcdef123", "12345678-9abcd-ef12-3456-789abcdef123"],
        "316978243757167940": ["12345678-9abcd-ef12-3698-789abcdef123"],
        "316978677594243711": ["12345678-9abcd-ef12-7412-789abcdef123"]
    }
},
```
Make sure all lines have commas at the end, except for the last one. JSON formatting is quite strict, so you may want to paste your file into a [JSON formatter](https://jsonformatter.curiousconcept.com/) to check for any errors.
