const DialogData = {};
let DialogShowing = false;

function alert(txt, callback) {
	if (DialogShowing) return;
	DialogShowing = true;
	const dialogId = new Date().getTime() + Math.random();
	DialogData[dialogId] = callback;
	ipcRenderer.invoke("dialog", "alert", txt, document.documentElement.dataset.windowId, dialogId);
}
function prompt(txt, callback) {
	if (DialogShowing) return;
	DialogShowing = true;
	const dialogId = new Date().getTime() + Math.random();
	DialogData[dialogId] = callback;
	ipcRenderer.invoke("dialog", "prompt", txt, document.documentElement.dataset.windowId, dialogId);
}
function confirm(txt, callback) {
	if (DialogShowing) return;
	DialogShowing = true;
	const dialogId = new Date().getTime() + Math.random();
	DialogData[dialogId] = callback;
	ipcRenderer.invoke("dialog", "confirm", txt, document.documentElement.dataset.windowId, dialogId);
}
function webview(url, options = {}, callback) {
	if (DialogShowing) return;
	DialogShowing = true;
	const dialogId = "wv" + new Date().getTime() + Math.random();
	DialogData[dialogId] = callback;
	ipcRenderer.invoke("webview", url, document.documentElement.dataset.windowId, dialogId, options.width, options.height, !!callback);
}
function modalWindow(url, height) {
	ipcRenderer.invoke("modal", url, height, document.documentElement.dataset.windowId);
}

ipcRenderer.on("dialogSubmit", (_event, dialogId, txt) => {
	DialogShowing = false;
	if (DialogData[dialogId]) DialogData[dialogId](dialogId.startsWith("wv") ? JSON.parse(txt) : txt);
});
ipcRenderer.on("dialogCancel", () => {
	DialogShowing = false;
});

