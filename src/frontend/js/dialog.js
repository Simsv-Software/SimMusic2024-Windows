const dialogData = {};
let dialogShowing = false;

function alert(txt, callback) {
	if (dialogShowing) {
		return;
	}

	dialogShowing = true;
	const dialogId = new Date().getTime() + Math.random();
	dialogData[dialogId] = callback;
	ipcRenderer.invoke("dialog", "alert", txt, document.documentElement.dataset.windowId, dialogId);
}

function prompt(txt, callback) {
	if (dialogShowing) {
		return;
	}

	dialogShowing = true;
	const dialogId = new Date().getTime() + Math.random();
	dialogData[dialogId] = callback;
	ipcRenderer.invoke("dialog", "prompt", txt, document.documentElement.dataset.windowId, dialogId);
}

function confirm(txt, callback) {
	if (dialogShowing) {
		return;
	}

	dialogShowing = true;
	const dialogId = new Date().getTime() + Math.random();
	dialogData[dialogId] = callback;
	ipcRenderer.invoke("dialog", "confirm", txt, document.documentElement.dataset.windowId, dialogId);
}

function webview(url, options = {}, callback) {
	if (dialogShowing) {
		return;
	}

	dialogShowing = true;
	const dialogId = "wv" + new Date().getTime() + Math.random();
	dialogData[dialogId] = callback;
	ipcRenderer.invoke("webview", url, document.documentElement.dataset.windowId, dialogId, options.width, options.height, !!callback);
}

function modalWindow(url, height) {
	ipcRenderer.invoke("modal", url, height, document.documentElement.dataset.windowId);
}

ipcRenderer.on("dialogSubmit", (_event, dialogId, txt) => {
	dialogShowing = false;
	if (dialogData[dialogId]) dialogData[dialogId](dialogId.startsWith("wv") ? JSON.parse(txt) : txt);
});

ipcRenderer.on("dialogCancel", () => {
	dialogShowing = false;
});

