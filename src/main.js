
// © 2020 - 2024  Simsv Studio

const {app, BrowserWindow, ipcMain, dialog, nativeImage, Tray, Menu} = require("electron");
const {exec} = require("child_process");
const path = require("path");

app.commandLine.appendSwitch("enable-smooth-scrolling");
app.commandLine.appendSwitch("enable-features", "WindowsScrollingPersonality");

// 创建窗口
const SimMusicWindows = {};
let tray;
function showMainWin() {
	SimMusicWindows.mainWin.show();
	if (SimMusicWindows.mainWin.isMinimized()) {SimMusicWindows.mainWin.restore();}
	SimMusicWindows.mainWin.focus();
}
const createWindow = () => {
	// 主窗体
	SimMusicWindows.mainWin = new BrowserWindow({
		width: 1000,
		height: 700,
		minWidth: 1000,
		minHeight: 700,
		frame: false,
		resizable: true,
		backgroundColor: "#1E9FFF",
		title: "SimMusic",
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	SimMusicWindows.mainWin.loadURL(path.join(__dirname, "frontend/main.html"));
	SimMusicWindows.mainWin.on("close", e => {
		e.preventDefault();
		SimMusicWindows.mainWin.hide();
	});
	// 歌词窗体
	SimMusicWindows.lrcWin = new BrowserWindow({
		width: 0,
		height: 0,
		frame: false,
		resizable: false,
		show: false,
		transparent: true,
		focusable: false,
		alwaysOnTop: true,
		backgroundThrottling: true,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	SimMusicWindows.lrcWin.loadURL(path.join(__dirname, "frontend/lrc.html"));
	SimMusicWindows.lrcWin.setFullScreen(true);
}
app.whenReady().then(() => {
	tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "frontend/assets/icon-blue.png")));
	tray.on("click", () => { showMainWin(); });
	createWindow();
	if (!app.requestSingleInstanceLock()) {
		app.exit();
		return;
	}
	app.on("second-instance", () => {
		showMainWin();
	});
});


// 处理窗口事件
let lyricsShowing = false;
let lyricsInterval;   // 就这么写了有时候还是不生效 估计是elec的bug 暂时修不好=(
ipcMain.handle("winOps", (_event, args) => {
	return SimMusicWindows[args[0]][args[1]]();
});
ipcMain.handle("toggleLyrics", (_event, isShow) => {
	if (isShow || isShow === false) {lyricsShowing = !isShow;}
	if (lyricsShowing) {
		SimMusicWindows.lrcWin.webContents.send("setHidden", "text", true);
		setTimeout(() => {SimMusicWindows.lrcWin.hide();}, 100);
		lyricsShowing = false;
		clearInterval(lyricsInterval);
	} else {
		SimMusicWindows.lrcWin.show();
		SimMusicWindows.lrcWin.setIgnoreMouseEvents("true", {forward: true});
		SimMusicWindows.lrcWin.setSkipTaskbar(true);
		SimMusicWindows.lrcWin.setAlwaysOnTop(false);
		SimMusicWindows.lrcWin.setAlwaysOnTop(true);
		lyricsShowing = true;
		setTimeout(() => {SimMusicWindows.lrcWin.webContents.send("setHidden", "text", false);}, 400);
		lyricsInterval = setInterval(() => {if (SimMusicWindows.lrcWi) SimMusicWindows.lrcWin.setAlwaysOnTop(true);}, 100);
	}
	return lyricsShowing;
});
ipcMain.handle("restart", () => {
	app.exit();
	app.relaunch();
});
ipcMain.handle("quitApp", () => {
	app.exit();
});


// 对话框
ipcMain.handle("dialog", (_event, type, txt, parent, dialogId) => {
	const dialogWindow = new BrowserWindow({
		parent: SimMusicWindows[parent], 
		modal: true,
		width: 500,
		height: 200,
		frame: false,
		resizable: false,
		show: false,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	dialogWindow.loadURL(path.join(__dirname, `frontend/assets/components/dialog.html?type=${type}&txt=${encodeURIComponent(txt)}&parent=${parent}&dialogId=${dialogId}`));
	dialogWindow.once("ready-to-show", () => { dialogWindow.show(); });
});
ipcMain.handle("dialogSubmit", (_event, parent, dialogId, txt) => {
	SimMusicWindows[parent].webContents.send("dialogSubmit", dialogId, txt);
});
ipcMain.handle("dialogCancel", (_event, parent) => {
	SimMusicWindows[parent].webContents.send("dialogCancel");
});


// 任务栏控件
const createTaskbarButtons = (isPlay) => {
	SimMusicWindows.mainWin.setThumbarButtons([
		{
			tooltip: "上一首",
			icon: nativeImage.createFromPath(path.join(__dirname, "frontend/assets/misc/taskbar-prev.png")),
			click () {SimMusicWindows.mainWin.webContents.executeJavaScript("SimAPControls.prev()", true);}
		}, {
			tooltip: isPlay ? "暂停" : "播放",
			icon: nativeImage.createFromPath(path.join(__dirname, isPlay ? "frontend/assets/misc/taskbar-pause.png" : "frontend/assets/misc/taskbar-play.png")),
			click () {SimMusicWindows.mainWin.webContents.executeJavaScript("SimAPControls.togglePlay()", true);}
		}, {
			tooltip: "下一首",
			icon: nativeImage.createFromPath(path.join(__dirname, "frontend/assets/misc/taskbar-next.png")),
			click () {SimMusicWindows.mainWin.webContents.executeJavaScript("SimAPControls.next()", true);}
		}
	]);
	const menu = Menu.buildFromTemplate([
		{ label: "SimMusic", type: "normal", enabled: false},
		{ type: "separator" },
		{ label: "显示主窗口", type: "normal", click() { showMainWin(); }},
		{ label: isPlay ? "暂停" : "播放", type: "normal", click () {SimMusicWindows.mainWin.webContents.executeJavaScript("SimAPControls.togglePlay()", true);}},
		{ type: "separator" },
		{ label: "退出应用", type: "normal", click: app.exit},
	]);
	tray.setContextMenu(menu);
}
ipcMain.handle("musicPlay", () => {
	if (lyricsShowing) SimMusicWindows.lrcWin.webContents.send("setHidden", "inside", false);
	createTaskbarButtons(true);
});
ipcMain.handle("musicPause", () => {
	SimMusicWindows.lrcWin.webContents.send("setHidden", "inside", true);
	createTaskbarButtons(false);
});



// 桌面歌词
ipcMain.handle("lrcUpdate", (_event, lrc) => {
	SimMusicWindows.lrcWin.webContents.send("lrcUpdate", lrc);
});
ipcMain.handle("focusDesktopLyrics", () => {
	SimMusicWindows.lrcWin.setIgnoreMouseEvents(false);
});
ipcMain.handle("unfocusDesktopLyrics", () => {
	SimMusicWindows.lrcWin.setIgnoreMouseEvents(true, {forward: true});
});
ipcMain.handle("updateDesktopLyricsConfig", (_event, isProtected) => {
	SimMusicWindows.lrcWin.webContents.send("lrcWinReload");
	SimMusicWindows.lrcWin.setContentProtection(isProtected);
});


// 主窗口调用
ipcMain.handle("pickFolder", () => {
	return dialog.showOpenDialogSync(SimMusicWindows.mainWin, {
		title: "导入目录",
		defaultPath: "C:\\",
		buttonLabel: "导入",
		properties: ["openDirectory"],
	});
});
ipcMain.handle("openDevtools", () => {
	SimMusicWindows.mainWin.webContents.openDevTools();
	SimMusicWindows.lrcWin.webContents.openDevTools();
});