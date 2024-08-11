const SimAPTools = {
	getPalette(sourceImage) {
		// 读取图片数据
		const canvas = document.createElement("canvas");
		canvas.width = sourceImage.width;
		canvas.height = sourceImage.height;
		const ctx = canvas.getContext("2d");
		ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
		const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		// 读取图片颜色
		const pixelArray = [];
		const pixelCount = canvas.width * canvas.height;
		for (let i = 0, offset, r, g, b; i < pixelCount; i = i + Math.round(pixelCount / 500)) {
			offset = i * 4;
			r = pixels[offset + 0];
			g = pixels[offset + 1];
			b = pixels[offset + 2];
			pixelArray.push([r, g, b]);
		}
		return pixelArray;
	},
	getTopColors(sourceImage) {
		const colors = this.getPalette(sourceImage);
		let colorCounts = new Map();
		colors.forEach(color => {
			let found = false;
			for (let [mergedColor, count] of colorCounts) {
				const colorDistance = Math.sqrt(
					Math.pow(color[0] - mergedColor[0], 2) +
					Math.pow(color[1] - mergedColor[1], 2) +
					Math.pow(color[2] - mergedColor[2], 2)
				);
				if (colorDistance < 80) {
					const newColor = [
						Math.floor((mergedColor[0] * count + color[0]) / (count + 1)),
						Math.floor((mergedColor[1] * count + color[1]) / (count + 1)),
						Math.floor((mergedColor[2] * count + color[2]) / (count + 1))
					];
					colorCounts.delete(mergedColor);
					colorCounts.set(newColor, count + 1);
					found = true;
					break;
				}
			}
			if (!found) {
				colorCounts.set(color, 1);
			}
		});
		let sortedColors = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
		return sortedColors.slice(0, 4).map(entry => entry[0]);
	},
	formatTime(time) {
		let minutes = Math.floor(time / 60);
		let seconds = Math.floor(time % 60);
		return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
	},
}

const switchMusic = (playConfig) => {
	// 初始化界面
	document.getElementById("album").src = document.getElementById("albumBottom").src = playConfig.album;
	document.querySelector(".musicInfo>b").innerText = document.querySelector(".musicInfoBottom>b").innerText = playConfig.title;
	document.querySelector(".musicInfo>div").innerText = document.querySelector(".musicInfoBottom>div").innerText = playConfig.artist;
	document.getElementById("audio").src = playConfig.audio;
	if (playConfig.play) setTimeout(() => {document.body.classList.add("playing");});
	SimAPControls.loadLoop();
	document.title = playConfig.title + " - SimMusic";
	// 初始化背景
	document.getElementById("album").onload = () => {
		const themeColors = SimAPTools.getTopColors(document.getElementById("album"));
		document.getElementById("background").style.background = `rgb(${themeColors[0].join(",")})`;
		document.getElementById("animationCenter").style.background = `rgb(${themeColors[1] ? themeColors[1].join(",") : "255,255,255"})`;
		document.getElementById("animationLeft").style.background = `rgba(${themeColors[2] ? themeColors[2].join(",") : "255,255,255"},.8)`;
		document.getElementById("animationRight").style.background = `rgba(${themeColors[3] ? themeColors[3].join(",") : "255,255,255"},.6)`;
		const themeColorNum = 255 / (themeColors[0][0] + themeColors[0][1] + themeColors[0][2] + 1);
		document.body.style.setProperty("--SimAPTheme", `rgb(${themeColors[0].map(num => num * themeColorNum).join(",")})`);
	}
	// 初始化音频控件
	const audio = document.getElementById("audio");
	const current = document.getElementById("progressCurrent");
	const duration = document.getElementById("progressDuration");
	audio.onloadedmetadata = () => {
		document.body.classList.add("withCurrentMusic");
		SimAPProgress.max = SimAPProgressBottom.max = audio.duration;
		SimAPProgress.setValue(0); SimAPProgressBottom.setValue(0);
		duration.innerText = SimAPTools.formatTime(audio.duration);
		SimAPProgress.onchange = SimAPProgressBottom.onchange = value => { audio.currentTime = value; }
		if (playConfig.play) audio.play(); else audio.pause();
	};
	audio.ontimeupdate = () => {
		SimAPProgress.setValue(audio.currentTime); SimAPProgressBottom.setValue(audio.currentTime);
		current.innerText = SimAPTools.formatTime(audio.currentTime);
		document.body.classList[!audio.paused ? "add" : "remove"]("playing");
		navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
		ipcRenderer.invoke(audio.paused ? "musicPause" : "musicPlay");
	};
	audio.onended = () => {
		if (config.getItem("loop") == 1) { audio.duration = 0; audio.play(); }
		else SimAPControls.next();
	};
	audio.onerror = () => {
		document.body.classList.add("withCurrentMusic");
		shell.beep();
		setTimeout(() => {SimAPControls.next();}, 5000);
	};
	// 系统级控件
	navigator.mediaSession.metadata = new MediaMetadata({ title: playConfig.title, artist: playConfig.artist, artwork: [{ src: playConfig.album }],	});
	navigator.mediaSession.setActionHandler("play", SimAPControls.togglePlay);
	navigator.mediaSession.setActionHandler("pause", SimAPControls.togglePlay);
	navigator.mediaSession.setActionHandler("previoustrack", SimAPControls.prev);
	navigator.mediaSession.setActionHandler("nexttrack", SimAPControls.next);
	// 初始化歌词
	const slrc = new SimLRC(playConfig.lyrics);
	slrc.render(document.querySelector(".lyrics>div"), audio, {align: "left", lineSpace: config.getItem("lyricSpace"), activeColor: "var(--SimAPTheme)", normalColor: "rgba(0,0,0,.4)", callback: txt => {
		ipcRenderer.invoke("lrcUpdate", audio.currentTime, txt);
	}});
	SimAPControls.loadConfig();
};

const SimAPControls = {
	togglePlay() {
		document.body.classList[audio.paused ? "add" : "remove"]("playing");
		audio[audio.paused ? "play" : "pause"]();
		navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
		ipcRenderer.invoke(audio.paused ? "musicPause" : "musicPlay");
	},
	prev() {this.switchIndex(-1);},
	next() {this.switchIndex(1);},
	switchIndex(offset) {
		const list = config.getItem("playList");
		const currentPlayingIndex = list.indexOf(config.getItem("currentMusic"));
		let newIndex = currentPlayingIndex + offset;
		if (config.getItem("loop") == 2 && (newIndex < 0 || newIndex > list.length - 1)) {
			this.shufflePlaylist();
			newIndex = 0;
		}
		if (newIndex < 0) newIndex = list.length - 1;
		if (newIndex > list.length - 1) newIndex = 0;
		PlayerController.switchMusic(config.getItem("playList")[newIndex], false, true);
	},
	toggleLoop() {
		switch (config.getItem("loop")) {
			case 0: config.setItem("loop", 1); break;
			case 1:
				config.setItem("loop", 2);
				this.shufflePlaylist(true);
				break;
			case 2: config.setItem("loop", 0); break;
		}
		this.loadLoop();
	},
	shufflePlaylist(keepCurrent) {
		let shuffledList = config.getItem("playList").sort(() => Math.random() - 0.5);
		if (keepCurrent) {
			const currentPlayingIndex = shuffledList.indexOf(config.getItem("currentMusic"));
			const currentFirst = shuffledList[0];
			shuffledList[0] = shuffledList[currentPlayingIndex];
			shuffledList[currentPlayingIndex] = currentFirst;
		}
		PlayerController.replacePlayList(shuffledList);
	},
	loadLoop() {
		["loopList", "loopSingle", "loopRandom"].forEach(className => {document.body.classList.remove(className);})
		document.body.classList.add(["loopList", "loopSingle", "loopRandom"][config.getItem("loop")]);
	},
	toggleVolume() {
		const volIcon = document.querySelector(".volBtn i");
		if (document.body.classList.contains("volume") && event.target == volIcon) {
			this.toggleMuted();
		} else if (audio.muted) {
			this.toggleMuted(false);
		} else {
			document.body.classList.add("volume");
		}
	},
	toggleMuted(isMute = !audio.muted) {
		audio.muted = isMute;
		const icon = audio.muted ? "&#xF29E;" : "&#xF2A2;";
		document.querySelector(".volBtn i").innerHTML = icon;
		document.querySelector(".volBtnBottom i").innerHTML = icon;
	},
	toggleList(isShow = document.body.classList.contains("hideList")) {
		document.body.classList[isShow ? "add" : "remove"]("hideList");
		document.body.classList[isShow ? "remove" : "add"]("hideList");
		if (isShow) document.body.classList.add("hideLyrics");
		PlayerController.loadMusicListActive();
	},
	toggleLyrics() {
		document.body.classList[document.body.classList.contains("hideLyrics") ? "add" : "remove"]("hideLyrics");
		document.body.classList[document.body.classList.contains("hideLyrics") ? "remove" : "add"]("hideLyrics");
		if (!document.body.classList.contains("hideLyrics")) document.body.classList.add("hideList");
		config.setItem("lrcShow", !document.body.classList.contains("hideLyrics"));
	},
	loadConfig() {
		document.querySelector(".SimLRC").style.setProperty("--lineSpace", config.getItem("lyricSpace") + "em");
		document.querySelector(".lyrics").style.setProperty("--lrcSize", config.getItem("lyricSize") + "em");
		document.body.classList[config.getItem("backgroundBlur") ? "remove" : "add"]("disableBackgroundBlur");
		document.body.classList[config.getItem("lyricBlur") ? "remove" : "add"]("disableLyricsBlur");
	}
};

const SimAPUI = {
	show() {
		if (this.playingAnimation) return;
		document.getElementById("playPage").hidden = false;
		this.playingAnimation = true;
		setTimeout(() => {
			document.body.classList.add("playerShown");
			const listActive = document.querySelector(".list div.active");
			if (!listActive) document.querySelector(".list div").click();
			document.querySelector(".list div.active").scrollIntoView({block: "center"});
			document.querySelector(".lyrics div.active").scrollIntoView({block: "center"});
			this.playingAnimation = false;
		}, 50);
	},
	hide() {
		if (this.playingAnimation) return;
		document.body.classList.remove("playerShown");
		this.playingAnimation = true;
		setTimeout(() => {
			document.getElementById("playPage").hidden = true;
			this.playingAnimation = false;
		}, 300);
	}
}


document.documentElement.addEventListener("keydown", event => {
	if (document.activeElement.tagName.toLowerCase() == "input") return;
	const audio = document.getElementById("audio");
	switch (event.key) {
		case " ":
			SimAPControls.togglePlay();
			break;
		case "ArrowUp":
			config.setItem("volume", Math.min(1, config.getItem("volume") + .05));
			break;
		case "ArrowDown":
			config.setItem("volume", Math.max(0, config.getItem("volume") - .05));
			break;
		case "ArrowRight":
			audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
			break;
		case "ArrowLeft":
			audio.currentTime = Math.max(0, audio.currentTime - 5);
			break;
	}
});


const SimAPVolume = new SimProgress(document.getElementById("volBar"));
const SimAPVolumeBottom = new SimProgress(document.getElementById("volBarBottom"));
const loadVolumeUi = () => {
	const value = config.getItem("volume");
	document.getElementById("audio").volume = value;
	SimAPVolume.setValue(value);
	SimAPVolumeBottom.setValue(value);
	SimAPControls.toggleMuted(false);
}
loadVolumeUi();
config.listenChange("volume", loadVolumeUi);
SimAPVolume.onchange = SimAPVolumeBottom.onchange = value => { config.setItem("volume", value); }
document.body.onpointerdown = () => {document.body.classList.remove("volume");};
document.querySelector(".volBtn").onpointerdown = e => {e.stopPropagation();};


const SimAPProgress = new SimProgress(document.getElementById("progressBar"));
const SimAPProgressBottom = new SimProgress(document.getElementById("bottomProgressBar"));


config.listenChange("backgroundBlur", SimAPControls.loadConfig);
config.listenChange("lyricBlur", SimAPControls.loadConfig);
config.listenChange("lyricSize", SimAPControls.loadConfig);
config.listenChange("lyricSpace", SimAPControls.loadConfig);
