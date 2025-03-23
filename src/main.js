// © 2020 - 2025 Simsv Studio

const { app, BrowserWindow, ipcMain, dialog, nativeImage, Tray, Menu, screen, session, webContents, desktopCapturer } = require("electron");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

app.commandLine.appendSwitch("enable-smooth-scrolling");
app.commandLine.appendSwitch("enable-features", "WindowsScrollingPersonality,FluentScrollbar,ParallelDownloading");

const SimMusicWindows = {};
let mainWin, lrcWin;
let isMainWinLoaded;
let pendingOpenFile = [];
let tray;

function showMainWin() {
	mainWin.show();

	if (mainWin.isMinimized()) {
		mainWin.restore();
	}

	mainWin.focus();
}

// 创建窗口
const createWindow = () => {
	// 主窗体
	SimMusicWindows.mainWin = mainWin = new BrowserWindow({
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

	mainWin.loadURL(path.join(__dirname, "frontend/main.html"));
	setTimeout(() => mainWin.show(), 50);

	mainWin.on("close", e => {
		e.preventDefault();
		mainWin.webContents.executeJavaScript("WindowOps.close()", true);
	});

	// 歌词窗体
	SimMusicWindows.lrcWin = lrcWin = new BrowserWindow({
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

	lrcWin.loadURL(path.join(__dirname, "frontend/lrc.html"));
	lrcWin.maximize();
}

// 处理命令行参数
function processCliArg(argv, pending) {
	const lastArg = argv[argv.length - 1];
	if (fs.existsSync(lastArg) && !fs.statSync(lastArg).isDirectory()) {
		if (pending) {
			pendingOpenFile.push(lastArg);
		}

		return lastArg;
	}

	return null;
}

app.whenReady().then(() => {
	if (!app.requestSingleInstanceLock()) {
		app.exit();
		return;
	}

	tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "frontend/assets/icon-blue.png")));
	tray.on("click", () => showMainWin());
	tray.setToolTip("SimMusic");

	createWindow();
	processCliArg(process.argv, true);

	app.on("second-instance", (_event, argv) => {
		if (isMainWinLoaded) {
			showMainWin();
		}

		// 缓存变量，防止第二次判断时更改
		const loaded = isMainWinLoaded;
		const file = processCliArg(argv, !loaded);
		if (file && loaded) {
			showMainWin();
			mainWin.webContents.send("fileLaunch", file);
		}
	});

	session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
		desktopCapturer.getSources({ types: ["screen"] }).then(sources => {
			callback({ video: sources[0], audio: "loopback" });
		});
	});
});

ipcMain.handle("mainWinLoaded", () => {
	if (isMainWinLoaded) {
		return [];
	}

	isMainWinLoaded = true;
	setTimeout(() => {
		mainWin.setTitleBarOverlay({ color: "rgba(255,255,255,0)", symbolColor: "black" });
	}, 500);

	return pendingOpenFile;
});

ipcMain.handle("overlayColor", (_, inPlayer) => {
	mainWin.setTitleBarOverlay({ color: "rgba(255,255,255,0)", symbolColor: inPlayer ? "rgba(255,255,255,.8)" : "black" });
});


// 处理窗口事件
ipcMain.handle("winOps", (_, args) => {
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
const createDialogWindow = (parent, properties) => new BrowserWindow({
	parent: SimMusicWindows[parent],
	modal: true,
	frame: false,
	resizable: false,
	show: false,
	maximizable: false,
	webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false, devTools: false },
	...properties
});

ipcMain.handle("dialog", (_, type, txt, parent, dialogId) => {
	const dialogWindow = createDialogWindow(parent, { width: 500, height: 200 });
	dialogWindow.loadURL(path.join(__dirname, `frontend/components/dialog.html?type=${type}&txt=${encodeURIComponent(txt)}&parent=${parent}&dialogId=${dialogId}`));
	dialogWindow.once("ready-to-show", () => dialogWindow.show());
});

ipcMain.handle("dialogSubmit", async (_, parent, dialogId, txt) => {
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

ipcMain.handle("dialogCancel", (_, parent) => {
	SimMusicWindows[parent].webContents.send("dialogCancel");
});

ipcMain.handle("webview", (_, url, parent, dialogId, width, height, showFinishBtn) => {
	const dialogWindow = createDialogWindow(parent, {
		width: width ?? 600,
		height: height ?? 500,
		minWidth: 600,
		minHeight: 500,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false, webviewTag: true, devTools: false }
	});

	dialogWindow.loadURL(path.join(__dirname, `frontend/components/webview.html?url=${encodeURIComponent(url)}&showFinishBtn=${showFinishBtn}&parent=${parent}&dialogId=${dialogId}`));
	dialogWindow.center();

	dialogWindow.once("ready-to-show", () => dialogWindow.show());
});

ipcMain.handle("webviewDialogLoaded", (_, wcId) => {
	const wc = webContents.fromId(wcId);
	wc.setWindowOpenHandler(({ url }) => {
		wc.loadURL(url);
		return { action: "deny" }
	});
});

ipcMain.handle("modal", (_, url, height, parent) => {
	const dialogWindow = createDialogWindow(parent, { width: 500, height });
	dialogWindow.loadURL(path.join(__dirname, "frontend/components/", url));
	dialogWindow.once("ready-to-show", () => dialogWindow.show());
});


// 任务栏控件
const createTaskbarButtons = (isPlay) => {
	mainWin.setThumbarButtons([
		{
			tooltip: "上一首",
			icon: nativeImage.createFromPath(path.join(__dirname, "frontend/assets/misc/taskbar-prev.png")),
			click() { mainWin.webContents.executeJavaScript("SimAPControls.prev(true)", true); }
		}, {
			tooltip: isPlay ? "暂停" : "播放",
			icon: nativeImage.createFromPath(path.join(__dirname, isPlay ? "frontend/assets/misc/taskbar-pause.png" : "frontend/assets/misc/taskbar-play.png")),
			click() { mainWin.webContents.executeJavaScript("SimAPControls.togglePlay(true)", true); }
		}, {
			tooltip: "下一首",
			icon: nativeImage.createFromPath(path.join(__dirname, "frontend/assets/misc/taskbar-next.png")),
			click() { mainWin.webContents.executeJavaScript("SimAPControls.next(true)", true); }
		}
	]);

	const menu = Menu.buildFromTemplate([
		{ label: "SimMusic", type: "normal", enabled: false },
		{ type: "separator" },
		{ label: "显示主窗口", type: "normal", click() { showMainWin(); } },
		{ label: isPlay ? "暂停" : "播放", type: "normal", click() { mainWin.webContents.executeJavaScript("SimAPControls.togglePlay()", true); } },
		{ type: "separator" },
		{ label: "退出应用", type: "normal", click() { app.exit(); } },
	]);

	tray.setContextMenu(menu);
}

ipcMain.handle("musicPlay", () => {
	if (lyricsShowing) {
		lrcWin.webContents.send("setHidden", "inside", false);
	}

	createTaskbarButtons(true);
});

ipcMain.handle("musicPause", () => {
	lrcWin.webContents.send("setHidden", "inside", true);
	createTaskbarButtons(false);
});



// 桌面歌词
let lyricsShowing = false;
ipcMain.handle("toggleLyrics", (_, isShow) => {
	if (isShow || isShow === false) {
		lyricsShowing = !isShow;
	}

	if (lyricsShowing) {
		lrcWin.webContents.send("setHidden", "text", true);
		lyricsShowing = false;

		setTimeout(() => lrcWin.hide(), 100);
	} else {
		lrcWin.show();
		lrcWin.setIgnoreMouseEvents("true", { forward: true });
		lrcWin.setSkipTaskbar(true);
		lrcWin.setAlwaysOnTop(false);
		lrcWin.setAlwaysOnTop(true);
		lyricsShowing = true;

		setTimeout(() => lrcWin.webContents.send("setHidden", "text", false), 400);
	}

	return lyricsShowing;
});

ipcMain.handle("lrcUpdate", (_, lrc) => {
	lrcWin.webContents.send("lrcUpdate", lrc);
});

ipcMain.handle("focusDesktopLyrics", () => {
	lrcWin.setIgnoreMouseEvents(false);
});

ipcMain.handle("unfocusDesktopLyrics", () => {
	lrcWin.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.handle("updateDesktopLyricsConfig", (_, isProtected) => {
	lrcWin.webContents.send("lrcWinReload");
	lrcWin.setContentProtection(isProtected);
});



// 迷你模式
let isMiniMode = false;
ipcMain.handle("toggleMini", () => {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	mainWin.setOpacity(0);

	if (isMiniMode) {
		setTimeout(() => {
			mainWin.setMinimumSize(1000, 700);
			mainWin.setSize(1000, 700);
			mainWin.setPosition(parseInt(width / 2 - 500), parseInt(height / 2 - 350));
			mainWin.setResizable(true);
			mainWin.setHasShadow(true);
			mainWin.setAlwaysOnTop(false);
			mainWin.setSkipTaskbar(false);
			mainWin.setOpacity(1);
			mainWin.setMinimizable(true);
			mainWin.setClosable(true);
			mainWin.setTitleBarOverlay({ color: "rgba(255,255,255,0)", symbolColor: "black", height: 35 });
		}, 50);

		return isMiniMode = false;
	} else {
		setTimeout(() => {
			mainWin.unmaximize();
			mainWin.setMinimumSize(340, 60);
			mainWin.setSize(340, 60);
			mainWin.setResizable(false);
			mainWin.setHasShadow(false);
			mainWin.setAlwaysOnTop(true);
			mainWin.setSkipTaskbar(true);
			mainWin.setPosition(width - 360, height - 90);
			mainWin.setOpacity(.98);
			mainWin.setMinimizable(false);
			mainWin.setClosable(false);
			mainWin.setTitleBarOverlay({ color: "rgba(0,0,0,0)", symbolColor: "rgba(255,255,255,0)", height: 10 });
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

	try {
		exec(`cmd.exe /c "${batchPath}"`);
	} catch { }
}

ipcMain.handle("regFileExt", (_, isReg) => {
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

	try {
		exec(`cmd.exe /c "${batchPath}"`);
	} catch { }

	setTimeout(() => { app.exit(); }, 1000);
});



// 主窗口其他调用
ipcMain.handle("pickFolder", () => {
	return dialog.showOpenDialogSync(mainWin, {
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
		parent: mainWin,
		modal: true,
		webPreferences: { webSecurity: false, nodeIntegration: true, contextIsolation: false }
	});
	countdown.loadURL(path.join(__dirname, "frontend/components/shutdown.html"));
});

ipcMain.handle("cmd", (_, cmd) => {
	exec(cmd);
});

ipcMain.handle("mainWinExec", (_, js) => {
	mainWin.webContents.executeJavaScript(js);
});

ipcMain.handle("openDevtools", () => {
	mainWin.webContents.openDevTools();
	// 傻逼谷歌搞个宋体当默认代码字体 怎么想的 给你眼珠子扣下来踩两脚
	mainWin.webContents.once("devtools-opened", () => {
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
		mainWin.webContents.devToolsWebContents.executeJavaScript(`
			const overriddenStyle = document.createElement('style');
			overriddenStyle.innerHTML = '${css.replaceAll('\n', ' ')}';
			document.body.append(overriddenStyle);
			document.body.classList.remove('platform-windows');`);
	});
});



