
/*
 * SimMusic 内置本地音乐加载器
 * 亦可用作扩展开发示例以添加其他音乐源
 * 若无特殊说明，基本所有的file变量格式都是“scheme: + <id>”，自己开发时候请不要忘了添加scheme:前缀
 */


/**************** 基础配置 ****************/
// ExtensionRuntime在加载时会自动添加json中的scheme字段到ExtensionConfig下，所以无需担心ExtensionConfig.xxx是否存在
ExtensionConfig.file.uiName = "本地";
// 当没有config.setItem时，调用config.getItem会返回defaultConfig中的值
defaultConfig["folderLists"] = [];


/**************** 工具函数 ****************/
// 这些函数是插件自己需要的函数，个人推荐const一个object然后都用它存放，防止和主程序内置函数名冲突
const FileExtensionTools = {
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
						// 请务必以插件定义的“scheme:”开头，不然扫描元数据和获取播放链接的时候不知道问哪个插件调方法
						// 后面的随意，例如在线歌曲可以使用“xxmusic:114514”，用歌曲id来，你喜欢就好
						// 一首歌的内部id应该是唯一的（用于播放和元数据索引），不然歌曲索引的时候会重复请求数据，消耗无意义的资源
						list.push("file:" + fullPath);
					}
				}
			});
			return list;
		} catch { return []; }
	},
	formatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const milliseconds = ms % 1000;
		const formattedMinutes = minutes.toString().padStart(2, '0');
		const formattedSeconds = seconds.toString().padStart(2, '0');
		const formattedMilliseconds = milliseconds.toString();
	  	return `${formattedMinutes}:${formattedSeconds}.${formattedMilliseconds}`;
	},
	fileMenuItem: [
		{type: ["single"], content: { label: "在资源管理器显示", click() {shell.showItemInFolder(getCurrentSelected()[0])} }}
	]
}



/**************** 左侧导航 ****************/
// 如果你懒，这个字段可以不写，这样插件就没有左侧导航功能（你可以参考下面的写搜索功能）
ExtensionConfig.file.musicList = {
	// 这个函数用于处理用户点击歌单“加号”的事件
	// 如果没有（例如你的插件是自动同步一个用户的所有歌单），可以不写，这样加号图标就不会显示
	add(callback) {
		// 这里自己实现添加逻辑，简单输入可直接调内置的 prompt(placeholder:str, callback:function) 方法
		ipcRenderer.invoke("pickFolder")
		.then(dir => {
			if (!dir || !dir[0]) return;
			dir = dir[0].trim().replaceAll("/", "\\");
			// 内置config读取可用getItem
			const lists = config.getItem("folderLists");
			// 由于数据格式由开发者自行定义，重复导入 & 其他错误需要开发者自行处理
			if (dir.split("\\").length == 2 && !dir.split("\\")[1]) return alert("您不能导入磁盘根目录。");
			if (lists.includes(dir)) return alert("此目录已被添加到目录列表中。");
			lists.push(dir);
			// 内置config写入可用setItem
			config.setItem("folderLists", lists);
			// 导入成功后需开发者自行调用callback以更新左侧显示内容（必须），switchList以打开刚才导入的歌单（可选）
			callback();
			ExtensionConfig.file.musicList.switchList(dir);
		});
	},
	// 这个函数用于渲染左侧的歌单列表
	renderList(container) {
		const lists = config.getItem("folderLists");
		lists.forEach(name => {
			const spilitted = name.split("\\");
			const folderName = spilitted[spilitted.length - 1];
			// 创建一个div即可，可以不需要有类名
			const element = document.createElement("div");
			element.textContent = folderName;
			element.dataset.folderName = name;
			// 处理点击，一般直接switchList即可
			element.onclick = () => {this.switchList(name);};
			// 创建右键菜单，具体使用方法参考 zhujin917/3sqrt7-context-menu/README.md
			element.oncontextmenu = event => {
				new ContextMenu([
					{ label: "查看歌曲", click() {element.click();} },
					{ label: "在资源管理器中显示", click() {shell.openPath(name);} },
					{ type: "separator" },
					{ label: "添加到歌单", submenu: MusicList.getMenuItems(listName => {
						MusicList.importToMusicList(listName, FileExtensionTools.scanMusic(name));
						MusicList.switchList(listName, true);
					}) },
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
			// 把div附加到左侧界面，container会由ExtensionRuntime自动传入，无需担心是否存在
			container.appendChild(element);
		});
	},
	// 这个函数用于切换歌单
	switchList(name) {
		const spilitted = name.split("\\");
		// 统一调用renderMusicList即可，第二个参数需要传入一个用于识别“当前歌单”的唯一的参数，推荐使用插件名+歌单id以防重复
		// 如果你的scanMusic必须是异步的，可以先renderMusicList([], id)以切换界面，再renderMusicList(list, id)，id一样就可以
		// rML第三个参数请固定false，第4个参数指定是否进行预先渲染，如果为true则在二次渲染之前不会显示歌单（适用于在线歌曲必须要获取metadata的情况）
		renderMusicList(FileExtensionTools.scanMusic(name), "folder-" + name, false, false, "当前目录为空", FileExtensionTools.fileMenuItem, {
			name: spilitted[spilitted.length - 1],
			dirName: name,
		});
		// 这个用于把当前歌单标蓝，放在renderMusicList函数后运行，推荐借鉴我的写法在renderList函数里自己设一个dataset，然后遍历dataset
		document.querySelectorAll(".left .leftBar div").forEach(ele => {
			if (ele.dataset.folderName != name) ele.classList.remove("active");
			else ele.classList.add("active");
		});
	},
};


/**************** 获取数据 ****************/
// 这个函数用于读取音乐元数据，不管你是本地还是在线，无所谓你咋获取，最后都调callback(data)就行。
// 如果是在线的用fetch就更好做，直接修改我musicmetadata的promise就得
//【注意：读取失败可以返回null，各字段值可以没有】
ExtensionConfig.file.readMetadata = async (file) => {
	file = file.replace("file:", "");
	try {
		const metadata = await musicMetadata.parseFile(file);
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
		return {
			title: metadata.common.title,
			artist: metadataArtist,
			album: metadata.common.album ? metadata.common.album : file.split("\\")[file.split("\\").length - 2],
			time: metadata.format.duration,
			cover: metadataCover ? metadataCover : "",
			lyrics: nativeLyrics ? nativeLyrics : "",
		};
	} catch {
		return {};
	}
};


/**************** 歌曲播放 ****************/
ExtensionConfig.file.player = {
	// 这个函数用于获取播放地址，返回值可以是本地文件地址 / http(s)地址 / blob地址 / base64 dataurl，不成功可以用空参数调callback
	//【注意：读取失败return可以用空串】
	async getPlayUrl(file) {
		return file.replace("file:", "");
	},
	// 这个函数用于（在本地索引没有歌词的情况下获取歌词），例如在线播放时把歌词全部写到索引不太现实，就会调用这个方法直接读取
	//【注意：读取失败return可以用空串】
	async getLyrics(file) {
		file = file.replace("file:", "");
		const lastDotIndex = file.lastIndexOf(".");
		lrcPath = file.substring(0, lastDotIndex) + ".lrc";
		try {return fs.readFileSync(lrcPath, "utf8");}
		catch {
			let id3Lyrics = "";
			const id3LyricsArray = await nodeId3.Promise.read(file);
			if (id3LyricsArray && id3LyricsArray.synchronisedLyrics && id3LyricsArray.synchronisedLyrics[0]) {
				id3LyricsArray.synchronisedLyrics[0].synchronisedText.forEach(obj => {
					id3Lyrics += `[${FileExtensionTools.formatTime(obj.timeStamp)}]${obj.text}\n`;
				});
			}
			return id3Lyrics;
		}
	},
};


/**************** 歌曲搜索 ****************/
ExtensionConfig.file.search = async keyword => {
	let fileArray = [];
	let resultArray = [];
	config.getItem("folderLists").forEach(folder => {
		fileArray = fileArray.concat(FileExtensionTools.scanMusic(folder));
	});
	fileArray.forEach(file => {
		if (SimMusicTools.getTitleFromPath(file).includes(keyword)) resultArray.push(file);
		else if (lastMusicIndex[file]) {
			const songInfo = lastMusicIndex[file];
			const songInfoString = songInfo.title + songInfo.album + songInfo.artist;
			if (songInfoString.includes(keyword)) resultArray.push(file);
		}
	});
	return {files: resultArray, menu: FileExtensionTools.fileMenuItem, hasMore: false};
}