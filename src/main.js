
// © 2020 - 2024  Simsv Studio

const {app, BrowserWindow, ipcMain, dialog, nativeImage, Tray, Menu, screen, session, webContents, desktopCapturer} = require("electron");
const {exec} = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

app.commandLine.appendSwitch("enable-smooth-scrolling");
app.commandLine.appendSwitch("enable-features", "WindowsScrollingPersonality,FluentScrollbar,ParallelDownloading");

// 创建窗口
const SimMusicWindows = {};
let isMainWinLoaded;
let pendingOpenFile = [];
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
		show: false,
		backgroundColor: "#1E9FFF",
		title: "SimMusic",
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "rgba(0,0,0,0)",
			symbolColor: "white",
			height: 35,
		},
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	SimMusicWindows.mainWin.loadURL(path.join(__dirname, "frontend/main.html"));
	setTimeout(() => {SimMusicWindows.mainWin.show();}, 50);
	SimMusicWindows.mainWin.on("close", e => {
		e.preventDefault();
		SimMusicWindows.mainWin.webContents.executeJavaScript("WindowOps.close()", true);
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
		backgroundThrottling: false,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	SimMusicWindows.lrcWin.loadURL(path.join(__dirname, "frontend/lrc.html"));
	SimMusicWindows.lrcWin.maximize();
}
app.whenReady().then(() => {
	tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "frontend/assets/icon-blue.png")));
	tray.on("click", () => { showMainWin(); });
	tray.setToolTip("SimMusic");
	createWindow();
	if (!app.requestSingleInstanceLock()) {
		app.exit();
		return;
	}
	const initOpenFile = process.argv[process.argv.length - 1];
	if (process.argv.length != 1 && initOpenFile && fs.existsSync(initOpenFile)) pendingOpenFile.push(initOpenFile);
	app.on("second-instance", (_event, argv) => {
		const openFile = argv[argv.length - 1];
		if (openFile && fs.existsSync(openFile)) {
			if (!isMainWinLoaded) pendingOpenFile.push(openFile);
			else {
				showMainWin();
				SimMusicWindows.mainWin.webContents.send("fileLaunch", openFile);
			}
		} else {
			showMainWin();
		}
	});
	session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
		desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
			callback({ video: sources[0], audio: "loopback" })
		});
	});
});
ipcMain.handle("mainWinLoaded", () => {
	if (isMainWinLoaded) return [];
	isMainWinLoaded = true;
	setTimeout(() => {
		SimMusicWindows.mainWin.setTitleBarOverlay({color: "rgba(255,255,255,0)", symbolColor: "black", height: 35});
	}, 500);
	return pendingOpenFile;
});
ipcMain.handle("overlayBlack", () => {
	SimMusicWindows.mainWin.setTitleBarOverlay({color: "rgba(255,255,255,0)", symbolColor: "black", height: 35});
});
ipcMain.handle("overlayWhite", () => {
	SimMusicWindows.mainWin.setTitleBarOverlay({color: "rgba(0,0,0,0)", symbolColor: "rgba(255,255,255,.8)", height: 35});
});


// 处理窗口事件
ipcMain.handle("winOps", (_event, args) => {
	return SimMusicWindows[args[0]][args[1]]();
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
		maximizable: false,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false, devTools: false }
	});
	dialogWindow.loadURL(path.join(__dirname, `frontend/assets/components/dialog.html?type=${type}&txt=${encodeURIComponent(txt)}&parent=${parent}&dialogId=${dialogId}`));
	dialogWindow.once("ready-to-show", () => { dialogWindow.show(); });
});
ipcMain.handle("dialogSubmit", async (_event, parent, dialogId, txt) => {
	if (dialogId.startsWith("wv")) {
		try {
			const cookies = await session.fromPartition("dialog-" + dialogId).cookies.get({});
			const json = JSON.stringify({
				cookies: cookies,
				url: txt,
			});
			SimMusicWindows[parent].webContents.send("dialogSubmit", dialogId, json);
		} catch {
			SimMusicWindows[parent].webContents.send("dialogSubmit", dialogId, "{}");
		}
	} else {
		SimMusicWindows[parent].webContents.send("dialogSubmit", dialogId, txt);
	}
});
ipcMain.handle("dialogCancel", (_event, parent) => {
	SimMusicWindows[parent].webContents.send("dialogCancel");
});
ipcMain.handle("webview", (_event, url, parent, dialogId, width, height, showFinishBtn) => {
	const dialogWindow = new BrowserWindow({
		parent: SimMusicWindows[parent], 
		modal: true,
		width: width ?? 600,
		height: height ?? 500,
		minWidth: 600,
		minHeight: 500,
		frame: false,
		resizable: true,
		show: false,
		maximizable: true,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false, webviewTag: true, devTools: false }
	});
	dialogWindow.loadURL(path.join(__dirname, `frontend/assets/components/webview.html?url=${encodeURIComponent(url)}&showFinishBtn=${showFinishBtn}&parent=${parent}&dialogId=${dialogId}`));
	dialogWindow.center();
	dialogWindow.once("ready-to-show", () => { dialogWindow.show(); });
});
ipcMain.handle("webviewDialogLoaded", (_event, wcId) => {
	const wc = webContents.fromId(wcId);
	wc.setWindowOpenHandler(({ url }) => {
		wc.loadURL(url);
		return { action: "deny" }
	});
});
ipcMain.handle("modal", (_event, url, height, parent) => {
	const dialogWindow = new BrowserWindow({
		parent: SimMusicWindows[parent], 
		modal: true,
		width: 500,
		height: height,
		frame: false,
		resizable: false,
		show: false,
		maximizable: false,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false, devTools: false }
	});
	dialogWindow.loadURL(path.join(__dirname, "frontend/assets/components/", url));
	dialogWindow.once("ready-to-show", () => { dialogWindow.show(); });
});


// 任务栏控件
const createTaskbarButtons = (isPlay) => {
	SimMusicWindows.mainWin.setThumbarButtons([
		{
			tooltip: "上一首",
			icon: nativeImage.createFromPath(path.join(__dirname, "frontend/assets/misc/taskbar-prev.png")),
			click () {SimMusicWindows.mainWin.webContents.executeJavaScript("SimAPControls.prev(true)", true);}
		}, {
			tooltip: isPlay ? "暂停" : "播放",
			icon: nativeImage.createFromPath(path.join(__dirname, isPlay ? "frontend/assets/misc/taskbar-pause.png" : "frontend/assets/misc/taskbar-play.png")),
			click () {SimMusicWindows.mainWin.webContents.executeJavaScript("SimAPControls.togglePlay(true)", true);}
		}, {
			tooltip: "下一首",
			icon: nativeImage.createFromPath(path.join(__dirname, "frontend/assets/misc/taskbar-next.png")),
			click () {SimMusicWindows.mainWin.webContents.executeJavaScript("SimAPControls.next(true)", true);}
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
let lyricsShowing = false;
ipcMain.handle("toggleLyrics", (_event, isShow) => {
	if (isShow || isShow === false) {lyricsShowing = !isShow;}
	if (lyricsShowing) {
		SimMusicWindows.lrcWin.webContents.send("setHidden", "text", true);
		setTimeout(() => {SimMusicWindows.lrcWin.hide();}, 100);
		lyricsShowing = false;
	} else {
		SimMusicWindows.lrcWin.show();
		SimMusicWindows.lrcWin.setIgnoreMouseEvents("true", {forward: true});
		SimMusicWindows.lrcWin.setSkipTaskbar(true);
		SimMusicWindows.lrcWin.setAlwaysOnTop(false);
		SimMusicWindows.lrcWin.setAlwaysOnTop(true);
		lyricsShowing = true;
		setTimeout(() => {SimMusicWindows.lrcWin.webContents.send("setHidden", "text", false);}, 400);
	}
	return lyricsShowing;
});
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



// 迷你模式
let isMiniMode = false;
ipcMain.handle("toggleMini", () => {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	SimMusicWindows.mainWin.setOpacity(0);
	if (isMiniMode) {
		setTimeout(() => {
			SimMusicWindows.mainWin.setMinimumSize(1000, 700);
			SimMusicWindows.mainWin.setSize(1000, 700);
			SimMusicWindows.mainWin.setPosition(parseInt(width / 2 - 500), parseInt(height / 2 - 350));
			SimMusicWindows.mainWin.setResizable(true);
			SimMusicWindows.mainWin.setHasShadow(true);
			SimMusicWindows.mainWin.setAlwaysOnTop(false);
			SimMusicWindows.mainWin.setSkipTaskbar(false);
			SimMusicWindows.mainWin.setOpacity(1);
			SimMusicWindows.mainWin.setMinimizable(true);
			SimMusicWindows.mainWin.setClosable(true);
			SimMusicWindows.mainWin.setTitleBarOverlay({color: "rgba(255,255,255,0)", symbolColor: "black", height: 35});
		}, 50);
		return isMiniMode = false;
	} else {
		setTimeout(() => {
			SimMusicWindows.mainWin.unmaximize();
			SimMusicWindows.mainWin.setMinimumSize(340, 60);
			SimMusicWindows.mainWin.setSize(340, 60);
			SimMusicWindows.mainWin.setResizable(false);
			SimMusicWindows.mainWin.setHasShadow(false);
			SimMusicWindows.mainWin.setAlwaysOnTop(true);
			SimMusicWindows.mainWin.setSkipTaskbar(true);
			SimMusicWindows.mainWin.setPosition(width - 360, height - 90);
			SimMusicWindows.mainWin.setOpacity(.98);
			SimMusicWindows.mainWin.setMinimizable(false);
			SimMusicWindows.mainWin.setClosable(false);
			SimMusicWindows.mainWin.setTitleBarOverlay({color: "rgba(0,0,0,0)", symbolColor: "rgba(255,255,255,0)", height: 10});
		}, 50);
		return isMiniMode = true;
	}
});




// 文件格式关联
const fileRegAppId = "com.simsv.music";
const fileRegFileExt = [".mp3", ".flac", ".wav"];
const appPath = process.execPath;
const batchPath = path.join(os.tmpdir(), "sim-music-operations.bat");
const requestAdminCmd = `
@echo off
net session >nul 2>&1
if %errorLevel% neq 0 (
	powershell.exe -Command "Start-Process '%~0' -Verb RunAs"
	exit /B
)
`;
function registerFileExt(isReg) {
    let commands = requestAdminCmd;
	if (isReg) {
		commands += `REG ADD "HKEY_CLASSES_ROOT\\${fileRegAppId}\\shell\\open\\command" /ve /d "\\"${appPath}\\" \\"%%1\\"" /f\n`;
		commands += `REG ADD "HKEY_CLASSES_ROOT\\${fileRegAppId}\\DefaultIcon" /ve /d "\\"${path.dirname(appPath)}\\resources\\file-icon.ico\\",0" /f\n`;
		fileRegFileExt.forEach(ext => {
			commands += `REG ADD "HKEY_CLASSES_ROOT\\${ext}" /ve /d "${fileRegAppId}" /f\n`;
		});
	} else {
		commands += `REG DELETE "HKEY_CLASSES_ROOT\\${fileRegAppId}\\shell\\open\\command" /ve /f\n`;
	}
    fs.writeFileSync(batchPath, commands, { encoding: "utf-8" });
	try { exec(`cmd.exe /c "${batchPath}"`); } catch {}
}
ipcMain.handle("regFileExt", (_event, isReg) => {
	return registerFileExt(isReg);
});




// 本体更新
ipcMain.handle("appUpdate", () => {
    let commands = `
${requestAdminCmd}
title SimMusic Updater
echo Updating SimMusic, Please wait ...
echo The updating process will be finished in a few seconds.
timeout /t 2 /nobreak
taskkill /im sim-music.exe
taskkill /im sim-music-dev.exe
timeout /t 2 /nobreak
move /Y "${path.join(os.tmpdir(), "sim-music-update.simtemp")}" "${path.dirname(appPath)}\\resources\\app.asar"
timeout /t 2 /nobreak
start "" "${appPath}"`;
	fs.writeFileSync(batchPath, commands, { encoding: "utf-8" });
	try { exec(`cmd.exe /c "${batchPath}"`); } catch {}
	setTimeout(() => {app.exit();}, 1000);
});



// 主窗口其他调用
ipcMain.handle("pickFolder", () => {
	return dialog.showOpenDialogSync(SimMusicWindows.mainWin, {
		title: "选择目录 - SimMusic",
		defaultPath: "C:\\",
		buttonLabel: "使用此目录",
		properties: ["openDirectory"],
	});
});
ipcMain.handle("shutdownCountdown", () => {
	const countdown = new BrowserWindow({
		frame: false,
		resizable: false,
		kiosk: true,
		transparent: true,
		alwaysOnTop: true,
		skipTaskbar: true,
		parent: SimMusicWindows.mainWin, 
		modal: true,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	countdown.loadURL(path.join(__dirname, "frontend/assets/components/shutdown.html"));
});
ipcMain.handle("cmd", (_event, cmd) => {
	exec(cmd);
});
ipcMain.handle("mainWinExec", (_event, js) => {
	SimMusicWindows.mainWin.webContents.executeJavaScript(js);
});
ipcMain.handle("openDevtools", () => {
	SimMusicWindows.mainWin.webContents.openDevTools();
	// 傻逼谷歌搞个宋体当默认代码字体 怎么想的 给你眼珠子扣下来踩两脚
	SimMusicWindows.mainWin.webContents.once("devtools-opened", () => {
		const css = `
			:root {
				--sys-color-base: var(--ref-palette-neutral100);
				--source-code-font-family: consolas;
				--source-code-font-size: 12px;
				--monospace-font-family: consolas;
				--monospace-font-size: 12px;
				--default-font-family: system-ui, sans-serif;
				--default-font-size: 12px;
			}
			.-theme-with-dark-background {
				--sys-color-base: var(--ref-palette-secondary25);
			}
			body {
				--default-font-family: system-ui,sans-serif;
			}`;
		SimMusicWindows.mainWin.webContents.devToolsWebContents.executeJavaScript(`
			const overriddenStyle = document.createElement('style');
			overriddenStyle.innerHTML = '${css.replaceAll('\n', ' ')}';
			document.body.append(overriddenStyle);
			document.body.classList.remove('platform-windows');`);
	});
});



