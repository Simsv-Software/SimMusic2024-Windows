SimMusicVersion = "0.2.1";


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
	toggleMini () {
		if (!document.body.classList.contains("withCurrentMusic")) return alert("当前没有正在播放的曲目。");
		ipcRenderer.invoke("toggleMini")
		.then(isMini => {
			document.body.classList[isMini ? "add" : "remove"]("miniMode");
		});
	},
};
document.documentElement.onkeydown = e => {
	if ((e.ctrlKey && ["i", "I", "r", "R"].includes(e.key)) || e.key == "Tab") e.preventDefault();
	if (document.activeElement.tagName.toLowerCase() == "input") return;
	e.preventDefault();
	if (document.activeElement.tagName.toLowerCase() == "input") return;
	const moveOffset = e.ctrlKey ? 10 : 1;
	switch (e.key.toLowerCase()) {
		case "w": config.setItem("desktopLyricsTop", Math.max(config.getItem("desktopLyricsTop") - moveOffset, 0)); break;
		case "a": config.setItem("desktopLyricsLeft", Math.max(config.getItem("desktopLyricsLeft") - moveOffset, 0)); break;
		case "s": config.setItem("desktopLyricsTop", Math.min(config.getItem("desktopLyricsTop") + moveOffset, screen.height - 100)); break;
		case "d": config.setItem("desktopLyricsLeft", Math.min(config.getItem("desktopLyricsLeft") + moveOffset, screen.width)); break;
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
		databaseRequest = indexedDB.open("MusicIndex", 1); 
		databaseRequest.onsuccess = () => { this.MusicIndex = databaseRequest.result; };
		databaseRequest.onupgradeneeded = event => { event.target.result.createObjectStore("s", { keyPath: "k" }); };
	},
	readMusicIndex(callBack) {
		try {
			if (!this.MusicIndex) return setTimeout(() => { this.readMusicIndex(callBack); }, 50);
			this.MusicIndex.transaction("s").objectStore("s").get("MusicIndex").onsuccess = function (event) {
				let result = (event.target.result && event.target.result["v"]) || [];
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
		txn.objectStore("s").put({ "k": "MusicIndex", "v": value });
		txn.commit();
	},
	getCoverUrl(arrayOrUrl) {
		if (typeof(arrayOrUrl) == "object") return URL.createObjectURL(new Blob([arrayOrUrl]));
		return arrayOrUrl;
	},
	getWindowsLegalName(original) {
		return original.replaceAll("\\", "_").replaceAll("/", "_").replaceAll(":", "：").replaceAll("*", "×").replaceAll("?", "？").replaceAll('"', "'").replaceAll("<", "《").replaceAll(">", "》").replaceAll("|", "丨").replaceAll("\n", "");
	},
	naturalSplit(string, filterCommonWords) {
		const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
		const iterator = segmenter.segment(string);
		return Array.from(iterator).map(obj => obj.segment.trim().toLowerCase()).filter(segment => {
			if (!filterCommonWords) return segment != "";
			return segment != "" && !["的", "大", "小", "了", "the", "a"].includes(segment);
		});
	},
	humanSize(size) {
		size = Number(size);
		if (!size) return "--";
		const units = ["B", "KB", "MB", "GB", "TB", "PB"];
		let index = 0;
		while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; }
		return size.toFixed(1) + units[index];
	}
};
SimMusicTools.initMusicIndex();


// 扩展运行环境
const ExtensionConfig = {};
const ExtensionRuntime = {
	async init() {
		const extData = await this.getExtData();
		const permData = config.getItem("extPerms");
		for (const packageId in extData) {
			let extError;
			try {
				ExtensionConfig[packageId] = {};
				Function(extData[packageId].code)();
				if (ExtensionConfig[packageId].musicList && !permData[packageId]?.removeSidebar) {
					const span = document.createElement("span");
					span.innerHTML = `
						<section class="title"><span>${extData[packageId].uiName}</span><i>&#xF4B2;</i></section>
						<section class="lists"></section>`;
					if (ExtensionConfig[packageId].musicList.add) {
						span.querySelector("i").onclick = () => {
							ExtensionConfig[packageId].musicList.add(() => {
								span.querySelector(".lists").innerHTML = "";
								ExtensionConfig[packageId].musicList.renderList(span.querySelector(".lists"));
							});
						}
					} else {
						span.querySelector("i").remove();
					}
					ExtensionConfig[packageId].musicList.renderList(span.querySelector(".lists"));
					document.getElementById("extBars").appendChild(span);
				} 
			} catch (err) {
				extError = err;
			}
			const div = document.createElement("div");
			div.classList.add("block");
			div.innerHTML = `
				<section>
					<div>${SimMusicTools.escapeHtml(extData[packageId].extName)}${extData[packageId].isDev ? ` <badge><i>&#xEBAD;</i> 由清单文件加载的开发扩展</badge>` : ""}</div>
					<span>
						
						<i>&#xEE59;</i> 扩展包名: ${SimMusicTools.escapeHtml(packageId)}<br>
						<i>&#xEE51;</i> 扩展版本: ${SimMusicTools.escapeHtml(extData[packageId].version)}<br>
						${extError ? `<i>&#xEB97;</i> ${SimMusicTools.escapeHtml(extError)}<br>` : ""}
					</span>
				</section>
				<div class="${permData[packageId]?.removeSidebar ? "" : `on `}perm permSidebar">允许显示歌单<span class="toggle"></span></div>
				<button class="sub"${packageId == "file" ? " disabled" : ""}>卸载</button>`;
			div.querySelector("button").onclick = () => {
				if (!extData[packageId].isDev) this.uninstall(packageId);
				else {
					confirm("确实要卸载开发扩展吗？", () => {
						config.setItem("devExt", null);
						alert("扩展已成功卸载，按「确定」重载此应用生效。", () => { ipcRenderer.invoke("restart"); });
					});
				}
			};
			const togglePerm = (name, className) => {
				document.getElementById("extReloadTip").hidden = false;
				const permData = config.getItem("extPerms");
				if (!permData[packageId]) permData[packageId] = {};
				permData[packageId][name] = !permData[packageId][name];
				div.querySelector("." + className).classList[!permData[packageId][name] ? "add" : "remove"]("on");
				config.setItem("extPerms", permData);
			}
			div.querySelector(".permSidebar").onclick = () => { togglePerm("removeSidebar", "permSidebar"); };
			document.getElementById("extensionContainer").appendChild(div);
		}
		
		SimMusicTools.readMusicIndex(index => {
			lastMusicIndex = index;
			ipcRenderer.invoke("mainWinLoaded").then(list => {
				if (list.length) {
					list = list.map(file => "file:" + file);
					updateMusicIndex(list, () => {
						PlayerController.switchMusicWithList(list[0], list, false, true);
					});
				} else {
					if (config.getItem("currentMusic") && lastMusicIndex[config.getItem("currentMusic")]) {
						PlayerController.switchMusicWithList(config.getItem("currentMusic"), config.getItem("playList"), false, true, true);
					} else {
						config.setItem("currentMusic", "");
					}
				}
				loadThemeImage();
				setTimeout(() => {
					document.body.classList.remove("appLoading");
				}, 500);
			});
		});
	},
	async install(file) {
		confirm("请确保扩展包来源可信，由攻击者提供的扩展可能会对您的系统执行恶意操作。", async () => {
			try {
				if (file.size > 256 * 1024) return alert("扩展包文件过大，请确保扩展包内仅包含必要的代码文件。");
				const arrBuffer = await file.arrayBuffer();
				const unzipped = fflate.unzipSync(new Uint8Array(arrBuffer));
				const manifestContent = fflate.strFromU8(unzipped["manifest.json"]);
				const manifest = JSON.parse(manifestContent);
				if (!manifest.packageId || !manifest.version || !manifest.extName) return alert("扩展清单字段数据不完整。");
				const packageId = manifest.packageId;
				let code = "";
				for (const i in manifest.entries) {
					const filename = manifest.entries[i];
					const jsCode = fflate.strFromU8(unzipped[filename]);
					code += jsCode + "\n";
				}
				const extData = config.getItem("ext");
				extData[packageId] = {
					version: manifest.version,
					extName: manifest.extName,
					uiName: manifest.uiName ?? manifest.extName,
					code: code,
				};
				config.setItem("ext", extData);
				alert("扩展已成功安装，按「确定」重载此应用生效。", () => { ipcRenderer.invoke("restart"); });
			} catch (err) {
				console.warn(err);
				if (file.path.endsWith("manifest.json") && config.getItem("devMode")) {
					try {
						config.setItem("devExt", file.path);
						alert("已从清单文件加载此扩展，按「确定」重载此应用生效。", () => { ipcRenderer.invoke("restart"); });
					} catch {
						alert("扩展清单文件损坏或无法读取。");
					}
				}
				else alert("扩展包已损坏、无法读取或存在未知错误。");
			}
		});
	},
	uninstall(packageId) {
		confirm("确实要卸载此扩展吗？卸载后由此扩展提供的曲目将无法正常播放，请慎重。", () => {
			const extData = config.getItem("ext");
			delete extData[packageId];
			config.setItem("ext", extData);
			alert("扩展已成功卸载，按「确定」重载此应用生效。", () => { ipcRenderer.invoke("restart"); });
		});
	},
	async getExtData() {
		const extData = config.getItem("ext");
		if (config.getItem("devExt")) {
			try {
				const json = fs.readFileSync(config.getItem("devExt"));
				const manifest = JSON.parse(json);
				if (!manifest.packageId || !manifest.version || !manifest.extName) throw("");
				const extPath = path.dirname(config.getItem("devExt"));
				let code = "";
				manifest.entries.forEach(entry => {
					code += fs.readFileSync(path.join(extPath, entry));
				});
				extData[manifest.packageId] = {
					code,
					extName: manifest.extName,
					uiName: manifest.uiName ?? manifest.extName,
					version: manifest.version,
					isDev: true,
				}
			} catch {
				extData["dev-error"] = {
					code: "throw('清单文件损坏')",
					extName: "dev-error",
					uiName: "dev-error",
					version: "dev-error",
					isDev: true,
				}
			}
		}
		extData["file"] = {
			code: await (await fetch("assets/components/LocalFolderExtension.js")).text(),
			uiName: "本地",
			extName: "本地文件播放支持",
			version: SimMusicVersion,
		}
		return extData;
	}
};
ExtensionRuntime.init();



// 扩展支持函数
ExtensionFunctions = {
	insertStyle(css) {
		const style = document.createElement("style");
		style.innerHTML = css;
		document.documentElement.appendChild(style);
	},
	insertNavigationItem(options) {
		if (document.getElementById(options.pageId)) return;
		const navbarDiv = document.createElement("div");
		navbarDiv.dataset.pageId = options.pageId;
		navbarDiv.innerHTML = `<i>&#x${options.icon};</i> ${SimMusicTools.escapeHtml(options.text)}`;
		navbarDiv.onclick = () => {switchRightPage(options.pageId);};
		if (options.appendBefore) {
			let appendBeforeElement;
			document.querySelectorAll(".left>div>div[data-page-id]").forEach(div => {
				if (div.dataset.pageId == options.appendBefore) appendBeforeElement = div;
			});
			document.querySelector(".left>div").insertBefore(navbarDiv, appendBeforeElement);
		} else document.querySelector(".left>div").appendChild(navbarDiv);
		const pageDiv = document.createElement("div");
		pageDiv.id = options.pageId;
		pageDiv.hidden = true;
		document.querySelector(".right").appendChild(pageDiv);
		return {navbarDiv, pageDiv};
	},
};





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
					{ label: "查看歌曲", icon: "ECB5", click() {element.click();} },
					{ type: "separator" },
					{ label: "重命名", icon: "EC86", click() {
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
					{ label: "删除歌单", icon: "F4C8", click() {
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
		renderMusicList(lists[name], {
			uniqueId: "musiclist-" + name, 
			errorText: "拖入文件以导入歌单", 
			menuItems: [
				{type: ["single", "multiple"], content: { label: "从此歌单移除", icon: "EC3C", click() {
					const files = getCurrentSelected();
					const confirmDelete = () => {
						files.forEach(file => {
							const lists = config.getItem("musicLists");
							lists[name].splice(lists[name].indexOf(file), 1);
							config.setItem("musicLists", lists);
						});
						document.querySelectorAll("#musicListContainer>.show .musicListContent>tr.selected").forEach(ele => ele.remove());
						document.querySelector("#musicListContainer>.show").dataset.fileLength = -1;
						PlayerController.loadMusicListActive();
					}
					if (files.length > 4) confirm(`确实要从歌单「${name}」删除这 ${files.length} 首曲目吗？`, confirmDelete);
					else confirmDelete();
				} }}
			], 
			musicListInfo: {name: name}, 
			force: force
		});
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
		array.push(({ label: "创建新歌单", icon: "F4B2", click: () => {this.add(callback);} }));
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



// 歌曲&扩展包拖放
document.documentElement.ondragover = e => {
	e.preventDefault();
	if ((document.getElementById("extensionPage").hidden) && 
		(document.getElementById("musicListContainer").hidden || 
		!document.querySelector("#musicListContainer>.show") ||
		!document.querySelector("#musicListContainer>.show").dataset.musicListId.startsWith("musiclist-"))
	) return;
	if (e.dataTransfer.types.includes("Files")) {
		document.body.classList.add("dragOver");
		document.getElementById("dropTip").style.left = e.clientX + 10 > document.documentElement.clientWidth - 160 ? document.documentElement.clientWidth - 165 : e.clientX + 10 + "px";
		document.getElementById("dropTip").style.top = e.clientY + 30 + "px";
		document.getElementById("dropTipText").textContent = document.getElementById("musicListContainer").hidden ? "松手安装扩展" : "松手加入当前歌单";
	}
};
document.documentElement.ondrop = e => {
	e.preventDefault();
	if ((document.getElementById("extensionPage").hidden) && 
		(document.getElementById("musicListContainer").hidden || 
		!document.querySelector("#musicListContainer>.show") ||
		!document.querySelector("#musicListContainer>.show").dataset.musicListId.startsWith("musiclist-"))
	) return;
	document.body.classList.remove("dragOver");
	if (e.dataTransfer.types.includes("Files")) {
		if (!document.getElementById("musicListContainer").hidden) {
			const currentMusicList = document.querySelector("#musicListContainer>.show").dataset.musicListId;
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
		} else {
			const file = e.dataTransfer.files[0];
			ExtensionRuntime.install(file);
		}
	}
};
document.documentElement.ondragleave = () => {
	document.body.classList.remove("dragOver");
};



// 音乐搜索
Search = {
	async switchSearch() {
		if (document.getElementById("searchBtn").classList.contains("active")) return;
		document.getElementById("searchSubmitBtn").disabled = false;
		document.querySelectorAll(".left .leftBar div").forEach(ele => ele.classList.remove("active"));
		document.getElementById("searchBtn").classList.add("active");
		const searchSource = document.getElementById("searchSource");
		if (!searchSource.innerHTML) {
			const extData = await ExtensionRuntime.getExtData();
			for (const name in ExtensionConfig) {
				if (ExtensionConfig[name].search) {
					searchSource.innerHTML += `<option value="${name}">${SimMusicTools.escapeHtml(extData[name].uiName)}</option>`;
				}
			}
			document.getElementById("searchInput").onkeydown = e => {
				if (e.key === "Tab") {
					var currentOption = searchSource.options[searchSource.selectedIndex];
					var nextOption = currentOption.nextElementSibling;
					if (nextOption) searchSource.selectedIndex = searchSource.selectedIndex + 1;
					else searchSource.selectedIndex = 0;
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
			config.setItem("devMode", 1);
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
				renderMusicList(data.files ?? [], {
					uniqueId: "search",
					dontRenderBeforeLoaded: true, 
					errorText: "暂无搜索结果", 
					menuItems: data.menu ?? [], 
					force: true, 
					highlightWords: SimMusicTools.naturalSplit(keyword),
					finishCallback() { Search.loadIndicatorStatus(); btn.disabled = false; }
				});
				document.getElementById("searchBottomIndicator").dataset.status = "";
			})
			.catch(err => {
				if (!btn.disabled) return;
				Search.hasMore = false;
				Search.loadIndicatorStatus();
				showErrorOverlay(err);
			});
		}, 200);
	},
	loadMore() {
		if (this.hasMore) {
			const searchBottomIndicator = document.getElementById("searchBottomIndicator");
			if (searchBottomIndicator.dataset.status == "loading") return;
			document.getElementById("searchBottomIndicator").style = "";
			searchBottomIndicator.dataset.status = "loading";
			searchBottomIndicator.textContent = "正在加载更多...";
			const currentKeyword = this.currentSearchKeyword;
			setTimeout(() => {
				ExtensionConfig[this.currentSearchExt].search(currentKeyword, this.searchPage + 1)
				.then((data) => {
					if (this.currentSearchKeyword != currentKeyword) return;
					searchBottomIndicator.dataset.status = "";
					renderMusicList(getCurrentMusicList().concat(data.files ?? []), {
						uniqueId: "search",
						dontRenderBeforeLoaded: true, 
						errorText: "暂无搜索结果", 
						menuItems: data.menu ?? [],
						force: true, 
						finishCallback: this.loadIndicatorStatus,
						highlightWords: SimMusicTools.naturalSplit(currentKeyword),
					});
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
function renderMusicList(files, args, isFinalRender) {
	if (!args.errorText) args.errorText = "当前歌单为空";
	if (!args.menuItems) args.menuItems = [];
	if (!args.musicListInfo) args.musicListInfo = {};
	// 获取或创建当前的歌单容器
	const musicListContainer = document.getElementById("musicListContainer");
	let containerElement, templateElement;
	musicListContainer.querySelectorAll("div[data-music-list-id]").forEach(div => {
		div.classList.remove("show");
		if (div.dataset.musicListId == "template") templateElement = div;
		if (div.dataset.musicListId == args.uniqueId) containerElement = div;
	});
	if (!containerElement) {
		containerElement = templateElement.cloneNode(true);
		containerElement.dataset.musicListId = args.uniqueId;
		musicListContainer.appendChild(containerElement);
	}
	containerElement.classList.add("show");
	// 获取或创建当前的音乐列表
	let musicListContent = containerElement.querySelector(".musicListContent");
	if (!musicListContent) {
		musicListContent = templateElement.querySelector(".musicListContent").cloneNode(true);
		containerElement.appendChild(musicListContent);
	}
	// 首次渲染
	if (!isFinalRender) {
		// 切换页面
		if (args.uniqueId != "search") switchRightPage("musicListContainer");
		unselectAll();
		if (args.uniqueId != "search") {
			// 渲染歌单顶部信息栏
			containerElement.querySelector(".musicListName").textContent = args.musicListInfo.name ?? "歌单标题";
			containerElement.querySelector(".folderDir").hidden = !args.musicListInfo.dirName;
			containerElement.querySelector(".musicListDir").textContent = args.musicListInfo.dirName;
			containerElement.querySelector(".musicListNum").textContent = files.length;
			// 防止重复渲染 提升性能
			if (files.length == containerElement.dataset.fileLength && !args.force) return;
			containerElement.dataset.fileLength = files.length;
			// 清空容器，搜索除外
			musicListContent.innerHTML = "";
		}
	}
	// 处理一些其他元素
	if (isFinalRender || !args.dontRenderBeforeLoaded) {
		containerElement.querySelector(".musicListErrorOverlay").hidden = true;
		document.getElementById("searchSubmitBtn").disabled = false;
	}
	// 读取索引并渲染列表
	SimMusicTools.readMusicIndex(musicIndex => {
		const renderObject = [];
		lastMusicIndex = musicIndex;
		if (!isFinalRender) {
			updateMusicIndex(files, () => { renderMusicList(files, args, true); });
			if (args.dontRenderBeforeLoaded) return;
		} else {
			if (args.finishCallback) args.finishCallback();
		}
		files.forEach(name => {
			if (musicIndex[name]) renderObject.push([name, musicIndex[name]]);
			else renderObject.push([name, {}]);
		});
		musicListContent.innerHTML = "";
		let totalTime = 0;
		// 歌曲高亮
		const highlightProcess = args.highlightWords ? html => {
			const regexParts = args.highlightWords.reduce((acc, keyword) => {
				// 小于3个字符的西文字母 全词匹配
				if (keyword.length < 3 && /^[A-Za-z]+$/.test(keyword)) acc.shortKeywords.push("\\b" + keyword + "\\b");
				else acc.longKeywords.push(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"));
				return acc;
			}, { shortKeywords: [], longKeywords: [] });
			const keywordRegex = new RegExp(regexParts.shortKeywords.concat(regexParts.longKeywords).join("|"), "gi");
			let highlightedText = html.replace(keywordRegex, "<m>$&</m>");
			highlightedText = highlightedText.replaceAll("</m> <m>", " ");
			return highlightedText;
		} : html => { return html; }
		const maxIndexDigits = renderObject.length.toString().length;
		renderObject.forEach((music, originalIndex) => {
			// 创建元素
			let tr;
			tr = document.createElement("tr");
			tr.dataset.file = music[0];
			if (isFinalRender) coverObserver.observe(tr);
			const htmlTitle = SimMusicTools.escapeHtml(music[1].title ?? SimMusicTools.getTitleFromPath(music[0]));
			const htmlArtist = SimMusicTools.escapeHtml(music[1].artist ?? "正在读取");
			const htmlAlbum = SimMusicTools.escapeHtml(music[1].album ?? SimMusicTools.getDefaultAlbum(music[0]));
			tr.innerHTML = `
				<td><img src="assets/placeholder.svg" onerror="this.src='assets/placeholder.svg'"></td>
				<td>${highlightProcess(htmlTitle)}</td>
				<td>${highlightProcess(htmlArtist)}</td>
				<td>${highlightProcess(htmlAlbum)}</td>
				<td>${SimMusicTools.formatTime(music[1].time)}</td>
				<td hidden>${originalIndex.toString().padStart(maxIndexDigits, "0")}</td>`;
			// 绑定点击事件
			if (isFinalRender) {
				tr.oncontextmenu = e => {
					if (!tr.classList.contains("selected")) tr.click();
					handleMusicContextmenu(e, args.menuItems);
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
			}
			// 统计音乐时间
			if (music[1].time) totalTime += music[1].time;
			// 加入列表
			musicListContent.appendChild(tr);
		});
		// 排序相关
		if (args.uniqueId != "search") {
			const headCells = containerElement.querySelectorAll("thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(4)");
			headCells.forEach(th => {
				th.onclick = () => { setMusicListSort(th.cellIndex); };
			});
			loadMusicListSort();
		}
		// 其他处理
		if (isFinalRender && args.uniqueId != "search") containerElement.querySelector(".musicListTime").textContent = SimMusicTools.formatTime(totalTime, true);
		if (!musicListContent.innerHTML) showErrorOverlay(args.errorText);
		PlayerController.loadMusicListActive();
		containerElement.onclick = () => { musicListContent.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected")); };
		reloadMusicListCover();
	});
}
function setMusicListSort(thIndex) {
	let current = config.getItem("musicListSort");
	if (current[0] == thIndex) {
		current[1] ++;
		if (current[1] == 2) current = [5, 0];
	}
	else current = [thIndex, 0];
	config.setItem("musicListSort", current);
	loadMusicListSort();
}
function loadMusicListSort(restoreOrder) {
	const allTables = document.querySelectorAll(`#musicListContainer>div:not([data-music-list-id="search"]) table`);
	let sortConfig = config.getItem("musicListSort");
	// 进行排序前 先恢复一下原始顺序
	if (!restoreOrder) loadMusicListSort(true);
	else {
		if (sortConfig[1] != 5) sortConfig = [5, 0];
		else return;
	}
	const rowIndex = sortConfig[0];
	const rowSortNum = sortConfig[1] ? -1 : 1;
	for (const table of allTables) {
		table.querySelectorAll("thead th").forEach(th => {
			th.classList.remove("positiveOrder");
			th.classList.remove("reversedOrder");
			if (th.cellIndex == rowIndex) th.classList.add(sortConfig[1] ? "reversedOrder" : "positiveOrder");
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
function updateMusicIndex(allFiles, callback) {
	const existedFiles = Object.keys(lastMusicIndex);
	const files = allFiles.filter(file => !existedFiles.includes(file));
	let finished = -1;
	const record = () => {
		finished ++;
		if (!files.length) callback();
		else if (finished == files.length) SimMusicTools.writeMusicIndex(lastMusicIndex, () => {callback();});
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
		{ label: "开始播放", icon: "F509", click() {PlayerController.switchMusicWithList(files[0], list, true);} },
		{ label: "下一首播放", icon: "F0F9", click() {PlayerController.appendPlayList(files[0], true);} },
	]
	const multiFileOptions = [
		{ label: "在当前曲目后播放", icon: "F0F9", click() {PlayerController.appendPlayList(files, true);} },
		{ label: "添加到当前播放列表", icon: "F00F", click() {PlayerController.appendPlayList(files);} },
		{ label: "替换当前播放列表", icon: "F00D", click() {PlayerController.switchMusicWithList(files[0], files, true);} },
	]
	const commonOptions = [
		{ type: "separator" },
		{ label: "添加到歌单", icon: "EE0D", submenu: MusicList.getMenuItems(name => {MusicList.importToMusicList(name, files);}) },
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
	switchMusicWithList(file, list, showAP, isInit, audioPause) {
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
		this.switchMusic(file ? file : list[0], isInit, false, audioPause)
		.then(() => {if (showAP) SimAPUI.show();});
	},
	// 切歌
	async switchMusic(file, isInit, forceSwitch, audioPause) {
		SleepMode.checkManualOperation();
		if (!config.getItem("playList").includes(file)) return;
		if (document.body.classList.contains("musicLoading")) return;
		if (config.getItem("currentMusic") == file && !isInit && !forceSwitch) {
			SimAPUI.show();
			loadVolumeUi();
			return document.getElementById("audio").play();
		}
		document.getElementById("audio").pause();
		config.setItem("currentMusic", file);
		this.loadMusicListActive();
		const fileScheme = file.split(":")[0];
		if (!ExtensionConfig[fileScheme] || !ExtensionConfig[fileScheme].player || !ExtensionConfig[fileScheme].player.getPlayUrl || !ExtensionConfig[fileScheme].player.getLyrics) {
			shell.beep();
			return confirm("播放此曲目所需的扩展程序已损坏或被删除，是否将其从播放列表中移除？", () => {
				PlayerController.deleteFromList(config.getItem("currentMusic"));
			});
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
				play: !audioPause,
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
			if (div) document.getElementById("playList").appendChild(div);
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
				if (!activeDiv) return alert("当前没有正在播放的曲目。");
				divs.forEach(div => {
					if (div.dataset.file == file) activeDiv.insertAdjacentElement("afterend", div);
				});
				syncListFromDivs();
			} 
		} else {
			const div = this.createListElement(file);
			if (!div) return;
			if (!activeDiv) return alert("当前没有正在播放的曲目。");
			if (toNext)	activeDiv.insertAdjacentElement("afterend", div);
			else document.getElementById("playList").appendChild(div);
			syncListFromDivs();
		}
		SimAPControls.toggleList(1);
		SimAPUI.show();
	},
	// 创建列表元素（用于渲染列表&插入下一首播放）
	createListElement(file) {
		if (!lastMusicIndex[file]) return;
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
						PlayerController.stop();
					} else {
						SimAPControls.next(true);
					}
					this.loadMusicListActive();
				}
				return;
			}
		});
	},
	// 停止播放
	stop() {
		config.setItem("currentMusic", "");
		SimAPUI.hide();
		if (document.body.classList.contains("miniMode")) WindowOps.toggleMini();
		document.body.classList.remove("withCurrentMusic");
		document.getElementById("audio").remove();
		const audio = document.createElement("audio");
		audio.id = "audio";
		document.body.appendChild(audio);
		loadVolumeUi();
		document.title = "SimMusic";
		eqAudioContext = eqSource = null;
		this.loadMusicListActive();
	},
	// 渲染歌单界面播放中歌曲
	loadMusicListActive() {
		const currentMusic = config.getItem("currentMusic");
		document.querySelectorAll(".musicListContent>tr").forEach(tr => {
			tr.classList[tr.dataset.file == currentMusic ? "add" : "remove"]("active");
		});
		document.querySelectorAll("#musicListContainer>div").forEach(div => {
			const activeMusic = div.querySelector("tr.active");
			const musicLocator = div.querySelector(".musicLocator");
			const tableContainer = div.querySelector(".tableContainer")
			if (activeMusic && config.getItem("showLocator")) {
				musicLocator.classList.remove("hidden");
				musicLocator.onclick = () => {
					musicLocator.classList.add("hidden");
					activeMusic.scrollIntoView({block: "center", behavior: "smooth"});
					setTimeout(() => {activeMusic.classList.add("selected");}, 200);
					setTimeout(() => {activeMusic.classList.remove("selected");}, 500);
				};
				tableContainer.onwheel = () => {
					musicLocator.classList.remove("hidden");
				};
			} else {
				musicLocator.classList.add("hidden");
				tableContainer.onwheel = null;
			}
		});
		document.querySelectorAll("#playList>div").forEach(div => {
			if (div.dataset.file == currentMusic) {
				div.classList.add("active");
				if (!PlayerController.listScrollLock) {
					PlayerController.listScrollLock = true;
					setTimeout(() => { div.scrollIntoView({behavior: "smooth", block: "center"}); }, 100);
					setTimeout(() => { PlayerController.listScrollLock = false; }, 500);
				}
			} else div.classList.remove("active");
		});
		loadThemeImage();
	},
	// 播放菜单
	showPlayerMenu() {
		const audio = document.getElementById("audio");
		let menu = [];
		let playerMenu = [
			{
				label: "播放速度",
				icon: "F371",
				type: "sub",
				submenu: [.7, .9, 1, 1.1, 1.2, 1.5].map(speed => {
					return {
						label: speed == 1 ? "原始速度" : speed + " 倍速",
						icon: audio.playbackRate == speed ? "EB7B" : " ",
						click() {audio.playbackRate = speed;}
					};
				}).concat([
					{ type: "separator" },
					{
						label: "自定义...",
						icon: "F0EE",
						click() {
							prompt("请输入自定义倍速...", speed => {
								speed = Number(speed);
								if (!speed || speed < 0 || speed > 10) return alert("倍速值无效。");
								audio.playbackRate = speed;
							});
						}
					}
				]),
			},
			SleepMode.status ? {
				label: "退出睡眠定时",
				icon: "EF75",
				click() {SleepMode.exit();}
			} : {
				label: "睡眠定时",
				icon: "EF75",
				type: "sub",
				submenu: [5, 10, 15, 30, 60].map(time => {
					return {
						label: time + " 分钟",
						click() {SleepMode.setTime(time);}
					};
				}).concat([
					{ type: "separator" },
					{
						label: "自定义...",
						icon: "F0EE",
						click() {
							prompt("请输入倒计时（分钟）...", time => {
								time = Number(time);
								if (!time || time < 0 || time > 120) return alert("倒计时无效，请输入 120 分钟以内的有效时间。");
								SleepMode.setTime(time);
							});
						}
					}
				]),
			},
			{
				label: "停止播放",
				icon: "F3DD",
				click: () => {PlayerController.stop();},
			}, 
			{type: "separator"},
			{
				label: document.body.classList.contains("fullscreen") ? "退出全屏" : "播放页全屏",
				icon: document.body.classList.contains("fullscreen") ? "ED9A" : "ED9C",
				click: SimAPUI.toggleFullScreen,
			},
			{
				label: "均衡器",
				icon: "F407",
				click: openEqConfig,
			},
		];
		const file = config.getItem("currentMusic");
		const fileScheme = file.split(":")[0];
		try {
			if (ExtensionConfig[fileScheme].player.getPlayerMenu) 
				menu = ExtensionConfig[fileScheme].player.getPlayerMenu(file);
		} catch {}
		if (menu.length) playerMenu = playerMenu.concat([{type: "separator"}], menu);
		new ContextMenu(playerMenu).popup([event.clientX, event.clientY]);
	}
}
if (!config.getItem("lrcShow")) document.body.classList.add("hideLyrics");
const loadPlayColor = () => { document.body.classList[config.getItem("playBtnColor") ? "add" : "remove"]("playBtnColor"); }
config.listenChange("playBtnColor", loadPlayColor); loadPlayColor();
const load3dEffect = () => { document.body.classList[config.getItem("3dEffect") ? "add" : "remove"]("threeEffect"); }
config.listenChange("3dEffect", load3dEffect); load3dEffect();
const loadAlbumScale = () => { document.body.classList[config.getItem("albumScale") ? "add" : "remove"]("albumScale"); }
config.listenChange("albumScale", loadAlbumScale); loadAlbumScale();
if (config.getItem("devMode", 1)) document.getElementById("devBtn").hidden = false;
config.listenChange("showLocator", PlayerController.loadMusicListActive);



// 睡眠定时
SleepMode = {
	setTime(time) {
		this.status = [new Date().getTime(), time];
		this.loadStatus();
		this.intervalId = setInterval(() => {SleepMode.loadStatus();}, 990);
	},
	loadStatus() {
		if (!this.status) this.exit();
		const currentTime = new Date().getTime();
		const offset = currentTime - this.status[0];
		document.body.classList.add("sleepMode");
		const indicatorTime = Math.round(this.status[1] * 60 - offset / 1000);
		document.querySelector(".controls .infoBar i").textContent = indicatorTime < 0 ? ("+" + SimMusicTools.formatTime(0 - indicatorTime)) : SimMusicTools.formatTime(indicatorTime);
		if (offset / 1000 / 60 > this.status[1]) this.endTime();
	},
	endTime() {
		const audio = document.getElementById("audio");
		if (!audio.paused && config.getItem("sleepModePlayEnd")) {
			this.status[2] = true;
		} else {
			if (!audio.paused) SimAPControls.togglePlay();
			this.exit();
			this.execOperation();
		}
	},
	execOperation() {
		if (config.getItem("sleepModeOperation") != "none") ipcRenderer.invoke("shutdownCountdown");
		else alert("睡眠定时结束，已暂停音乐播放。");
	},
	checkManualOperation() {
		if (this.status && this.status[2]) {
			alert("已退出睡眠定时。");
			this.exit();
		}
	},
	checkMusicSwitch() {
		if (this.status && this.status[2]) {
			this.exit();
			this.execOperation();
			return true;
		}
	},
	exit() {
		document.body.classList.remove("sleepMode");
		document.querySelector(".controls .infoBar i").innerHTML = "&#xEF77;";
		clearInterval(this.intervalId);
		this.status = null;
	}
}


// 均衡器
function openEqConfig() {
	modalWindow("modal-eq.html", 300);
}
let eqAudioContext, eqSource;
let eqCurrentFilters = [];
function applyEq() {
	const data = config.getItem("eqProfile") == "basic" ? config.getItem("eqConfBasic") : config.getItem("eqConfPro");
	try {
		const audioElement = document.getElementById("audio");
		if (!eqAudioContext) eqAudioContext = new AudioContext();
		if (!eqSource) eqSource = eqAudioContext.createMediaElementSource(audioElement);
		eqCurrentFilters.forEach(filter => {
			try {
				eqSource.disconnect(filter);
				filter.disconnect(eqAudioContext.destination);
			} catch {}
		});
		const filters = data.map(item => {
			const filter = eqAudioContext.createBiquadFilter();
			filter.type = "peaking";
			filter.frequency.value = item.F;
			filter.gain.value = item.G;
			filter.Q.value = item.Q;
			return filter;
		});
		let lastNode = eqSource;
		filters.forEach(filter => {
			lastNode.connect(filter);
			lastNode = filter;
		});
		lastNode.connect(eqAudioContext.destination);
		eqCurrentFilters = filters;
	} catch {}
}



// 主界面主题图片
function loadThemeImage() {
	if (!config.getItem("themeImage")) document.body.classList.remove("themeImage");
	else {
		const themeImage = document.getElementById("themeImage");
		switch (config.getItem("themeImageType")) {
			case "cover":
				if (config.getItem("currentMusic")) {
					document.body.classList.add("themeImage");
					themeImage.src = document.getElementById("album").src;
				} else {
					document.body.classList.remove("themeImage");
				}
				break;
			case "local":
				document.body.classList.add("themeImage");
				themeImage.src = config.getItem("themeImagePath");
				break;
		}
		themeImage.style.filter = config.getItem("themeImageBlur") ? "blur(20px)" : "none";
	}
}
document.getElementById("themeImage").onerror = () => {
	document.body.classList.remove("themeImage");
};
config.listenChange("themeImage", loadThemeImage);
config.listenChange("themeImageType", value => {
	config.setItem("themeImagePath", "");
	if (value == "local") {
		const fileInput = document.createElement("input");
		fileInput.type = "file";
		fileInput.accept = "image/*";
		fileInput.multiple = false;
		fileInput.click();
		fileInput.onchange = e => {
			const file = e.target.files[0];
			if (file) config.setItem("themeImagePath", file.path);
		};
	}
});
config.listenChange("themeImagePath", loadThemeImage);
config.listenChange("themeImageBlur", loadThemeImage);



// 歌曲下载
const DownloadController = {
	getMenuItems() {
		const array = [];
		const lists = config.getItem("folderLists");
		lists.forEach(name => array.push({
			label: name,
			click: () => {DownloadController.addTask(name);}
		}));
		if (lists.length) array.push(({ type: "separator" }));
		array.push(({
			label: Object.keys(lists).length ? "选择其他目录" : "选择目录",
			icon: "ED70",
			click: () => { ipcRenderer.invoke("pickFolder").then(dir => { DownloadController.addTask(dir); }); } 
		}));
		return {type: ["single", "multiple"], content: { label: "下载到本地", icon: "EC5A", submenu: array },};
	},
	addTask(destination) {
		const files = getCurrentSelected();
		updateMusicIndex(files, () => {
			const downloadContainer = document.getElementById("downloadContainer");
			files.forEach(file => {
				if (lastMusicIndex[file]) {
					const div = document.createElement("div");
					div.dataset.file = file;
					div.dataset.destination = destination;
					div.dataset.status = "pending";
					div.innerHTML = `
						<div class="progressBar"></div>
						<div class="info">
							<div class="music">
								<b>${lastMusicIndex[file].title} - ${lastMusicIndex[file].artist}</b>
								<span><i></i> <span class="progressText">正在等待下载</span></span>
							</div>
							<div class="buttons">
								<i class="errorOnly" title="重试">&#xF33D;</i>
								<i class="successOnly" title="播放">&#xF509;</i>
								<i class="successOnly" title="在资源管理器中显示">&#xED6A;</i>
								<i class="successOnly" title="删除任务和文件">&#xEC2A;</i>
								<i title="删除任务">&#xF4C8;</i>
							</div>
						</div>`;
					div.querySelector(".buttons i:nth-child(1)").onclick = () => { // 重试
						div.dataset.status = "pending";
						div.querySelector(".progressText").textContent = "正在等待下载";
						div.style.setProperty("--progressWidth", "0%");
						DownloadController.loadDownloadStatus();
					}
					div.querySelector(".buttons i:nth-child(2)").onclick = () => { // 播放
						const smFile = "file:" + div.dataset.fileName;
						updateMusicIndex([smFile], () => {
							PlayerController.switchMusicWithList(smFile, [smFile]);
						});
					}
					div.querySelector(".buttons i:nth-child(3)").onclick = () => { // 资源管理器
						shell.showItemInFolder(div.dataset.fileName);
					}
					div.querySelector(".buttons i:nth-child(4)").onclick = () => { // 删除文件
						confirm("确实要删除此任务与本地已下载的文件吗？", () => {
							PlayerController.deleteFromList("file:" + div.dataset.fileName);
							try { fs.unlinkSync(div.dataset.fileName); } catch {}
							try { if (div.dataset.lrcPath) fs.unlinkSync(div.dataset.lrcPath); } catch {}
							div.remove();
						})
					}
					div.querySelector(".buttons i:nth-child(5)").onclick = () => { // 删除任务
						div.remove();
					}
					downloadContainer.appendChild(div);
				}
			});
			DownloadController.loadDownloadStatus();
		});
		document.querySelector('.left div[data-page-id="downloadPage"]').hidden = false;
	},
	loadDownloadStatus() {
		const currentDownloadingCount = document.querySelectorAll("#downloadContainer>div[data-status='download']").length;
		if (currentDownloadingCount < config.getItem("parallelDownload") && document.querySelector("#downloadContainer>div[data-status='pending']")) {
			this.downloadFile();
			if (currentDownloadingCount + 1 < config.getItem("parallelDownload")) this.loadDownloadStatus();
		}
	},
	async downloadFile() {
		const element = document.querySelector("#downloadContainer>div[data-status='pending']");
		if (!element) return;
		const updateDownloadStatus = (status, text, progress = 0) => {
			element.dataset.status = status;
			element.querySelector(".progressText").textContent = text;
			element.style.setProperty("--progressWidth", progress + "%");
			DownloadController.loadDownloadStatus();
		}
		// 获取歌曲信息
		updateDownloadStatus("download", "正在获取下载地址");
		const file = element.dataset.file;
		const destination = element.dataset.destination;
		const fileScheme = file.split(":")[0];
		const downUrl = await ExtensionConfig[fileScheme].player.getPlayUrl(file, true);
		// 发起网络请求
		updateDownloadStatus("download", "正在连接下载地址");
		const xhr = new XMLHttpRequest();
		xhr.open("GET", downUrl, true);
		xhr.responseType = "arraybuffer";
		xhr.onprogress = event => {
			if (event.lengthComputable) {
				const percentComplete = Math.round((event.loaded / event.total) * 100);
				updateDownloadStatus("download", `正在下载 ${percentComplete}%`, percentComplete);
			} else {
				updateDownloadStatus("download", "正在下载曲目");
			}
		};
		xhr.onload = () => {
			updateDownloadStatus("download", "正在保存曲目", 100);
			const buffer = Buffer.from(xhr.response);
			const fileName = SimMusicTools.getWindowsLegalName(config.getItem("downloadFileName").replaceAll("[title]", lastMusicIndex[file].title).replaceAll("[artist]", lastMusicIndex[file].artist));
			const tempPath = path.join(destination, `${fileName}.simtemp`);
			const ws = fs.createWriteStream(tempPath);
			ws.on("finish", async () => {
				updateDownloadStatus("download", "正在写入元数据", 100);
				let coverArrBuffer;
				const coverData = lastMusicIndex[file].cover;
				if (typeof(coverData) == "object") coverArrBuffer = coverData;
				else {
					const coverRes = await fetch(coverData)
					coverArrBuffer = await coverRes.arrayBuffer();
				}
				let metadataResult,mediaFormat,fileExtension;
				try {
					mediaFormat = (await musicMetadata.parseFile(tempPath)).format.container.toLowerCase();
					const musicLyrics = lastMusicIndex[file].lyrics ? lastMusicIndex[file].lyrics : await ExtensionConfig[fileScheme].player.getLyrics(file);
					switch (mediaFormat) {
						case "flac":
							const flacOptions = { tagMap: {} };
							if (config.getItem("downloadMetadataTitle")) flacOptions.tagMap.title = lastMusicIndex[file].title;
							if (config.getItem("downloadMetadataArtist")) {
								flacOptions.tagMap.artist = lastMusicIndex[file].artist;
								flacOptions.tagMap.album = lastMusicIndex[file].album;
							}
							if (config.getItem("downloadMetadataLyrics") == 1) flacOptions.tagMap.lyrics = musicLyrics;
							if (config.getItem("downloadMetadataCover")) flacOptions.picture = { buffer: Buffer.from(coverArrBuffer) };
							await flacTagger.writeFlacTags(flacOptions, tempPath);
							metadataResult = true;
							fileExtension = "flac";
							break;
						default:
							const mpegOptions = {};
							if (config.getItem("downloadMetadataTitle")) mpegOptions.title = lastMusicIndex[file].title;
							if (config.getItem("downloadMetadataArtist")) {
								mpegOptions.artist = lastMusicIndex[file].artist;
								mpegOptions.album = lastMusicIndex[file].album;
							}
							if (config.getItem("downloadMetadataLyrics") == 1) mpegOptions.unsynchronisedLyrics = {
								language: "XXX",
								text: musicLyrics
							};
							if (config.getItem("downloadMetadataCover")) mpegOptions.image = {
								type: {id: 3, name: "front cover"},
								imageBuffer: Buffer.from(coverArrBuffer)
							};
							metadataResult = nodeId3.write(mpegOptions, tempPath);
							fileExtension = "mp3";
							break;
					}
					if (config.getItem("downloadMetadataLyrics") == 2) {
						const lrcPath = path.join(destination, `${fileName}.lrc`);
						element.dataset.lrcPath = lrcPath;
						fs.writeFileSync(lrcPath, musicLyrics);
					}
				} catch (err){console.log(err)}
				if (metadataResult) {
					const renameResult = this.renameDownloadFile(destination, fileName, fileExtension)
					if (renameResult) {
						updateDownloadStatus("success", "曲目下载成功", 100);
						element.dataset.fileName = renameResult;
					}
					else updateDownloadStatus("error", "曲目写入失败", 0);
				} else {
					updateDownloadStatus("error", "曲目元数据写入失败", 0);
				}
			});
			ws.on("error", () => { updateDownloadStatus("error", "曲目保存失败", 0); });
			ws.write(buffer);
			ws.end();
		};
		xhr.onerror = () => {
			updateDownloadStatus("error", "曲目下载失败", 0);
		};
		xhr.send();
	},
	renameDownloadFile(dir, filename, ext) {
		try {
			const originalFile = path.join(dir, `${filename}.simtemp`);
			const baseTargetFile = path.join(dir, `${filename}.${ext}`);
			let targetFile = baseTargetFile;
			let count = 1;
			// 序号递增
			while (fs.existsSync(targetFile)) { targetFile = path.join(dir, `${filename} (${count++}).mp3`); }
			fs.renameSync(originalFile, targetFile);
			return targetFile;
		} catch (err) {
			return false;
		}
	}
}



// 迷你模式相关
let miniModeStatusTimeout;
function setMiniModeStatus(text) {
	if (!document.body.classList.contains("miniMode")) return;
	document.body.classList.add("miniModeStatus");
	document.getElementById("miniModeStatus").textContent = text;
	clearTimeout(miniModeStatusTimeout);
	miniModeStatusTimeout = setTimeout(() => {document.body.classList.remove("miniModeStatus");}, 1000);
}



// 系统集成
config.listenChange("systemMenu", value => {ipcRenderer.invoke("regFileExt", value);})
ipcRenderer.on("fileLaunch", (_event, file) => {
	file = "file:" + file;
	updateMusicIndex([file], () => {
		const list = config.getItem("playList");
		if (list.includes(file)) PlayerController.switchMusic(file);
		else PlayerController.switchMusicWithList(file, [file].concat(list));
		SimAPUI.show();
	});
});




// 设置页面
navigator.storage.estimate().then(size => {
	const humanSize = SimMusicTools.humanSize(size.usageDetails.indexedDB ?? 0);
	const settingsObject = {
		type: "button",
		text: `清理索引缓存`,
		badges: [`<i>&#xEC16;</i> ${humanSize}`],
		description: "定期清理可保持 SimMusic 运行性能；若您更改了音频元数据，亦可在此清理缓存以重新读取。",
		button: "清理",
		onclick: () => { SimMusicTools.writeMusicIndex({}, () => { alert("索引数据已清除，按「确定」重载此应用生效。", () => { ipcRenderer.invoke("restart"); }); });
	}};
	SettingsPage.data.splice(5, 0, settingsObject);
});

const SettingsPage = {
	data: [
		{type: "title", text: "通用配置"},
		{type: "boolean", text: "不驻留后台进程", description: "关闭主界面时停止播放并完全退出应用。", configItem: "disableBackground"},
		{type: "boolean", text: "注册系统菜单", badges: ["experimental"], description: "开启后，您可以在音频文件右键的「打开方式」菜单中选择 SimMusic 进行播放。在移动 SimMusic 程序目录或移除 SimMusic 前，您需要先关闭此选项。", configItem: "systemMenu"},
		{type: "select", text: "更新下载源", description: "在境内连接 GitHub 官方源可能导致下载速度极慢或下载失败。", options: [["", "GitHub 官方源"], ["https://ghp.ci/", "GHProxy 镜像"], ["https://gh.wwvw.top/", "CloudFlare"]], configItem: "updatePrefix"},
		{type: "title", text: "音频扫描"},
		{type: "input", text: "本地音频格式", description: "扫描本地音乐与导入本地文件时识别的音频文件扩展名，以空格分隔。", configItem: "musicFormats"},
		{type: "title", text: "歌单界面"},
		{type: "boolean", text: "显示「曲目定位」按钮", configItem: "showLocator"},
		{type: "boolean", text: "对播放按钮应用主题色", configItem: "playBtnColor"},
		{type: "boolean", text: "启用主题图片", description: "在 SimMusic 主界面显示主题图片。", configItem: "themeImage"},
		{type: "select", text: "选择主题图片", options: [["cover", "曲目封面"], ["local", "本地文件"]], configItem: "themeImageType", attachTo: "themeImage"},
		{type: "boolean", text: "图片模糊效果", configItem: "themeImageBlur", attachTo: "themeImage"},
		{type: "title", text: "播放界面"},
		{type: "boolean", text: "播放页深色模式", configItem: "darkPlayer"},
		{type: "boolean", text: "背景动态混色", description: "关闭后可减少播放页对硬件资源的占用。", configItem: "backgroundBlur"},
		{type: "boolean", text: "3D 特效", badges: ["experimental"], description: "在播放页的歌曲信息、播放列表与歌词视图使用 3D 视觉效果。", configItem: "3dEffect"},
		{type: "boolean", text: "专辑封面缩放", description: "在按下「播放」或「暂停」时对播放页专辑封面使用缩放动效。", configItem: "albumScale"},
		{type: "title", text: "播放控制"},
		{type: "boolean", text: "快速重播", description: "在曲目即将结束时按「快退」按钮以回到当前曲目的开头。", configItem: "fastPlayback"},
		{type: "boolean", text: "音频淡入淡出", description: "在按下「播放」或「暂停」时对音频的输出音量使用渐变效果。", configItem: "audioFade"},
		{type: "button", text: "均衡器", button: "配置", onclick: openEqConfig},
		{type: "title", text: "睡眠定时"},
		{type: "boolean", text: "延长时间至曲目结尾", description: "在曲目结尾后再暂停播放；在延长时间时执行暂停、切歌操作将会退出睡眠定时。", configItem: "sleepModePlayEnd"},
		{type: "select", text: "定时结束后", options: [["none", "不执行操作"], ["shutdown", "关机"], ["sleep", "休眠"]], description: "选择「关机」或「休眠」时，SimMusic 将在执行操作前 60 秒弹出提示，若您还需使用设备，可随时取消。", configItem: "sleepModeOperation"},
		{type: "title", text: "歌词视图"},
		{type: "boolean", text: "层级虚化", description: "若无需虚化效果或需要提升性能可关闭此功能。", configItem: "lyricBlur"},
		{type: "select", text: "文字对齐", options: [["left", "左端对齐"], ["center", "居中对齐"]], description: "此配置项切换曲目生效。", configItem: "lyricAlign"},
		{type: "range", text: "歌词字号", configItem: "lyricSize", min: 1, max: 3},
		{type: "range", text: "歌词间距", configItem: "lyricSpace", min: .2, max: 1},
		{type: "boolean", text: "歌词多语言支持", description: "开启后，时间戳一致的不同歌词将作为多语言翻译同时渲染。此配置项切换曲目生效。", configItem: "lyricMultiLang"},
		{type: "range", text: "歌词翻译字号", description: "同时控制歌词视图与桌面歌词中的翻译字号。", attachTo: "lyricMultiLang" ,configItem: "lyricTranslation", min: .5, max: 1},
		{type: "title", text: "桌面歌词"},
		{type: "boolean", text: "启动时打开", configItem: "autoDesktopLyrics"},
		{type: "boolean", text: "在截图中隐藏", description: "其他应用截图或录屏时隐藏桌面歌词的内容，与多数截图或录屏软件相兼容，支持 Windows 10 2004 以上版本及 Windows 11。此功能不会影响您查看歌词，对采集卡等外置硬件无效。", configItem: "desktopLyricsProtection"},
		{type: "boolean", text: "在播放页自动关闭", description: "当 SimMusic 主窗口打开播放页时自动关闭桌面歌词。", configItem: "desktopLyricsAutoHide"},
		{type: "boolean", text: "显示歌词翻译", configItem: "desktopLyricsTranslation", attachTo: "lyricMultiLang"},
		{type: "color", text: "字体颜色", configItem: "desktopLyricsColor"},
		{type: "boolean", text: "启用边框", configItem: "desktopLyricsStrokeEnabled"},
		{type: "color", text: "边框颜色", attachTo: "desktopLyricsStrokeEnabled", configItem: "desktopLyricsStroke"},
		{type: "range", text: "字体大小", configItem: "desktopLyricsSize", min: 20, max: 60},
		{type: "range", text: "歌词区域宽度", configItem: "desktopLyricsWidth", min: 500, max: screen.width},
		{type: "boolean", text: "始终居中", description: "无视用户左右拖拽操作，保持桌面歌词在屏幕中央。", configItem: "desktopLyricsCentered"},
		{type: "title", text: "曲目下载"},
		{type: "select", text: "并行下载数", options: [[1, "1 首曲目"], [2, "2 首曲目"], [3, "3 首曲目"], [4, "4 首曲目"], [5, "5 首曲目"]], description: "下载在线歌曲时并行下载的任务数量。", configItem: "parallelDownload"},
		{type: "input", text: "命名格式", description: "可使用 [title] 表示歌曲名，[artist] 表示艺术家。SimMusic 会自动处理 Windows 无法写入的文件名。", configItem: "downloadFileName"},
		{type: "boolean", text: "写入曲目标题", configItem: "downloadMetadataTitle"},
		{type: "boolean", text: "写入艺术家与专辑名", configItem: "downloadMetadataArtist"},
		{type: "boolean", text: "写入专辑封面", configItem: "downloadMetadataCover"},
		{type: "select", text: "歌词下载方式", options: [[1, "嵌入音频文件"], [2, "独立存储"], [0, "不下载歌词"]], configItem: "downloadMetadataLyrics"},
	],
	init() {
		const settingsContainer = document.getElementById("settingsContainer");
		SettingsPage.loadElementHeight();
		if (settingsContainer.innerHTML) return;
		const badges = {
			"experimental": "<i>&#xED3F;</i> 实验性",
			"pending": "<i>&#xF4C8;</i> 暂未支持"
		};
		this.data.forEach(data => {
			const div = document.createElement("div");
			const normalContent = `
				<section>
					<div>
						${SimMusicTools.escapeHtml(data.text)}
						${data.badges ? data.badges.map(badge => `<badge>${badges[badge] ?? badge}</badge>`) : ""}
					</div>
					${data.description ? `<span>${SimMusicTools.escapeHtml(data.description)}</span>` : ""}
				</section>`;
			switch (data.type) {
				case "title":
					div.classList.add("title");
					div.textContent = data.text;
					break;
				case "boolean":
					div.classList.add("block");
					div.innerHTML = `${normalContent}<div class="toggle"></div>`;
					div.classList.add(config.getItem(data.configItem) ? "on" : "off");
					div.onclick = () => {
						const currentItem = config.getItem(data.configItem);
						config.setItem(data.configItem, !currentItem);
						div.classList[currentItem ? "remove" : "add"]("on");
						SettingsPage.loadElementFoldStatus();
					}
					break;
				case "range":
					div.classList.add("block");
					div.innerHTML = `${normalContent}<div class="range" min="${data.min}" max="${data.max}" value="${config.getItem(data.configItem)}"></div>`;
					const range = new SimProgress(div.querySelector(".range"));
					range.ondrag = value => { config.setItem(data.configItem, value); };
					break;
				case "input":
					div.classList.add("block");
					div.innerHTML = `${normalContent}<input type="${data.inputType ?? "text"}">`;
					const input = div.querySelector("input");
					input.value = config.getItem(data.configItem);
					input.autocomplete = input.spellcheck = false;
					input.onchange = () => { config.setItem(data.configItem, input.value); };
					break;
				case "select":
					div.classList.add("block");
					div.innerHTML = `${normalContent}<select></select>`;
					const select = div.querySelector("select");
					data.options.forEach(option => {
						const optionEle = document.createElement("option");
						optionEle.value = option[0];
						optionEle.textContent = option[1];
						select.appendChild(optionEle);
					});
					select.value = config.getItem(data.configItem);
					select.onchange = () => { config.setItem(data.configItem, select.value); };
					break;
				case "color":
					div.classList.add("block");
					div.innerHTML = `${normalContent}<div class="colorInput"><span></span><input type="color"></div>`;
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
					div.innerHTML = `${normalContent}<button class="sub">${SimMusicTools.escapeHtml(data.button)}</button>`;
					div.onclick = data.onclick;
					break;
			}
			if (data.attachTo) div.dataset.attachTo = data.attachTo;
			settingsContainer.appendChild(div);
			SettingsPage.loadElementHeight();
			SettingsPage.loadElementFoldStatus();
		});
		initInputMenu();
	},
	loadElementHeight() {
		document.querySelectorAll("#settingsContainer>div[data-attach-to]").forEach(div => {
			div.style.setProperty("--height", div.clientHeight + "px");
		});
	},
	loadElementFoldStatus() {
		document.querySelectorAll("#settingsContainer>div[data-attach-to]").forEach(div => {
			if (!config.getItem(div.dataset.attachTo)) div.classList.add("folded");
			else div.classList.remove("folded");
		});
	}
}
window.addEventListener("resize", SettingsPage.loadElementHeight);



// 输入框右键菜单
function initInputMenu() {
	document.querySelectorAll("input").forEach(input => {
		if (!input.oncontextmenu && !["date", "time", "file", "color", "button", "checkbox"].includes(input.type)) input.oncontextmenu = e => {
			const isFocused = getSelection().toString().trim() && (getSelection().anchorNode.contains(input) || getSelection().anchorNode == input);
			new ContextMenu([
				{
					label: "全选",
					icon: "F1FF",
					click() { input.select(); },
				},
				{
					label: "复制",
					icon: "ECD5",
					click() { document.execCommand("copy"); },
					disabled: !isFocused,
				},
				{
					label: "剪切",
					icon: "F0C1",
					click() { document.execCommand("cut"); },
					disabled: !isFocused,
				},
				{
					label: "粘贴",
					click() { document.execCommand("paste"); },
					icon: "EB91",
				},
			]).popup([e.clientX, e.clientY]);
		} 
	});
}
initInputMenu();



// 桌面歌词
function updateDesktopLyricsConfig() {
	ipcRenderer.invoke("updateDesktopLyricsConfig", config.getItem("desktopLyricsProtection"));
}
config.listenChange("desktopLyricsColor", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsStrokeEnabled", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsStroke", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsSize", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsProtection", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsWidth", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsTop", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsLeft", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsCentered", updateDesktopLyricsConfig);
config.listenChange("desktopLyricsTranslation", updateDesktopLyricsConfig);
updateDesktopLyricsConfig();
if (config.getItem("autoDesktopLyrics")) WindowOps.toggleLyrics();


// 关于页面
function initAboutPage() {
	document.querySelectorAll("#aboutPage a").forEach(a => {
		if (!a.onclick) a.onclick = () => {
			webview(`https://github.com/` + a.innerHTML, {width: 1100, height: 750});
		}
	});
	document.querySelectorAll("#aboutPage section").forEach(link => {
		if (!link.onclick) link.onclick = () => {
			webview(link.dataset.href, {width: 1100, height: 750});
		}
	});
	document.getElementById("copyrightYear").textContent = new Date().getFullYear();
}


// 检查更新
const ghRepo = "simsv-software/simmusic2024-windows";
let updateUrl;
fetch(`https://api.github.com/repos/${ghRepo}/releases/latest`)
.then(res => res.json())
.then(json => {
	if (json.name != SimMusicVersion) {
		document.querySelector(".leftBar>div[data-page-id='updatePage']").hidden = false;
		document.getElementById("updateInfo").innerHTML = marked.parse(json.body?.split("<!-- CL START -->")[1]?.split("<!-- CL END -->")[0] ?? "更新信息获取失败");
		document.getElementById("updateVersion").textContent = `版本 ${json.name} · 发布于 ${json.published_at.substring(0, 10)}`;
		if (json?.assets[0] && json?.assets[0]?.name == "auto-update-package") updateUrl = json?.assets[0]?.browser_download_url;
	}
});
function startUpdate() {
	if (!updateUrl) return document.getElementById("updateInfoBtn").click();
	modalWindow("modal-update.html?downUrl=" + `${config.getItem("updatePrefix")}${updateUrl}`, 160);
}
