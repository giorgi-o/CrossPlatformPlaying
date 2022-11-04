// CPP-PRELOAD START v0.1
// credit for this code goes to retr0!
const electron = require("electron"), electronPath = require.resolve("electron"), path = require('path');

class BrowserWindow extends electron.BrowserWindow {
	constructor(options) {
		let _preload = options.webPreferences.preload;;
		options.webPreferences.preload = path.join(__dirname, "CPP_preload.js");
		const window = new electron.BrowserWindow(options);
		window.webContents._original_preload = _preload;
		return window;
	}
}
const newElectron = Object.assign({}, electron, { BrowserWindow });

delete require.cache[electronPath].exports;
require.cache[electronPath].exports = newElectron;

electron.ipcMain.on("_original_preload", function waitForPreload(e) {
	if (typeof e.sender._original_preload !== "undefined") e.returnValue = e.sender._original_preload;
	else setTimeout(waitForPreload, 50, e);
});
// CPP-PRELOAD END
