

SimMusicVersion = "0.0.1-alpha";


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
}
if (!SimMusicVersion.includes("-dev")) document.documentElement.onkeydown = e => {
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
	getLyricsFromPath(path) {
		const lastDotIndex = path.lastIndexOf(".");
		lrcPath = path.substring(0, lastDotIndex) + ".lrc";
		try {return fs.readFileSync(lrcPath, "utf8");}
		catch (_ignore) {return " ";}
	},
	scanMusic(directory) {
		try {
			const supportedExtensions = config.getItem("musicFormats").split(" ");
			let list = [];
			fs.readdirSync(directory).forEach(file => {
				const fullPath = path.join(directory, file);
				if (fs.statSync(fullPath).isDirectory()) {
					list = list.concat(this.scanMusic(fullPath));
				} else {
					const ext = path.extname(fullPath).toLowerCase();
					if (supportedExtensions.includes(ext)) {
						list.push(fullPath);
					}
				}
			});
			return list;
		} catch (_ignore) { return []; }
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



// 目录和歌单列表界面
const FolderList = {
	add() {
		ipcRenderer.invoke("pickFolder")
		.then(dir => {
			if (!dir || !dir[0]) return;
			dir = dir[0].trim().replaceAll("/", "\\");
			const lists = config.getItem("folderLists");
			if (dir.split("\\").length == 2) return alert("您不能导入磁盘根目录。");
			if (lists.includes(dir)) return alert("此目录已被添加到目录列表中。");
			lists.push(dir);
			config.setItem("folderLists", lists);
			this.renderList();
			this.switchList(dir);
		});
	},
	renderList() {
		document.getElementById("folderLists").innerHTML = "";
		const lists = config.getItem("folderLists");
		lists.forEach(name => {
			const spilitted = name.split("\\");
			const folderName = spilitted[spilitted.length - 1];
			const element = document.createElement("div");
			element.innerText = folderName;
			element.dataset.folderName = name;
			element.onclick = () => {this.switchList(name);};
			element.oncontextmenu = event => {
				new ContextMenu([
					{ label: "查看歌曲", click() {element.click();} },
					{ label: "在资源管理器中显示", click() {shell.openPath(name);} },
					{ type: "separator" },
					{ label: "从列表中移除", click() {
						confirm(`目录「${folderName}」将从 SimMusic 目录列表中移除，但不会从文件系统中删除。是否继续？`, () => {
							const lists = config.getItem("folderLists");
							lists.splice(lists.indexOf(name), 1);
							config.setItem("folderLists", lists);
							if (element.classList.contains("active")) switchRightPage("rightPlaceholder");
							element.remove();
						});
					} },
				]).popup([event.clientX, event.clientY]);
			};
			document.getElementById("folderLists").appendChild(element);
		});
	},
	switchList(name) {
		const spilitted = name.split("\\");
		document.getElementById("musicListName").innerText = spilitted[spilitted.length - 1];
		document.getElementById("folderDir").hidden = false;
		document.getElementById("musicListDir").innerText = name;
		renderMusicList(SimMusicTools.scanMusic(name), "folder-" + name);
		document.querySelectorAll(".left .leftBar div").forEach(ele => {
			if (ele.dataset.folderName != name) ele.classList.remove("active");
			else ele.classList.add("active");
		});
	},
};
FolderList.renderList();

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



// 右侧列表界面
// 为提高性能，先用缓存的信息渲染，然后再获取没获取过的元数据
let currentViewingDir,lastMusicIndex;
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
function renderMusicList(files, dir, isFinalRender) {
	const musicListContent = document.getElementById("musicListContent");
	if (isFinalRender) { if (dir != currentViewingDir) return; /*防止刷新索引完成后用户已经跑了*/ }
	else {
		if (dir == currentViewingDir) return;
		currentViewingDir = dir;
		document.getElementById("musicListCover").src = "assets/placeholder.svg";
		switchRightPage("musicListContainer");
		musicListContent.innerHTML = "";
	}
	document.querySelector(".tableContainer").scrollTo(0, 0);
	document.getElementById("musicListNum").innerText = files.length;
	document.getElementById("musicListTime").innerText = "--:--";
	SimMusicTools.readMusicIndex(musicIndex => {
		const renderObject = [];
		lastMusicIndex = musicIndex;
		if (!isFinalRender) updateMusicIndex(files, dir, musicIndex);
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
				<td>${SimMusicTools.escapeHtml(music[1].album ?? music[0].split("\\")[music[0].split("\\").length - 2])}</td>
				<td>${SimMusicTools.formatTime(music[1].time)}</td>`;
			musicListContent.appendChild(tr);
			if (music[1].time) totalTime += music[1].time;
		});
		if (isFinalRender) document.getElementById("musicListTime").innerText = SimMusicTools.formatTime(totalTime, true);
		PlayerController.loadMusicListActive();
		document.getElementById("musicListContainer").onclick = () => { document.querySelectorAll("#musicListContent>tr").forEach(tr => tr.classList.remove("selected")); };
	});
}
function updateMusicIndex(allFiles, dir) {
	const existedFiles = Object.keys(lastMusicIndex);
	const files = allFiles.filter(file => !existedFiles.includes(file));
	let finished = -1;
	const record = () => {
		finished ++;
		if (!files.length) renderMusicList(allFiles, dir, true);
		else if (finished == files.length) SimMusicTools.writeMusicIndex(lastMusicIndex, () => {renderMusicList(allFiles, dir, true);});
	}
	files.forEach(file => {
		musicMetadata.parseFile(file).then((metadata) => {
			let nativeLyrics;
			for (const tagType in metadata.native) {
				if (metadata.native[tagType].forEach) metadata.native[tagType].forEach(tag => {
					if (tag.value && tag.value.text && tag.value.text.match && tag.value.text.match(/\[\d+\:\d+\.\d+\]/g)) {
						nativeLyrics = tag.value.text;
					}
				});
			}
			const metadataArtist = metadata.common.artists ? metadata.common.artists.join(", ") : null || metadata.common.artist;
			const metadataCover = metadata.common.picture ? metadata.common.picture[0] ? metadata.common.picture[0].data : null : null;
			lastMusicIndex[file] = {
				title: metadata.common.title ? metadata.common.title : SimMusicTools.getTitleFromPath(file),
				artist: metadataArtist ? metadataArtist : "未知艺术家",
				album: metadata.common.album ? metadata.common.album : file.split("\\")[file.split("\\").length - 2],
				time: metadata.format.duration,
				cover: metadataCover ? metadataCover : "",
				lyrics: metadata.common.lyrics || nativeLyrics,
			};
			record();
		}).catch(() => {
			lastMusicIndex[file] = {
				title: SimMusicTools.getTitleFromPath(file),
				artist: "未知艺术家",
				album: null,
				time: null,
				cover: "",
				lyrics: null,
			};
			record();
		});
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
		{ type: "separator" },
		{ label: "在资源管理器中显示", click() {shell.showItemInFolder(files[0]);} },
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
		if (file) this.switchMusic(file, isInit);
		else this.switchMusic(list[0], isInit)
		if (showAP) SimAPUI.show();
	},
	// 切歌
	switchMusic(file, isInit, forceSwitch) {
		if (!config.getItem("playList").includes(file)) return;
		if (config.getItem("currentMusic") == file && !isInit && !forceSwitch) {
			SimAPUI.show();
			return document.getElementById("audio").play();
		}
		const metadata = lastMusicIndex[file];
		config.setItem("currentMusic", file);
		switchMusic({
			album: metadata.cover ? URL.createObjectURL(new Blob([metadata.cover])) : "assets/placeholder.svg",
			title: metadata.title,
			artist: metadata.artist,
			audio: file,
			lyrics: metadata.lyrics ? metadata.lyrics : SimMusicTools.getLyricsFromPath(file),
			play: !isInit,
		});
		this.loadMusicListActive();
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
SimMusicTools.readMusicIndex(index => {
	lastMusicIndex = index;
	if (config.getItem("currentMusic")) {
		PlayerController.switchMusicWithList(config.getItem("currentMusic"), config.getItem("playList"), false, true);
		audio.pause();
	}
});
if (!config.getItem("lrcShow")) document.body.classList.add("hideLyrics");



// 设置页面
const SettingsPage = {
	data: [
		{type: "title", text: "音频扫描"},
		{type: "input", text: "音频格式", description: "进行扫描的音频文件扩展名，以空格分隔。", configItem: "musicFormats"},
		{type: "button", text: "清除音频索引", description: "若您更改了音频元数据，可在此删除索引数据以重新从文件读取。", button: "清除", onclick: () => { SimMusicTools.writeMusicIndex({}, () => { alert("索引数据已清除。"); }); }},
		{type: "title", text: "播放界面"},
		{type: "boolean", text: "背景流光", description: "关闭后可牺牲部分视觉效果以显著减少播放页硬件占用。（视效性能问题调整优化中，第一版先饶了我x", configItem: "backgroundBlur"},
		{type: "boolean", text: "歌词层级虚化", description: "若无需虚化效果或需要提升性能可关闭此功能。", configItem: "lyricBlur"},
		{type: "range", text: "歌词字号", configItem: "lyricSize", min: 1, max: 3},
		{type: "range", text: "歌词间距", configItem: "lyricSpace", min: .2, max: 1},
		{type: "title", text: "音频输出"},
		{type: "button", text: "均衡器", description: "不用点，还没写，别骂了", button: "配置", onclick: () => { alert("都让你别点了(恼"); }},
		{type: "title", text: "桌面歌词"},
		{type: "title", text: "调试"},
		{type: "button", text: "退出进程", button: "退出", onclick: () => { ipcRenderer.invoke("quitApp"); }},
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