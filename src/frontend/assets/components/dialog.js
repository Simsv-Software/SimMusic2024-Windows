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

ipcRenderer.on("dialogSubmit", (_event, dialogId, txt) => {
	DialogShowing = false;
	if (DialogData[dialogId]) DialogData[dialogId](txt);
});
ipcRenderer.on("dialogCancel", () => {
	DialogShowing = false;
});

