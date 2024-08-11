
// © 2020 - 2024  Simsv Studio

const {app, BrowserWindow, ipcMain, dialog, nativeImage, Tray, Menu} = require("electron");
const {exec} = require("child_process");
const path = require("path");

app.commandLine.appendSwitch("enable-smooth-scrolling");
app.commandLine.appendSwitch("enable-features", "WindowsScrollingPersonality");

// 创建窗口
const SimMusicWindows = {};
const createWindow = () => {
	// 主窗体
	SimMusicWindows.mainWin = new BrowserWindow({
		width: 1000,
		height: 700,
		minWidth: 1000,
		minHeight: 700,
		frame: false,
		resizable: true,
		show: false,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	SimMusicWindows.mainWin.loadURL(path.join(__dirname, "frontend/main.html"));
	SimMusicWindows.mainWin.once("ready-to-show", () => { SimMusicWindows.mainWin.show(); });
	// 歌词窗体
	SimMusicWindows.lrcWin = new BrowserWindow({
		width: 0,
		height: 0,
		frame: false,
		resizable: true,
		show: false,
		showInTaskbar: false,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	SimMusicWindows.lrcWin.loadURL(path.join(__dirname, "frontend/lrc.html"));
	// 桌面窗体
	SimMusicWindows.desktopWin = new BrowserWindow({
		resizable: false,
		show: false,
		transparent: true,
		frame: false,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	SimMusicWindows.desktopWin.loadURL(path.join(__dirname, "frontend/desktop.html"));
}
app.whenReady().then(() => {
	createWindow();
	if (!app.requestSingleInstanceLock()) {
		app.quit();
		return;
	}
	app.on('second-instance', () => {
		SimMusicWindows.mainWin.show();
		if (SimMusicWindows.mainWin.isMinimized()) {SimMusicWindows.mainWin.restore();}
		SimMusicWindows.mainWin.focus();
	});
	const tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "frontend/assets/icon-blue.png")));
	const menu = Menu.buildFromTemplate([
		{ label: "显示", type: "normal", click: () => {
			SimMusicWindows.mainWin.show();
			if (SimMusicWindows.mainWin.isMinimized()) {SimMusicWindows.mainWin.restore();}
		}},
		{ label: "退出", type: "normal", click: app.quit},
	]);
	tray.setContextMenu(menu);
});


// 处理窗口事件
let desktopShowing = false;
let lyricsShowing = false;
ipcMain.handle("winOps", (_event, args) => {
	return SimMusicWindows[args[0]][args[1]]();
});
ipcMain.handle("toggleDesktop", () => {
	if (desktopShowing) {
		SimMusicWindows.desktopWin.hide();
		desktopShowing = false;
	} else {
		SimMusicWindows.desktopWin.show();
		SimMusicWindows.desktopWin.maximize();
		SimMusicWindows.desktopWin.setIgnoreMouseEvents(true);
		exec(".\\nativeApi\\embedWindow.exe");
		setTimeout(() => {exec(".\\nativeApi\\embedWindow.exe");}, 100);
		SimMusicWindows.desktopWin.setSkipTaskbar(true);
		desktopShowing = true;
	}
	return desktopShowing;
});
ipcMain.handle("toggleLyrics", () => {
	if (lyricsShowing) {
		SimMusicWindows.lrcWin.hide();
		lyricsShowing = false;
	} else {
		SimMusicWindows.lrcWin.show();
		SimMusicWindows.lrcWin.setContentProtection(true);
		SimMusicWindows.lrcWin.setSkipTaskbar(true);
		SimMusicWindows.lrcWin.setAlwaysOnTop(true);
		lyricsShowing = true;
	}
	return lyricsShowing;
});
ipcMain.handle("quitApp", () => {
	app.quit();
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
}
ipcMain.handle("musicPlay", () => { createTaskbarButtons(true); });
ipcMain.handle("musicPause", () => { createTaskbarButtons(false); });


// 歌词更新
ipcMain.handle("lrcUpdate", (_event, time, lrc) => {
	SimMusicWindows.lrcWin.webContents.send("lrcUpdate", lrc);
	SimMusicWindows.desktopWin.webContents.send("lrcUpdate", time);
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