

SimMusicVersion = "0.0.4-beta";


// 窗口处理
const WindowStatus = {
	maximized: false,
	lyricsWin: false,
};
const WindowOps = {
	close () {
		if (!config.getItem("disableBackground")) ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "hide"]);
		else ipcRenderer.invoke("quitApp");
	},
	maximize () {
		if (!WindowStatus.maximized) ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "maximize"]);
		else ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "unmaximize"]);
	},
	minimize () {
		ipcRenderer.invoke("winOps", [document.documentElement.dataset.windowId, "minimize"]);
	},
	toggleLyrics () {
		if (this.lyricsCooldown) return;
		this.lyricsCooldown = true;
		setTimeout(() => {this.lyricsCooldown = false;}, 500);
		ipcRenderer.invoke("toggleLyrics")
		.then(lyricsShow => {
			WindowStatus.lyricsWin = lyricsShow;
			document.getElementById("lyricsBtn").classList[lyricsShow ? "add" : "remove"]("active");
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
	if ((e.ctrlKey && ["i", "I", "r", "R"].includes(e.key)) || e.key == "Tab") e.preventDefault();
	if (document.activeElement.tagName.toLowerCase() == "input") return;
	e.preventDefault();
	if (document.activeElement.tagName.toLowerCase() == "input") return;
	const audio = document.getElementById("audio");
	switch (e.key.toLowerCase()) {
		case "w": config.setItem("desktopLyricsTop", Math.max(config.getItem("desktopLyricsTop") - 2, 0)); break;
		case "a": config.setItem("desktopLyricsLeft", Math.max(config.getItem("desktopLyricsLeft") - 2, 0)); break;
		case "s": config.setItem("desktopLyricsTop", Math.min(config.getItem("desktopLyricsTop") + 2, screen.height - 100)); break;
		case "d": config.setItem("desktopLyricsLeft", Math.min(config.getItem("desktopLyricsLeft") + 2, screen.width)); break;
	}
};
document.documentElement.ondragstart = e => {e.preventDefault();};
document.getElementById("appVersion").textContent = SimMusicVersion;


// 公用函数
const SimMusicTools = {
	escapeHtml(text)  {
		const div = document.createElement("div");
		div.textContent = text;
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
	getCoverUrl(arrayOrUrl) {
		if (typeof(arrayOrUrl) == "object") return URL.createObjectURL(new Blob([arrayOrUrl]));
		return arrayOrUrl;
	}
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
				this.renderExtension(json, {}, index, true);
			})
		});
	},
	renderExtension(jsonUrl, data, index, isErr) {
		if (isErr) { this.count++; this.checkMusicInit(); }
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
		this.count++;
		this.checkMusicInit();
	},
	install() {
		prompt("请输入扩展索引文件 URL ...", url => {
			if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("file:")) return alert("索引文件 URL 无效。");
			confirm("请务必确保扩展来源可信，由攻击者开发的扩展将可能会恶意操作您的文件、控制您的设备。按「确认」以继续。", () => {
				const extensions = config.getItem("extensions");
				extensions.push(url);
				config.setItem("extensions", extensions);
				alert("扩展已添加，按「确认」重载此应用生效。", () => {ipcRenderer.invoke("restart");});
			});
		});
	},
	uninstall(index) {
		if (!index) return alert("内置扩展无法进行卸载。");
		confirm("确实要卸载此扩展吗？由此扩展提供的音乐将在移除后无法播放，请慎重选择。", () => {
			const extensions = config.getItem("extensions");
			extensions.splice(index, 1);
			config.setItem("extensions", extensions);
			alert("扩展已卸载，按「确认」重载此应用生效。", () => {ipcRenderer.invoke("restart");});
		});
	},
	checkMusicInit() {
		if (this.count == config.getItem("extensions").length) {
			SimMusicTools.readMusicIndex(index => {
				lastMusicIndex = index;
				if (config.getItem("currentMusic") && lastMusicIndex[config.getItem("currentMusic")]) {
					PlayerController.switchMusicWithList(config.getItem("currentMusic"), config.getItem("playList"), false, true);
				} else {
					config.setItem("currentMusic", "");
				}
			});
			setTimeout(() => {
				document.body.classList.remove("appLoading");
			}, 1000);
		}
	}
};
ExtensionRuntime.init();




// 左侧栏大小调整
document.getElementById("leftBarResizer").addEventListener("mousedown", e => {
	document.addEventListener("mousemove", resize);
	document.addEventListener("mouseup", stopResize);
	document.documentElement.style.cursor = "col-resize";
});
function resize(e) {
	let x = e.pageX;
	let distance = Math.max(150, Math.min(400, x));
	config.setItem("leftBarWidth", distance);
}
function stopResize() {
	document.removeEventListener("mousemove", resize);
	document.removeEventListener("mouseup", stopResize);
	document.documentElement.style.cursor = "";
}
config.listenChange("leftBarWidth", width => document.body.style.setProperty("--leftBarWidth", width + "px"));
document.body.style.setProperty("--leftBarWidth", config.getItem("leftBarWidth") + "px");

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
			element.textContent = name;
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
	switchList(name, force) {
		const lists = config.getItem("musicLists");
		renderMusicList(lists[name], "musiclist-" + name, false, false, "拖入文件以导入歌单", [
			{type: ["single", "multiple"], content: { label: "从歌单中移除", click() {
				const files = getCurrentSelected();
				const confirmDelete = () => {
					files.forEach(file => {
						const lists = config.getItem("musicLists");
						lists[name].splice(lists[name].indexOf(file), 1);
						config.setItem("musicLists", lists);
					});
					document.querySelectorAll("#musicListContainer>.show .musicListContent>tr.selected").forEach(ele => ele.remove());
				}
				if (files.length > 4) confirm(`确实要从歌单「${name}」删除这 ${files.length} 首曲目吗？`, confirmDelete);
				else confirmDelete();
			} }}
		], {name: name}, force);
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
		unselectAll();
	}
};
MusicList.renderList();



// 歌曲拖放
document.documentElement.ondragover = e => {
	e.preventDefault();
	if (document.getElementById("musicListContainer").hidden || !document.querySelector("#musicListContainer>.show") || !document.querySelector("#musicListContainer>.show").dataset.musicListId.startsWith("musiclist-")) return;
	if (e.dataTransfer.types.includes("Files")) {
		document.body.classList.add("dragOver");
		document.getElementById("dropTip").style.left = e.clientX + 10 > document.documentElement.clientWidth - 160 ? document.documentElement.clientWidth - 165 : e.clientX + 10 + "px";
		document.getElementById("dropTip").style.top = e.clientY + 30 + "px";
	}
};
document.documentElement.ondrop = e => {
	e.preventDefault();
	if (!document.querySelector("#musicListContainer>.show") || document.getElementById("musicListContainer").hidden) return;
	const currentMusicList = document.querySelector("#musicListContainer>.show").dataset.musicListId;
	if (!currentMusicList.startsWith("musiclist-")) return;
	document.body.classList.remove("dragOver");
	if (e.dataTransfer.types.includes("Files")) {
		let files = [];
		const supportedExtensions = config.getItem("musicFormats").split(" ");
		for (let i = 0; i < e.dataTransfer.files.length; i++){
			const file = e.dataTransfer.files[i];
			const fullPath = file.path;
			const ext = path.extname(fullPath).toLowerCase();
			if (supportedExtensions.includes(ext)) files.push("file:" + fullPath);
		}
		const name = currentMusicList.substring(10);
		MusicList.importToMusicList(name, files);
		MusicList.switchList(name, true);
	}
};
document.documentElement.ondragleave = () => {
	document.body.classList.remove("dragOver");
};



// 音乐搜索
Search = {
	switchSearch() {
		if (document.getElementById("searchBtn").classList.contains("active")) return;
		document.getElementById("searchSubmitBtn").disabled = false;
		document.querySelectorAll(".left .leftBar div").forEach(ele => ele.classList.remove("active"));
		document.getElementById("searchBtn").classList.add("active");
		const searchSource = document.getElementById("searchSource");
		if (!searchSource.innerHTML) {
			for (const name in ExtensionConfig) {
				if (ExtensionConfig[name].search) {
					searchSource.innerHTML += `<option value="${name}">${SimMusicTools.escapeHtml(ExtensionConfig[name].uiName)}</option>`;
				}
			}
		}
		switchRightPage("musicListContainer");
		musicListContainer.querySelectorAll("div[data-music-list-id]").forEach(div => {
			div.classList[div.dataset.musicListId == "search" ? "add" : "remove"]("show");
		});
		document.getElementById("searchInput").select();
		if (!this.searched) {
			showErrorOverlay("还未发起搜索");
			document.getElementById("searchBottomIndicator").style.opacity = 0;
		}
	},
	submit() {
		this.searched = true;
		if (event) event.preventDefault();
		const ext = document.getElementById("searchSource").value;
		const keyword = document.getElementById("searchInput").value;
		if (!keyword) return alert("请输入搜索关键字。");
		if (keyword == "OPENDEVTOOLS") {
			ipcRenderer.invoke("openDevtools");
			return document.getElementById("searchInput").value = "";
		}
		const btn = document.getElementById("searchSubmitBtn");
		btn.disabled = true;
		this.currentSearchKeyword = keyword;
		setTimeout(() => {
			ExtensionConfig[ext].search(keyword, 0)
			.then((data) => {
				if (!btn.disabled) return;
				this.searchPage = 0;
				this.hasMore = data.hasMore;
				this.currentSearchExt = ext;
				renderMusicList(data.files ?? [], "search", false, true, "暂无搜索结果", data.menu ?? [], {}, true, () => {
					Search.loadIndicatorStatus();
					btn.disabled = false;
				});
				document.getElementById("searchBottomIndicator").dataset.status = "";
			})
			.catch(err => {
				if (!btn.disabled) return;
				showErrorOverlay(err);
			});
		}, 200);
	},
	loadMore() {
		if (this.hasMore) {
			const searchBottomIndicator = document.getElementById("searchBottomIndicator");
			if (searchBottomIndicator.dataset.status == "loading") return;
			searchBottomIndicator.dataset.status = "loading";
			searchBottomIndicator.textContent = "正在加载更多...";
			const currentKeyword = this.currentSearchKeyword;
			setTimeout(() => {
				ExtensionConfig[this.currentSearchExt].search(currentKeyword, this.searchPage + 1)
				.then((data) => {
					if (this.currentSearchKeyword != currentKeyword) return searchBottomIndicator.textContent = "暂无更多搜索结果";
					searchBottomIndicator.dataset.status = "";
					renderMusicList(getCurrentMusicList().concat(data.files ?? []), "search", false, true, "暂无搜索结果", data.menu ?? [], {}, true, this.loadIndicatorStatus);
					this.searchPage++;
					this.hasMore = data.hasMore;
				})
				.catch(() => {
					this.hasMore = false;
					this.loadIndicatorStatus();
				});
			}, 200);
		} else {
			this.hasMore = false;
			this.loadIndicatorStatus();
		}
	},
	loadIndicatorStatus() {
		document.getElementById("searchBottomIndicator").style = "";
		if (document.querySelector("#musicListContainer>.show .musicListErrorOverlay").hidden) document.getElementById("searchBottomIndicator").textContent = Search.hasMore ? "点击加载更多" : "暂无更多搜索结果";
	}
}
new IntersectionObserver((entries) => {
	entries.forEach(entry => {
		if (entry.isIntersecting && Search.searched) Search.loadMore();
	});
}).observe(document.getElementById("searchBottomIndicator"));


// 右侧列表界面
// 为提高性能，先用缓存的信息渲染，然后再获取没获取过的元数据
let lastMusicIndex = {};
function switchRightPage(id) {
	if (id != "musicListContainer") {
		document.querySelectorAll(".left .leftBar div").forEach(ele => {
			if (ele.dataset.pageId != id) ele.classList.remove("active");
			else ele.classList.add("active");
		});
	}
	document.querySelectorAll(".right>div").forEach(div => div.hidden = true);
	document.getElementById(id).hidden = false;
}
const coverObserver = new IntersectionObserver((entries) => {
	entries.forEach(entry => {
		if (entry.isIntersecting && !entry.target.dataset.coverShown) {
			entry.target.dataset.coverShown = 1;
			const coverData = lastMusicIndex[entry.target.dataset.file] ? lastMusicIndex[entry.target.dataset.file].cover : null;
			if (!coverData) return;
			const img = entry.target.querySelector("img");
			img.src = SimMusicTools.getCoverUrl(coverData);
			img.onload = () => {reloadMusicListCover();}
		}
	});
});
function showErrorOverlay(err) {
	document.querySelector("#musicListContainer>.show .musicListContent").innerHTML = "";
	document.querySelector("#musicListContainer>.show .musicListErrorOverlay").hidden = false;
	document.querySelector("#musicListContainer>.show .musicListErrorOverlay>div").textContent = err;
	document.getElementById("searchSubmitBtn").disabled = false;
	document.getElementById("searchBottomIndicator").textContent = "";
}
function renderMusicList(files, uniqueId, isFinalRender, dontRenderBeforeLoaded, errorText = "当前歌单为空", menuItems = [], musicListInfo = {}, force, finishCallback) {
	// 获取或创建当前的歌单容器
	const musicListContainer = document.getElementById("musicListContainer");
	let containerElement, templateElement;
	musicListContainer.querySelectorAll("div[data-music-list-id]").forEach(div => {
		div.classList.remove("show");
		if (div.dataset.musicListId == "template") templateElement = div;
		if (div.dataset.musicListId == uniqueId) containerElement = div;
	});
	if (!containerElement) {
		containerElement = templateElement.cloneNode(true);
		containerElement.dataset.musicListId = uniqueId;
		musicListContainer.appendChild(containerElement);
	}
	containerElement.classList.add("show");
	// 获取或创建当前的音乐列表
	let musicListContent = containerElement.querySelector(".musicListContent");
	if (!musicListContent) {
		musicListContent = templateElement.querySelector(".musicListContent").cloneNode(true);
		containerElement.appendChild(musicListContent);
	}
	// 处理首次渲染与二次渲染
	if (!isFinalRender) {
		// 切换页面
		switchRightPage("musicListContainer");
		unselectAll();
		document.getElementById("searchSubmitBtn").disabled = false;
		if (uniqueId != "search") {
			// 渲染歌单顶部信息栏
			containerElement.querySelector(".musicListName").textContent = musicListInfo.name ?? "歌单标题";
			containerElement.querySelector(".folderDir").hidden = !musicListInfo.dirName;
			containerElement.querySelector(".musicListDir").textContent = musicListInfo.dirName;
			containerElement.querySelector(".musicListNum").textContent = files.length;
			// 防止重复渲染 提升性能
			if (files.length == containerElement.dataset.fileLength && !force) return;
			containerElement.dataset.fileLength = files.length;
			// 清空容器，搜索除外
			musicListContent.innerHTML = "";
		}
		// 处理一些其他元素
		containerElement.querySelector(".musicListErrorOverlay").hidden = true;	
	}
	// 读取索引并渲染列表
	SimMusicTools.readMusicIndex(musicIndex => {
		const renderObject = [];
		lastMusicIndex = musicIndex;
		if (!isFinalRender) {
			updateMusicIndex(files, uniqueId, errorText, menuItems, finishCallback);
			if (dontRenderBeforeLoaded) return;
		} else {
			if (finishCallback) finishCallback();
		}
		files.forEach(name => {
			if (musicIndex[name]) renderObject.push([name, musicIndex[name]]);
			else renderObject.push([name, {}]);
		});
		musicListContent.innerHTML = "";
		let totalTime = 0;
		renderObject.forEach(music => {
			// 创建元素
			let tr;
			tr = document.createElement("tr");
			tr.dataset.file = music[0];
			if (isFinalRender) coverObserver.observe(tr);
			tr.innerHTML = `
				<td><img src="assets/placeholder.svg" onerror="this.src='assets/placeholder.svg'"></td>
				<td>${SimMusicTools.escapeHtml(music[1].title ?? SimMusicTools.getTitleFromPath(music[0]))}</td>
				<td>${SimMusicTools.escapeHtml(music[1].artist ?? "正在读取")}</td>
				<td>${SimMusicTools.escapeHtml(music[1].album ?? SimMusicTools.getDefaultAlbum(music[0]))}</td>
				<td>${SimMusicTools.formatTime(music[1].time)}</td>`;
			// 绑定点击事件
			tr.oncontextmenu = e => {
				if (!tr.classList.contains("selected")) tr.click();
				handleMusicContextmenu(e, menuItems);
			};
			tr.onclick = e => {
				e.stopPropagation();
				const allTrs = Array.from(musicListContent.querySelectorAll("tr"));
				const lastSelectedElement = musicListContent.querySelector("tr.selected");
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
			// 统计音乐时间
			if (music[1].time) totalTime += music[1].time;
			// 加入列表
			musicListContent.appendChild(tr);
		});
		// 排序相关
		if (uniqueId != "search") {
			const headCells = containerElement.querySelectorAll("thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(4)");
			headCells.forEach(th => {
				th.onclick = () => { setMusicListSort(th.cellIndex); };
			});
			loadMusicListSort();
		}
		// 其他处理
		if (isFinalRender && uniqueId != "search") containerElement.querySelector(".musicListTime").textContent = SimMusicTools.formatTime(totalTime, true);
		if (!musicListContent.innerHTML) showErrorOverlay(errorText);
		PlayerController.loadMusicListActive();
		containerElement.onclick = () => { musicListContent.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected")); };
		reloadMusicListCover();
	});
}
function setMusicListSort(thIndex) {
	let current = config.getItem("musicListSort");
	if (current[0] == thIndex) current[1] = !current[1];
	else current = [thIndex, 1];
	config.setItem("musicListSort", current);
	loadMusicListSort();
}
function loadMusicListSort() {
	const allTables = document.querySelectorAll(`#musicListContainer>div:not([data-music-list-id="search"]) table`);
	const sortConfig = config.getItem("musicListSort");
	const rowIndex = sortConfig[0];
	const rowSortNum = sortConfig[1] ? 1 : -1;
	for (const table of allTables) {
		table.querySelectorAll("thead th").forEach(th => {
			th.classList.remove("positiveOrder");
			th.classList.remove("reversedOrder");
			if (th.cellIndex == rowIndex) th.classList.add(sortConfig[1] ? "positiveOrder" : "reversedOrder");
		});
		const tBody = table.tBodies[0];
		const rows = Array.from(tBody.rows);
		rows.sort((tr1, tr2) => {
			const tr1Text = tr1.cells[rowIndex].textContent;
			const tr2Text = tr2.cells[rowIndex].textContent;
			return rowSortNum * tr1Text.localeCompare(tr2Text);
		});
		tBody.append(...rows);
	}
	reloadMusicListCover();
}
function updateMusicIndex(allFiles, uniqueId, errorText, menuItems, finishCallback) {
	const existedFiles = Object.keys(lastMusicIndex);
	const files = allFiles.filter(file => !existedFiles.includes(file));
	let finished = -1;
	const record = () => {
		finished ++;
		if (!files.length) renderMusicList(allFiles, uniqueId, true, false, errorText, menuItems, undefined, undefined, finishCallback);
		else if (finished == files.length) SimMusicTools.writeMusicIndex(lastMusicIndex, () => {renderMusicList(allFiles, uniqueId, true);});
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
function reloadMusicListCover() {
	document.querySelectorAll("#musicListContainer>div").forEach(div => {
		let musicListCover = div.querySelector(".musicListCover")
		const img = div.querySelector(".musicListContent>tr:first-child>td:first-child>img");
		if (!musicListCover || !img) return;
		let currentCover = img.src;
		if (musicListCover.src != currentCover) {
			musicListCover.src = currentCover;
		}
	});
}
function getCurrentMusicList() {
	return Array.from(document.querySelectorAll("#musicListContainer>.show .musicListContent>tr")).map(tr => tr.dataset.file);
}
function getCurrentSelected() {
	return Array.from(document.querySelectorAll("#musicListContainer>.show .musicListContent>tr.selected")).map(tr => tr.dataset.file);
}
function unselectAll() {
	document.getElementById("musicListContainer").querySelectorAll("tr").forEach(tr => tr.classList.remove("selected"));
}
function handleMusicContextmenu(event, extraMenu = []) {
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
	const basicOptions = (files.length == 1 ? singleFileOptions : multiFileOptions).concat(commonOptions);
	let extraOptions = [];
	extraMenu.forEach(menu => {
		if (files.length == 1 && menu.type.includes("single")) extraOptions.push(menu.content);
		else if (files.length != 1 && menu.type.includes("multiple")) extraOptions.push(menu.content);
	});
	new ContextMenu(basicOptions.concat(extraOptions)).popup([event.clientX, event.clientY]);
}



// 播控核心
const PlayerController = {
	// 替换列表并播放
	switchMusicWithList(file, list, showAP, isInit) {
		if (!list.length) return;
		if (document.body.classList.contains("musicLoading")) return;
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
		if (document.body.classList.contains("musicLoading")) return;
		if (config.getItem("currentMusic") == file && !isInit && !forceSwitch) {
			SimAPUI.show();
			return document.getElementById("audio").play();
		}
		document.getElementById("audio").pause();
		config.setItem("currentMusic", file);
		this.loadMusicListActive();
		const fileScheme = file.split(":")[0];
		if (!ExtensionConfig[fileScheme] || !ExtensionConfig[fileScheme].player || !ExtensionConfig[fileScheme].player.getPlayUrl || !ExtensionConfig[fileScheme].player.getLyrics) {
			shell.beep();
			return alert("播放此曲目所需的扩展程序已损坏或被删除。");
		}
		// 这里是为了防止音频timeupdate事件撅飞加载动画
		setTimeout(async () => {
			SimAPProgress.setValue(0);
			SimAPProgressBottom.setValue(0);
			document.body.classList.add("musicLoading");
			const metadata = lastMusicIndex[file];
			switchMusic({
				album: metadata.cover ? SimMusicTools.getCoverUrl(metadata.cover) : "assets/placeholder.svg",
				title: metadata.title,
				artist: metadata.artist,
				audio: await ExtensionConfig[fileScheme].player.getPlayUrl(file),
				lyrics: metadata.lyrics ? metadata.lyrics : await ExtensionConfig[fileScheme].player.getLyrics(file),
				play: !isInit,
			});
		}, 50);
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
			if (!activeDiv) return alert("当前未在播放。");
			if (toNext)	activeDiv.insertAdjacentElement("afterend", div);
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
			<i>&#xF4C8;</i>
		`;
		div.dataset.file = file;
		div.onclick = () => {this.switchMusic(file);}
		div.querySelector("i").onclick = e => {
			e.stopPropagation();
			this.deleteFromList(file);
		};
		coverObserver.observe(div);
		return div;
	},
	// 从列表中删除
	deleteFromList(file) {
		document.querySelectorAll("#playList>div").forEach(currentDiv => {
			if (currentDiv.dataset.file == file) {
				const div = currentDiv;
				const list = config.getItem("playList");
				list.splice(list.indexOf(file), 1);
				config.setItem("playList", list);
				div.classList.add("removed");
				setTimeout(() => {div.remove();}, 400);
				if (file == config.getItem("currentMusic")) {
					if (!list.length) {
						config.setItem("currentMusic", "");
						SimAPUI.hide();
						document.body.classList.remove("withCurrentMusic");
					} else {
						SimAPControls.next();
					}
					this.loadMusicListActive();
				}
				return;
			}
		});
	},
	// 渲染歌单界面播放中歌曲
	loadMusicListActive() {
		document.querySelectorAll(".musicListContent>tr").forEach(tr => {
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
const loadPlayColor = () => { document.body.classList[config.getItem("playBtnColor") ? "add" : "remove"]("playBtnColor"); }
config.listenChange("playBtnColor", loadPlayColor); loadPlayColor();
const load3dEffect = () => { document.body.classList[config.getItem("3dEffect") ? "add" : "remove"]("threeEffect"); }
config.listenChange("3dEffect", load3dEffect); load3dEffect();





// 设置页面
const SettingsPage = {
	data: [
		{type: "title", text: "通用配置"},
		{type: "boolean", text: "不驻留后台进程", description: "关闭主界面时停止播放并完全退出应用。", configItem: "disableBackground"},
		{type: "title", text: "音频扫描"},
		{type: "input", text: "音频格式", description: "扫描本地音乐时的音频文件扩展名，以空格分隔。", configItem: "musicFormats"},
		{type: "button", text: "清除音频索引", description: "若您更改了音频元数据，可在此删除索引数据以重新从文件读取。", button: "清除", onclick: () => { SimMusicTools.writeMusicIndex({}, () => { alert("索引数据已清除，按「确认」重载此应用生效。", () => { ipcRenderer.invoke("restart"); }); }); }},
		{type: "title", text: "播放界面"},
		{type: "boolean", text: "背景流光", description: "关闭后可牺牲部分视觉效果以显著减少播放页硬件占用。", configItem: "backgroundBlur"},
		{type: "boolean", text: "播放页 3D 特效", description: "在播放页的歌曲信息、播放列表与歌词界面使用 3D 视觉效果。", configItem: "3dEffect"},
		{type: "boolean", text: "歌词层级虚化", description: "若无需虚化效果或需要提升性能可关闭此功能。", configItem: "lyricBlur"},
		{type: "boolean", text: "对播放按钮应用主题色", configItem: "playBtnColor"},
		{type: "range", text: "歌词字号", configItem: "lyricSize", min: 1, max: 3},
		{type: "range", text: "歌词间距", configItem: "lyricSpace", min: .2, max: 1},
		{type: "boolean", text: "歌词多语言支持", description: "开启后，时间戳一致的不同歌词将作为多语言翻译同时渲染。此配置项切换曲目生效。", configItem: "lyricMultiLang"},
		{type: "range", text: "歌词翻译字号", description: "开启多语言支持后，可使用此选项调整多语言翻译的字号。", configItem: "lyricTranslation", min: .5, max: 1},
		{type: "title", text: "音频输出"},
		{type: "button", text: "均衡器", description: "不用点，还没写，别骂了", button: "配置", onclick: () => { alert("都让你别点了(恼"); }},
		{type: "title", text: "桌面歌词"},
		{type: "boolean", text: "启动时打开", configItem: "autoDesktopLyrics"},
		{type: "boolean", text: "在截图中隐藏", description: "其他应用截图或录屏时隐藏桌面歌词的内容，与多数截图或录屏软件相兼容，支持 Windows 10 2004 以上版本及 Windows 11。此功能不会影响您查看歌词，对采集卡等外置硬件无效。", configItem: "desktopLyricsProtection"},
		{type: "boolean", text: "在播放页自动关闭", description: "当 SimMusic 主窗口打开播放页时自动关闭桌面歌词。", configItem: "desktopLyricsAutoHide"},
		{type: "color", text: "字体颜色", inputType: "color", configItem: "desktopLyricsColor"},
		{type: "color", text: "边框颜色", inputType: "color", configItem: "desktopLyricsStroke"},
		{type: "range", text: "字体大小", configItem: "desktopLyricsSize", min: 20, max: 60},
		{type: "range", text: "歌词区域宽度", configItem: "desktopLyricsWidth", min: 500, max: screen.width},
	],
	init() {
		const settingsContainer = document.getElementById("settingsContainer");
		if (settingsContainer.innerHTML) return;
		this.data.forEach(data => {
			const div = document.createElement("div");
			switch (data.type) {
				case "title":
					div.classList.add("title");
					div.textContent = data.text;
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
					range.ondrag = value => { config.setItem(data.configItem, value); };
					break;
				case "input":
					div.classList.add("block");
					div.innerHTML = `
						<section>
							<div>${SimMusicTools.escapeHtml(data.text)}</div>
							${data.description ? `<span>${SimMusicTools.escapeHtml(data.description)}</span>` : ""}
						</section>
						<input type="${data.inputType ?? "text"}">`;
					const input = div.querySelector("input");
					input.value = config.getItem(data.configItem);
					input.autocomplete = input.spellcheck = false;
					input.onchange = () => { config.setItem(data.configItem, input.value); };
					break;
				case "color":
					div.classList.add("block");
					div.innerHTML = `
						<section>
							<div>${SimMusicTools.escapeHtml(data.text)}</div>
							${data.description ? `<span>${SimMusicTools.escapeHtml(data.description)}</span>` : ""}
						</section>
						<div class="colorInput"><span></span><input type="${data.inputType ?? "text"}"></div>`;
					const colorInput = div.querySelector("input");
					colorInput.value = config.getItem(data.configItem);
					div.querySelector(".colorInput>span").textContent = config.getItem(data.configItem);
					div.querySelector(".colorInput>span").style.color = config.getItem(data.configItem);
					colorInput.onchange = () => {
						div.querySelector(".colorInput>span").textContent = colorInput.value;
						div.querySelector(".colorInput>span").style.color = colorInput.value;
						config.setItem(data.configItem, colorInput.value);
					};
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



// 桌面歌词
function updateDesktopLyricsConfig() {
	ipcRenderer.invoke("updateDesktopLyricsConfig", config.getItem("desktopLyricsProtection"));
}
config.listenChange("desktopLyricsColor", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsStroke", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsSize", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsProtection", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsWidth", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsTop", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsLeft", updateDesktopLyricsConfig);
updateDesktopLyricsConfig();
if (config.getItem("autoDesktopLyrics")) WindowOps.toggleLyrics();


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