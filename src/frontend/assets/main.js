

SimMusicVersion = "0.0.2-alpha";


// 窗口处理
const WindowStatus = {
	maximized: false,
	lyricsWin: false,
	desktopWin: false,
};
const WindowOps = {
	close () {
		ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "hide"]);
	},
	maximize () {
		if (!WindowStatus.maximized) ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "maximize"]);
		else ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "unmaximize"]);
	},
	minimize () {
		ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "minimize"]);
	},
	toggleLyrics () {
		return alert("很抱歉，此功能尚未开发。");
		ipcRenderer.invoke("toggleLyrics")
		.then(lyricsShow => {
			WindowStatus.lyricsWin = lyricsShow;
			document.getElementById("lyricsBtn").classList[lyricsShow ? "add" : "remove"]("active");
		});
	},
	toggleDesktop () {
		return alert("很抱歉，此功能尚未开发。");
		ipcRenderer.invoke("toggleDesktop")
		.then(desktopShow => {
			WindowStatus.desktopWin = desktopShow;
			document.getElementById("desktopBtn").classList[desktopShow ? "add" : "remove"]("active");
		});
	},
};
document.body.onresize = () => {
	ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "isMaximized"])
	.then(isMaximized => {
		WindowStatus.maximized = isMaximized;
		document.getElementById("maximizeBtn").innerHTML = isMaximized ? "&#xeabb;" : "&#xeab9;";
	});
};
document.body.onresize();
document.documentElement.onkeydown = e => {
	if (e.ctrlKey || e.key == "Tab") e.preventDefault();
	if (document.activeElement.tagName.toLowerCase() != "input") e.preventDefault();
};
document.documentElement.ondragstart = e => {e.preventDefault();};
document.getElementById("appVersion").innerText = SimMusicVersion;


// 公用函数
const SimMusicTools = {
	escapeHtml(text)  {
		const div = document.createElement("div");
		div.innerText = text;
		return div.innerHTML;
	},
	formatTime(time, hours = false) {
		let hoursValue = Math.floor(time / 3600);
		let hoursMinutes = Math.floor((time % 3600) / 60);
		let minutes = Math.floor(time / 60);
		let seconds = Math.floor(time % 60);
		if (hours) {
			return (!isNaN(hoursValue) && !isNaN(minutes) && !isNaN(seconds)) ? `${hoursValue ? (hoursValue + ":") : ""}${hoursMinutes < 10 ? "0" : ""}${hoursMinutes}:${seconds < 10 ? "0" : ""}${seconds}` : "--:--:--";
		} else {
			return (!isNaN(minutes) && !isNaN(seconds)) ? `${minutes}:${seconds < 10 ? "0" : ""}${seconds}` : "--:--";
		}
	},
	getTitleFromPath(path) {
		path = path.split("\\")[path.split("\\").length - 1];
		const lastDotIndex = path.lastIndexOf(".");
		if (lastDotIndex === -1 || lastDotIndex === 0) return path;
		return path.substring(0, lastDotIndex);
	},
	getDefaultAlbum(path) {
		const pathName = path.split("\\")[path.split("\\").length - 2];
		return pathName ?? "未知专辑";
	},
	initMusicIndex() {
		databaseRequest = indexedDB.open('MusicIndex', 1); 
		databaseRequest.onsuccess = () => { this.MusicIndex = databaseRequest.result; };
		databaseRequest.onupgradeneeded = event => { event.target.result.createObjectStore("s", { keyPath: "k" }); };
	},
	readMusicIndex(callBack) {
		try {
			if (!this.MusicIndex) return setTimeout(() => { this.readMusicIndex(callBack); }, 50);
			this.MusicIndex.transaction('s').objectStore('s').get("MusicIndex").onsuccess = function (event) {
				let result = (event.target.result && event.target.result['v']) || [];
				callBack(result);
			};
		} catch (err) {
			alert("读取音频索引时出现问题。" + err);
		}
	},
	writeMusicIndex(value, callBack) {
		if (!this.MusicIndex) return setTimeout(() => { this.writeMusicIndex(value, callBack); }, 50);
		let txn = this.MusicIndex.transaction("s", "readwrite");
		txn.oncomplete = () => { if (callBack) callBack(); }
		txn.objectStore('s').put({ 'k': "MusicIndex", 'v': value });
		txn.commit();
	},
};
SimMusicTools.initMusicIndex();


// 扩展运行环境
const ExtensionConfig = {};
const ExtensionRuntime = {
	count: 0,
	init() {
		config.getItem("extensions").forEach((json, index) => {
			fetch(json)
			.then(res => res.json())
			.then(data => {
				this.renderExtension(json, data, index);
				const cacheData = config.getItem("extensionCache");
				if (cacheData[json] && cacheData[json].version == data.version && !data.isDev) this.runExtension(cacheData[json].code, data);
				else fetch((data.url + "?v=" +data.version))
				.then(res => res.text())
				.then(code => {
					cacheData[json] = { version: data.version, code: code };
					config.setItem("extensionCache", cacheData);
					this.runExtension(code, data);
				});
			})
			.catch(() => {
				this.renderExtension(json, {}, index);
			})
		});
	},
	renderExtension(jsonUrl, data, index) {
		this.count++;
		if (this.count == config.getItem("extensions").length) {
			SimMusicTools.readMusicIndex(index => {
				lastMusicIndex = index;
				if (config.getItem("currentMusic")) {
					PlayerController.switchMusicWithList(config.getItem("currentMusic"), config.getItem("playList"), false, true);
				}
			});
		}
		const extensionContainer = document.getElementById("extensionContainer");
		extensionContainer.innerHTML += `
			<div onclick="ExtensionRuntime.uninstall(${index})">
				<section>
					<b>${data.name ?? "扩展加载失败"}</b>
					<span>加载来源：${SimMusicTools.escapeHtml(jsonUrl) == "assets/extensions/local.json" ? "SimMusic 内置组件" : SimMusicTools.escapeHtml(jsonUrl)}</span>
				</section>
				<button><i>&#xEC2A;</i> 卸载扩展</button>
			</div>`;
	},
	runExtension(code, metadata) {
		if (metadata.scheme) {
			const scheme = metadata.scheme;
			ExtensionConfig[scheme] = {};
			Function(code)();
			if (ExtensionConfig[scheme].musicList) {
				const span = document.createElement("span");
				span.innerHTML = `
					<section class="title"><span>${ExtensionConfig[scheme].uiName}</span><i>&#xF4B2;</i></section>
					<section class="lists"></section>`;
				if (ExtensionConfig[scheme].musicList.add) {
					span.querySelector("i").onclick = () => {
						ExtensionConfig[scheme].musicList.add(() => {
							span.querySelector(".lists").innerHTML = "";
							ExtensionConfig[scheme].musicList.renderList(span.querySelector(".lists"));
						});
					}
				} else {
					span.querySelector("i").remove();
				}
				ExtensionConfig[scheme].musicList.renderList(span.querySelector(".lists"));
				document.getElementById("extBars").appendChild(span);
			} 
		}
		else Function(code)();
	},
	install() {
		prompt("请输入扩展索引文件 URL ...", url => {
			confirm("请务必确保扩展来源可信，由攻击者开发的扩展将可能会恶意操作您的文件、控制您的设备。按「确认」以继续。", () => {
				const extensions = config.getItem("extensions");
				extensions.push(url);
				config.setItem("extensions", extensions);
				alert("扩展已添加，按「确认」重载主界面生效。", () => {location.reload();});
			});
		});
	},
	uninstall(index) {
		if (!index) return alert("内置扩展无法进行卸载。");
		confirm("确实要卸载此扩展吗？由此扩展提供的音乐将在移除后无法播放，请慎重选择。", () => {
			const extensions = config.getItem("extensions");
			extensions.splice(index, 1);
			config.setItem("extensions", extensions);
			alert("扩展已卸载，按「确认」重载主界面生效。", () => {location.reload();});
		});
	}
};
ExtensionRuntime.init();


// 综合歌单
const MusicList = {
	add(callback) {
		prompt("请输入歌单名称 ...", name => {
			const lists = config.getItem("musicLists");
			name = name.trim();
			if (!name) return alert("请输入歌单名称。");
			if (lists[name]) return alert("此歌单已经存在，请更换名称。");
			lists[name] = [];
			config.setItem("musicLists", lists);
			if (callback) callback(name);
			MusicList.renderList();
			MusicList.switchList(name);
		});
	},
	renderList() {
		document.getElementById("musicLists").innerHTML = "";
		const lists = config.getItem("musicLists");
		for (const name in lists) {
			const element = document.createElement("div");
			element.innerText = name;
			element.dataset.listName = name;
			element.onclick = () => {this.switchList(name);};
			element.oncontextmenu = event => {
				new ContextMenu([
					{ label: "查看歌曲", click() {element.click();} },
					{ type: "separator" },
					{ label: "重命名", click() {
						prompt(`请为歌单「${name}」设置新名称...`, newName => {
							const lists = config.getItem("musicLists");
							let newList = {};
							for (const listName in lists) {
								newList[(listName == name) ? newName : listName] = lists[listName];
							}
							config.setItem("musicLists", newList);
							MusicList.renderList();
							MusicList.switchList(newName);
						});
					} },
					{ label: "删除歌单", click() {
						confirm(`歌单「${name}」将被永久删除，但这不会影响到歌单中的文件。是否继续？`, () => {
							const lists = config.getItem("musicLists");
							delete lists[name];
							config.setItem("musicLists", lists);
							if (element.classList.contains("active")) switchRightPage("rightPlaceholder");
							element.remove();
						});
					} },
				]).popup([event.clientX, event.clientY]);
			};
			document.getElementById("musicLists").appendChild(element);
		}
	},
	switchList(name) {
		document.querySelector(".musicListTitle").hidden = false;
		document.querySelector(".searchTitle").hidden = true;
		document.getElementById("musicListName").innerText = name;
		document.getElementById("folderDir").hidden = true;
		const lists = config.getItem("musicLists");
		renderMusicList(lists[name], "musiclist-" + name);
		document.querySelectorAll(".left .leftBar div").forEach(ele => {
			if (ele.dataset.listName != name) ele.classList.remove("active");
			else ele.classList.add("active");
		});
	},
	getMenuItems(callback) {
		const array = [];
		const lists = config.getItem("musicLists");
		for (const name in lists) {
			array.push({
				label: name,
				click: () => {callback(name);}
			});
		}
		if (Object.keys(lists).length) array.push(({ type: "separator" }));
		array.push(({ label: "创建新歌单", click: () => {this.add(callback);} }));
		return array;
	},
	importToMusicList(name, files) {
		const lists = config.getItem("musicLists");
		if (!lists[name]) return;
		files.forEach(file => {
			if (!lists[name].includes(file)) lists[name].push(file);
		});
		config.setItem("musicLists", lists);
		this.switchList(name);
	}
};
MusicList.renderList();



// 音乐搜索
Search = {
	switchSearch() {
		if (document.getElementById("searchBtn").classList.contains("active")) return;
		switchRightPage("musicListContainer");
		document.querySelector(".musicListTitle").hidden = true;
		document.querySelector(".searchTitle").hidden = false;
		document.getElementById("musicListContent").innerHTML = "";
		document.getElementById("musicListErrorOverlay").hidden = false;	
		document.getElementById("musicListErrorOverlayText").innerText = "还未发起搜索";	
		document.querySelectorAll(".left .leftBar div").forEach(ele => ele.classList.remove("active"));
		document.getElementById("searchBtn").classList.add("active");
		currentViewingDir = currentViewingLength = null;
		const searchSource = document.getElementById("searchSource");
		if (!searchSource.innerHTML) {
			for (const name in ExtensionConfig) {
				if (ExtensionConfig[name].search) {
					searchSource.innerHTML += `<option value="${name}">${SimMusicTools.escapeHtml(ExtensionConfig[name].uiName)}</option>`;
				}
			}
		}
		document.getElementById("searchInput").value = "";
		document.getElementById("searchInput").focus();
	},
	submit() {
		if (event) event.preventDefault();
		const ext = document.getElementById("searchSource").value;
		const keyword = document.getElementById("searchInput").value;
		if (!keyword) return alert("请输入搜索关键字。");
		if (keyword == "OPENDEVTOOLS") {
			ipcRenderer.invoke("openDevtools");
			return document.getElementById("searchInput").value = "";
		}
		document.getElementById("searchSubmitBtn").disabled = true;
		setTimeout(() => {
			ExtensionConfig[ext].search(keyword)
			.then(data => {
				renderMusicList(data, `search-${ext}-${keyword}`, false, false, "暂无搜索结果");
			});
		}, 200);
	}
}



// 右侧列表界面
// 为提高性能，先用缓存的信息渲染，然后再获取没获取过的元数据
let currentViewingDir,currentViewingLength,lastMusicIndex;
function switchRightPage(id) {
	if (id != "musicListContainer") {
		currentViewingDir = null;
		document.querySelectorAll(".left .leftBar div").forEach(ele => {
			if (ele.dataset.pageId != id) ele.classList.remove("active");
			else ele.classList.add("active");
		});
	}
	document.querySelectorAll(".right>div").forEach(div => div.hidden = true);
	document.getElementById(id).hidden = false;
}
const coverObserver =  new IntersectionObserver((entries) => {
	entries.forEach(entry => {
		if (entry.isIntersecting && !entry.target.dataset.coverShown) {
			entry.target.dataset.coverShown = 1;
			const coverArray = lastMusicIndex[entry.target.dataset.file] ? lastMusicIndex[entry.target.dataset.file].cover : null;
			if (!coverArray) return;
			const blob = new Blob([coverArray]);
			const img = entry.target.querySelector("img");
			img.src = URL.createObjectURL(blob);
			img.onload = () => { reloadMusicListCover(() => {URL.revokeObjectURL(img.src);});  }
		}
	});
});
function renderMusicList(files, dir, isFinalRender, dontRenderBeforeLoaded, errorText = "当前歌单为空\n拖入本地文件以导入") {
	const musicListContent = document.getElementById("musicListContent");
	if (isFinalRender) {
		document.getElementById("searchSubmitBtn").disabled = false;
		if (dir != currentViewingDir) return; /*防止刷新索引完成后用户已经跑了*/
	} else {
		if (dontRenderBeforeLoaded) return;
		if (dir == currentViewingDir && files.length == currentViewingLength) return;
		currentViewingDir = dir;
		currentViewingLength = files.length;
		document.getElementById("musicListCover").src = "assets/placeholder.svg";
		switchRightPage("musicListContainer");
		musicListContent.innerHTML = "";
		document.getElementById("musicListErrorOverlay").hidden = true;	
	}
	document.querySelector(".tableContainer").scrollTo(0, 0);
	document.getElementById("musicListNum").innerText = files.length;
	document.getElementById("musicListTime").innerText = "--:--";
	SimMusicTools.readMusicIndex(musicIndex => {
		const renderObject = [];
		lastMusicIndex = musicIndex;
		if (!isFinalRender) updateMusicIndex(files, dir, errorText);
		files.forEach(name => {
			if (musicIndex[name]) renderObject.push([name, musicIndex[name]]);
			else renderObject.push([name, {}]);
		});
		musicListContent.innerHTML = "";
		let totalTime = 0;
		renderObject.forEach(music => {
			const tr = document.createElement("tr");
			tr.dataset.file = music[0];
			if (isFinalRender) coverObserver.observe(tr);
			tr.oncontextmenu = e => {
				if (!tr.classList.contains("selected")) tr.click();
				handleMusicContextmenu(e);
			};
			tr.onclick = e => {
				e.stopPropagation();
				const allTrs = Array.from(document.querySelectorAll("#musicListContent>tr"));
				const lastSelectedElement = document.querySelector("#musicListContent>tr.selected");
				if (e.ctrlKey) {
					if (tr.classList.contains("selected")) tr.classList.remove("selected");
					else tr.classList.add("selected");
				} else if (e.shiftKey && lastSelectedElement) {
					const indexLastSelected = allTrs.indexOf(lastSelectedElement);
					const indexCurrentSelected = allTrs.indexOf(tr);
					var start = Math.min(indexLastSelected, indexCurrentSelected);
					var end = Math.max(indexLastSelected, indexCurrentSelected);
					const selectedTrs = allTrs.slice(start, end + 1);
					selectedTrs.forEach(tr => tr.classList.add("selected"));
				} else {
					allTrs.forEach(tr => tr.classList.remove("selected"));
					tr.classList.add("selected");
				}
			}
			tr.ondblclick = () => {
				tr.classList.remove("selected");
				PlayerController.switchMusicWithList(music[0], getCurrentMusicList());
			};
			tr.innerHTML = `
				<td><img src="assets/placeholder.svg" onerror="this.src='assets/placeholder.svg'"></td>
				<td>${SimMusicTools.escapeHtml(music[1].title ?? SimMusicTools.getTitleFromPath(music[0]))}</td>
				<td>${SimMusicTools.escapeHtml(music[1].artist ?? "正在读取")}</td>
				<td>${SimMusicTools.escapeHtml(music[1].album ?? SimMusicTools.getDefaultAlbum(music[0]))}</td>
				<td>${SimMusicTools.formatTime(music[1].time)}</td>`;
			musicListContent.appendChild(tr);
			if (music[1].time) totalTime += music[1].time;
		});
		if (isFinalRender) document.getElementById("musicListTime").innerText = SimMusicTools.formatTime(totalTime, true);
		if (!musicListContent.innerHTML) {
			document.getElementById("musicListErrorOverlay").hidden = false;	
			document.getElementById("musicListErrorOverlayText").innerText = errorText;	
		}
		PlayerController.loadMusicListActive();
		document.getElementById("musicListContainer").onclick = () => { document.querySelectorAll("#musicListContent>tr").forEach(tr => tr.classList.remove("selected")); };
	});
}
function updateMusicIndex(allFiles, dir, errorText) {
	const existedFiles = Object.keys(lastMusicIndex);
	const files = allFiles.filter(file => !existedFiles.includes(file));
	let finished = -1;
	const record = () => {
		finished ++;
		if (!files.length) renderMusicList(allFiles, dir, true, false, errorText);
		else if (finished == files.length) SimMusicTools.writeMusicIndex(lastMusicIndex, () => {renderMusicList(allFiles, dir, true);});
	}
	files.forEach(file => {
		const updateMusicIndex = (data) => {
			if (!data) data = {};
			lastMusicIndex[file] = {
				title: data.title ? data.title : SimMusicTools.getTitleFromPath(file),
				artist: data.artist ? data.artist : "未知艺术家",
				album: data.album ? data.album : SimMusicTools.getDefaultAlbum(file),
				time: data.time,
				cover: data.cover ? data.cover : "",
				lyrics: data.lyrics,
			};
			record();
		};
		try {
			const scheme = file.split(":")[0];
			ExtensionConfig[scheme].readMetadata(file).then(updateMusicIndex).catch(updateMusicIndex);
		} catch (err) {
			updateMusicIndex();
		}
	});
	record();
}
function reloadMusicListCover(callBack) {
	let musicListCover = document.getElementById("musicListCover");
	const img = document.querySelector("#musicListContent>tr:first-child>td:first-child>img");
	if (!img) return;
	let currentCover = img.src;
	if (musicListCover.src != currentCover) {
		musicListCover.src = currentCover;
		return musicListCover.onload = callBack();
	}
	callBack();
}
function getCurrentMusicList() {
	return Array.from(document.querySelectorAll("#musicListContent>tr")).map(tr => tr.dataset.file);
}
function getCurrentSelected() {
	return Array.from(document.querySelectorAll("#musicListContent>tr.selected")).map(tr => tr.dataset.file);
}
function handleMusicContextmenu(event) {
	const list = getCurrentMusicList();
	const files = getCurrentSelected();
	if (!files.length) return;
	const singleFileOptions = [
		{ label: "开始播放", click() {PlayerController.switchMusicWithList(files[0], list, true);} },
		{ label: "下一首播放", click() {PlayerController.appendPlayList(files[0], true);} },
	]
	const multiFileOptions = [
		{ label: "在当前曲目后播放", click() {PlayerController.appendPlayList(files, true);} },
		{ label: "添加到当前播放列表", click() {PlayerController.appendPlayList(files);} },
		{ label: "替换当前播放列表", click() {PlayerController.switchMusicWithList(files[0], files, true);} },
	]
	const commonOptions = [
		{ type: "separator" },
		{ label: "添加到歌单", submenu: MusicList.getMenuItems(name => {MusicList.importToMusicList(name, files);}) },
	];
	new ContextMenu((files.length == 1 ? singleFileOptions : multiFileOptions).concat(commonOptions)).popup([event.clientX, event.clientY]);
}



// 播控核心
const PlayerController = {
	// 替换列表并播放
	switchMusicWithList(file, list, showAP, isInit) {
		if (config.getItem("loop") == 2) {
			list = list.sort(() => Math.random() - 0.5);
			if (file) {
				const currentPlayingIndex = list.indexOf(file);
				const currentFirst = list[0];
				list[0] = list[currentPlayingIndex];
				list[currentPlayingIndex] = currentFirst;
			}
		}
		this.replacePlayList(list);
		this.switchMusic(file ? file : list[0], isInit)
		.then(() => {if (showAP) SimAPUI.show();});
	},
	// 切歌
	async switchMusic(file, isInit, forceSwitch) {
		if (!config.getItem("playList").includes(file)) return;
		if (config.getItem("currentMusic") == file && !isInit && !forceSwitch) {
			SimAPUI.show();
			return document.getElementById("audio").play();
		}
		config.setItem("currentMusic", file);
		this.loadMusicListActive();
		const fileScheme = file.split(":")[0];
		if (!ExtensionConfig[fileScheme] || !ExtensionConfig[fileScheme].player || !ExtensionConfig[fileScheme].player.getPlayUrl || !ExtensionConfig[fileScheme].player.getLyrics) {
			shell.beep();
			return alert("播放此曲目所需的扩展程序已损坏或被删除。");
		}
		const metadata = lastMusicIndex[file];
		switchMusic({
			album: metadata.cover ? URL.createObjectURL(new Blob([metadata.cover])) : "assets/placeholder.svg",
			title: metadata.title,
			artist: metadata.artist,
			audio: await ExtensionConfig[fileScheme].player.getPlayUrl(file),
			lyrics: metadata.lyrics ? metadata.lyrics : await ExtensionConfig[fileScheme].player.getLyrics(file),
			play: !isInit,
		});
	},
	// 替换列表
	replacePlayList(list) {
		config.setItem("playList", list);
		this.renderPlaylist();
	},
	// 渲染列表
	renderPlaylist() {
		document.getElementById("playList").innerHTML = "";
		config.getItem("playList").forEach(file => {
			const div = this.createListElement(file);
			document.getElementById("playList").appendChild(div);
		});
		this.loadMusicListActive();
	},
	// 下一首播放或者插入列表最后
	appendPlayList(fileOrList, toNext = false) {
		if (fileOrList.forEach) {
			if (config.getItem("loop") == 2) fileOrList = fileOrList.sort(() => Math.random() - 0.5);
			fileOrList.forEach(file => {this.appendPlayList(file, toNext);});
			return;
		}
		const syncListFromDivs = () => {config.setItem("playList", Array.from(document.querySelectorAll("#playList>div")).map(div => div.dataset.file));}
		const list = config.getItem("playList");
		const file = fileOrList;
		const activeDiv = document.querySelector("#playList>div.active");
		if (list.includes(file)) {
			if (toNext) {
				if (file == config.getItem("currentMusic")) return SimAPUI.show();
				const divs = document.querySelectorAll("#playList>div");
				if (!activeDiv) return alert("当前未在播放。");
				divs.forEach(div => {
					if (div.dataset.file == file) activeDiv.insertAdjacentElement("afterend", div);
				});
				syncListFromDivs();
			} 
		} else {
			const div = this.createListElement(file);
			if (toNext){
				if (!activeDiv) return alert("当前未在播放。");
				activeDiv.insertAdjacentElement("afterend", div);
			}
			else document.getElementById("playList").appendChild(div);
			syncListFromDivs();
		}
		SimAPControls.toggleList(1);
		SimAPUI.show();
	},
	// 创建列表元素（用于渲染列表&插入下一首播放）
	createListElement(file) {
		const div = document.createElement("div");
		div.innerHTML = `
			<img src="assets/placeholder.svg" onerror="this.src='assets/placeholder.svg'">
			<div><b>${SimMusicTools.escapeHtml(lastMusicIndex[file].title)}</b><span>${SimMusicTools.escapeHtml(lastMusicIndex[file].artist)}</span></div>
		`;
		div.dataset.file = file;
		div.onclick = () => {this.switchMusic(file);}
		coverObserver.observe(div);
		return div;
	},
	// 渲染歌单界面播放中歌曲
	loadMusicListActive() {
		document.querySelectorAll("#musicListContent>tr").forEach(tr => {
			tr.classList[tr.dataset.file == config.getItem("currentMusic") ? "add" : "remove"]("active");
		})
		document.querySelectorAll("#playList>div").forEach(div => {
			if (div.dataset.file == config.getItem("currentMusic")) {
				div.classList.add("active");
				div.scrollIntoView({behavior: "smooth", block: "center"});
			} else div.classList.remove("active");
		})
	}
}
if (!config.getItem("lrcShow")) document.body.classList.add("hideLyrics");



// 设置页面
const SettingsPage = {
	data: [
		{type: "title", text: "音频扫描"},
		{type: "input", text: "音频格式", description: "扫描本地音乐时的音频文件扩展名，以空格分隔。", configItem: "musicFormats"},
		{type: "button", text: "清除音频索引", description: "若您更改了音频元数据，可在此删除索引数据以重新从文件读取。", button: "清除", onclick: () => { SimMusicTools.writeMusicIndex({}, () => { alert("索引数据已清除。"); }); }},
		{type: "title", text: "播放界面"},
		{type: "boolean", text: "背景流光", description: "关闭后可牺牲部分视觉效果以显著减少播放页硬件占用。（视效性能问题调整优化中，第一版先饶了我x", configItem: "backgroundBlur"},
		{type: "boolean", text: "歌词层级虚化", description: "若无需虚化效果或需要提升性能可关闭此功能。", configItem: "lyricBlur"},
		{type: "range", text: "歌词字号", configItem: "lyricSize", min: 1, max: 3},
		{type: "range", text: "歌词间距", configItem: "lyricSpace", min: .2, max: 1},
		{type: "title", text: "音频输出"},
		{type: "button", text: "均衡器", description: "不用点，还没写，别骂了", button: "配置", onclick: () => { alert("都让你别点了(恼"); }},
	],
	init() {
		const settingsContainer = document.getElementById("settingsContainer");
		if (settingsContainer.innerHTML) return;
		this.data.forEach(data => {
			const div = document.createElement("div");
			switch (data.type) {
				case "title":
					div.classList.add("title");
					div.innerText = data.text;
					break;
				case "boolean":
					div.classList.add("block");
					div.innerHTML = `
						<section>
							<div>${SimMusicTools.escapeHtml(data.text)}</div>
							${data.description ? `<span>${SimMusicTools.escapeHtml(data.description)}</span>` : ""}
						</section>
						<div class="toggle"></div>`;
					div.classList.add(config.getItem(data.configItem) ? "on" : "off");
					div.onclick = () => {
						const currentItem = config.getItem(data.configItem);
						config.setItem(data.configItem, !currentItem);
						div.classList[currentItem ? "remove" : "add"]("on");
					}
					break;
				case "range":
					div.classList.add("block");
					div.innerHTML = `
						<section>
							<div>${SimMusicTools.escapeHtml(data.text)}</div>
							${data.description ? `<span>${SimMusicTools.escapeHtml(data.description)}</span>` : ""}
						</section>
						<div class="range" min="${data.min}" max="${data.max}" value="${config.getItem(data.configItem)}"></div>`;
					const range = new SimProgress(div.querySelector(".range"));
					range.onchange = value => { config.setItem(data.configItem, value); };
					break;
				case "input":
					div.classList.add("block");
					div.innerHTML = `
						<section>
							<div>${SimMusicTools.escapeHtml(data.text)}</div>
							${data.description ? `<span>${SimMusicTools.escapeHtml(data.description)}</span>` : ""}
						</section>
						<input type="${data.type ?? "text"}">`;
					const input = div.querySelector("input");
					input.value = config.getItem(data.configItem);
					input.autocomplete = input.spellcheck = false;
					input.onchange = () => { config.setItem(data.configItem, input.value); };
					break;
				case "button":
					div.classList.add("block");
					div.innerHTML = `
						<section>
							<div>${SimMusicTools.escapeHtml(data.text)}</div>
							${data.description ? `<span>${SimMusicTools.escapeHtml(data.description)}</span>` : ""}
						</section>
						<button class="sub">${SimMusicTools.escapeHtml(data.button)}</button>`;
					div.onclick = data.onclick;
					break;
			}
			settingsContainer.appendChild(div);
		});
	},
}


// 关于页面
function initAboutPage() {
	document.querySelectorAll("#aboutPage a").forEach(a => {
		if (!a.onclick) a.onclick = () => {
			shell.openExternal(`https://github.com/` + a.innerHTML);
		}
	});
	document.querySelectorAll("#aboutPage section").forEach(link => {
		if (!link.onclick) link.onclick = () => {
			shell.openExternal(link.dataset.href);
		}
	});
}