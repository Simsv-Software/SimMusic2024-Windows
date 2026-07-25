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


// 初始化SimAP
const switchMusic = (playConfig) => {
	// 初始化界面
	const audio = document.getElementById("audio");
	document.getElementById("album").src = document.getElementById("albumBottom").src = playConfig.album;
	document.querySelector(".musicInfo>b").textContent = document.querySelector(".musicInfoBottom>b").textContent = playConfig.title;
	document.querySelector(".musicInfo>div").textContent = document.querySelector("#bottomArtist").textContent = playConfig.artist;
	const lastPlaybackRate = audio.playbackRate;
	audio.src = playConfig.audio;
	audio.currentTime = 0;
	document.body.classList.add("withCurrentMusic");
	document.body.classList.add("musicLoading");
	if (playConfig.play) setTimeout(() => {
		document.body.classList.add("playing");
		SimAPControls.loadAudioState();
	});
	SimAPControls.loadLoop();
	document.title = playConfig.title + " - SimMusic";
	loadThemeImage();
	// 初始化背景
	document.getElementById("album").onload = SimAPUI.loadColors;
	// 初始化音频控件
	const current = document.getElementById("progressCurrent");
	const duration = document.getElementById("progressDuration");
	audio.onloadedmetadata = () => {
		document.body.classList.remove("musicLoading");
		applyEq();
		SimAPProgress.max = SimAPProgressBottom.max = audio.duration;
		SimAPProgress.setValue(0); SimAPProgressBottom.setValue(0);
		duration.textContent = SimAPTools.formatTime(audio.duration);
		SimAPProgress.onchange = SimAPProgressBottom.onchange = value => {
			audio.currentTime = value;
			setMiniModeStatus(`${SimAPTools.formatTime(value)} / ${duration.textContent}`);
		}
		SimAPProgress.ondrag = SimAPProgressBottom.ondrag = value => {
			current.textContent = SimAPTools.formatTime(value);
			setMiniModeStatus(`${SimAPTools.formatTime(value)} / ${duration.textContent}`);
		}
		loadVolumeUi();
		audio.playbackRate = lastPlaybackRate ?? 1;
		if (playConfig.play) audio.play(); else audio.pause();
	};
	audio.ontimeupdate = () => {
		document.body.classList.remove("musicLoading");
		SimAPProgress.setValue(audio.currentTime); SimAPProgressBottom.setValue(audio.currentTime);
		if (!SimAPProgress.progressElement.classList.contains("dragging")) current.textContent = SimAPTools.formatTime(audio.currentTime);
		if (SimAPControls.audioFadeInterval) return;
		document.body.classList[!audio.paused ? "add" : "remove"]("playing");
		SimAPControls.loadAudioState();
	};
	audio.onwaiting = () => {
		document.body.classList.add("musicLoading");
	};
	audio.onended = () => {
		if (SleepMode.checkMusicSwitch()) return;
		if (config.getItem("loop") == 1) { PlayerController.switchMusic(config.getItem("currentMusic"), false, true); }
		else SimAPControls.next();
	};
	audio.onerror = () => {
		shell.beep();
		document.body.classList.remove("playing");
		document.body.classList.remove("musicLoading");
		confirm("当前曲目播放失败，是否从播放列表中移除？", () => {
			PlayerController.deleteFromList(config.getItem("currentMusic"));
		});
	};
	// 系统级控件
	navigator.mediaSession.metadata = new MediaMetadata({ title: playConfig.title, artist: playConfig.artist, artwork: [{ src: playConfig.album }],	});
	navigator.mediaSession.setActionHandler("play", () => {SimAPControls.togglePlay(true);});
	navigator.mediaSession.setActionHandler("pause", () => {SimAPControls.togglePlay(true);});
	navigator.mediaSession.setActionHandler("previoustrack", () => {SimAPControls.prev(true);});
	navigator.mediaSession.setActionHandler("nexttrack", () => {SimAPControls.next(true);});
	// 初始化歌词
	const slrc = new SimLRC(playConfig.lyrics);
	slrc.render(document.querySelector(".lyrics>div"), audio, {
		align: "left",
		lineSpace: config.getItem("lyricSpace"),
		activeColor: "var(--SimAPTheme)",
		normalColor: "rgba(0,0,0,.4)",
		multiLangSupport: config.getItem("lyricMultiLang"),
		align: config.getItem("lyricAlign"),
		callback: txt => { ipcRenderer.invoke("lrcUpdate", txt); }
	});
	SimAPControls.loadConfig();
};



// 动态混色控制器
const PlayerBackground = {
	init() {
		const canvas = document.getElementById("backgroundAnimation");
		const gl = canvas.getContext("webgl2");
		if (!gl) return console.error("WebGL2 not supported");
		this.canvas = canvas;
		this.gl = gl;
		this.colors = ["#000000", "#333333", "#666666", "#999999"];
		this.pausedAt = 0;
		this.offset = 0;
		const scale = 0.5;
		const resize = () => {
			canvas.width = window.innerWidth * scale;
			canvas.height = window.innerHeight * scale;
			gl.viewport(0, 0, canvas.width, canvas.height);
		};
		window.addEventListener("resize", resize);
		resize();
		const vsSource = `#version 300 es
		in vec2 aPos;
		out vec2 vUv;
		void main(){
			vUv = (aPos+1.0)*0.5;
			gl_Position = vec4(aPos,0.0,1.0);
		}`;
		const fsSource = `#version 300 es
		precision highp float;
		in vec2 vUv;
		out vec4 fragColor;
		uniform float uTime;
		uniform vec3 uColors[4];

		float fbm(vec2 p){
			float v = 0.0;
			float a = 0.5;
			for(int i=0;i<2;i++){
				v += a * sin(p.x*0.8 + float(i)*1.5) * cos(p.y*0.9 + float(i)*1.3);
				p *= 1.3;
				a *= 0.5;
			}
			return v*0.5 + 0.5;
		}

		vec3 palette(float t){
			float f = t * 3.0;
			int idx = int(floor(f));
			float blend = fract(f);
			vec3 c1 = uColors[idx];
			vec3 c2 = uColors[min(idx+1, 3)];
			return mix(c1,c2,blend);
		}

		void main(){
			vec2 uv = vUv * 2.0;
			float t = uTime*0.25;

			vec2 p = uv;
			p += 0.04*vec2(
				sin(p.y*1.2 + t),
				cos(p.x*1.3 - t)
			);

			float f = fbm(p + vec2(t*0.3, -t*0.2));
			f = smoothstep(0.2,0.8,f);

			vec3 col = palette(f);
			fragColor = vec4(col,1.0);
		}`;
		const createShader = (type, source) => {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				console.error(gl.getShaderInfoLog(shader));
				gl.deleteShader(shader);
				return null;
			}
			return shader;
		};
		const vs = createShader(gl.VERTEX_SHADER, vsSource);
		const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
		if (!vs || !fs) return;
		const program = gl.createProgram();
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error(gl.getProgramInfoLog(program));
			return;
		}
		this.program = program;
		this.aPos = gl.getAttribLocation(program, "aPos");
		this.uTime = gl.getUniformLocation(program, "uTime");
		this.uColors = gl.getUniformLocation(program, "uColors");
		const quad = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
		const vbo = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
		this.vbo = vbo;
		this.animate(true);
	},
	animate(isInit) {
		requestAnimationFrame(() => { PlayerBackground.animate(); });
		if (!config.getItem("backgroundBlur")) return;
		if (!document.body.classList.contains("playing") && !isInit) return;
		const gl = this.gl;
		const canvas = this.canvas;
		const paused = !document.body.classList.contains("playing");
		if (paused) {
			if (this.pausedAt === 0) this.pausedAt = performance.now();
			return;
		} else {
			if (this.pausedAt !== 0) {
				this.offset += performance.now() - this.pausedAt;
				this.pausedAt = 0;
			}
		}
		const t = (performance.now() - this.offset) * 0.001;
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.program);
		gl.uniform1f(this.uTime, t);
		const colorData = [];
		for (let c of this.colors) {
			colorData.push(parseInt(c.slice(1, 3), 16) / 255);
			colorData.push(parseInt(c.slice(3, 5), 16) / 255);
			colorData.push(parseInt(c.slice(5, 7), 16) / 255);
		}
		gl.uniform3fv(this.uColors, colorData);
		gl.enableVertexAttribArray(this.aPos);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
		gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	},
	rgbToHex(rgb) {
		const m = rgb.match(/\d+/g);
		if (!m) return "#000000";
		return "#" + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, "0")).join("");
	},
	update(mainColor, subColors) {
		document.getElementById("background").style.background = mainColor;
		this.colors = [
			this.rgbToHex(mainColor),
			...subColors.map(c => this.rgbToHex(c))
		];
	}
}
PlayerBackground.init();



// 播放控件
const SimAPProgress = new SimProgress(document.getElementById("progressBar"));
const SimAPProgressBottom = new SimProgress(document.getElementById("bottomProgressBar"));
const SimAPControls = {
	loadAudioState() {
		const playing = document.body.classList.contains("playing");
		navigator.mediaSession.playbackState = playing ? "playing" : "paused";
		ipcRenderer.invoke(playing ? "musicPlay" : "musicPause");
	},
	togglePlay(isManual) {
		if (isManual) SleepMode.checkManualOperation();
		if (document.body.classList.contains("musicLoading")) return;
		const audio = document.getElementById("audio");
		if (!audio || !audio.src) return;
		const isPlay = audio.paused;
		document.body.classList[isPlay ? "add" : "remove"]("playing");
		SimAPControls.loadAudioState();
		clearInterval(SimAPControls.audioFadeInterval);
		// 音频淡入淡出处理
		if (config.getItem("audioFade") && config.getItem("volume")) {
			const configVolume = config.getItem("volume");
			const volumeOffset = configVolume / 10;
			if (isPlay) audio.play();
			SimAPControls.audioFadeInterval = setInterval(() => {
				if (isPlay) {
					const newVolume = audio.volume + volumeOffset;
					if (newVolume > configVolume) {
						clearInterval(SimAPControls.audioFadeInterval);
						SimAPControls.audioFadeInterval = null;
					} else audio.volume = newVolume;
				} else {
					const newVolume = audio.volume - volumeOffset;
					if (newVolume < 0) {
						clearInterval(SimAPControls.audioFadeInterval);
						SimAPControls.audioFadeInterval = null;
						audio.pause();
					}
					else audio.volume = newVolume;
				} 
			}, 50);
		} else {
			audio[isPlay ? "play" : "pause"]();
		}
	},
	prev(isManual) {
		if (isManual) SleepMode.checkManualOperation();
		const audio = document.getElementById("audio");
		if (!config.getItem("fastPlayback") || audio.currentTime / audio.duration < .9) SimAPControls.switchIndex(-1);
		else audio.currentTime = 0;
	},
	next(isManual) {
		if (isManual) SleepMode.checkManualOperation();
		SimAPControls.switchIndex(1);
	},
	switchIndex(offset) {
		if (SleepMode.checkMusicSwitch()) return;
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
		document.body.classList[isShow ? "remove" : "add"]("hideList");
		if (isShow) document.body.classList.add("hideLyrics");
		PlayerController.loadMusicListActive();
	},
	toggleLyrics(isShow = document.body.classList.contains("hideLyrics")) {
		document.body.classList[isShow ? "remove" : "add"]("hideLyrics");
		if (isShow) document.body.classList.add("hideList");
		config.setItem("lrcShow", isShow);
	},
	loadConfig() {
		document.querySelector(".SimLRC").style.setProperty("--lineSpace", config.getItem("lyricSpace") + "em");
		document.querySelector(".lyrics").style.setProperty("--lrcSize", config.getItem("lyricSize") + "em");
		document.querySelector(".lyrics").style.setProperty("--lrcTranslation", config.getItem("lyricTranslation") + "em");
		document.body.classList[config.getItem("backgroundBlur") ? "remove" : "add"]("disableBackgroundBlur");
		document.body.classList[config.getItem("lyricBlur") ? "remove" : "add"]("disableLyricsBlur");
	}
};



// 播放器显隐处理
const SimAPUI = {
	show() {
		if (this.playingAnimation) return;
		if (document.body.classList.contains("playerShown") || document.body.classList.contains("miniMode")) return;
		if (!config.getItem("playList").length || !document.getElementById("album").src) return;
		document.getElementById("playPage").hidden = false;
		this.playingAnimation = true;
		setTimeout(() => {
			document.body.classList.add("playerShown");
			if (config.getItem("darkPlayer")) ipcRenderer.invoke("overlayWhite");
			const listActive = document.querySelector(".list div.active");
			if (!listActive) document.querySelector(".list div").click();
			document.querySelector(".list div.active").scrollIntoView({block: "center"});
			document.querySelector(".lyrics div.active").scrollIntoView({block: "center"});
			this.playingAnimation = false;
			this.toggleDesktopLyrics(null, false);
			addEventListener("visibilitychange", this.toggleDesktopLyrics);
		}, 50);
	},
	hide() {
		if (this.playingAnimation) return;
		if (!document.body.classList.contains("playerShown")) return;
		ipcRenderer.invoke("overlayBlack");
		SimAPUI.toggleFullScreen(true);
		document.body.classList.remove("playerShown");
		this.playingAnimation = true;
		setTimeout(() => {
			this.toggleDesktopLyrics(null, true);
			removeEventListener("visibilitychange", this.toggleDesktopLyrics);
			document.getElementById("playPage").hidden = true;
			this.playingAnimation = false;
		}, 300);
	},
	toggleDesktopLyrics(_event, showWindow = document.visibilityState == "hidden" ? true : false) {
		if (config.getItem("desktopLyricsAutoHide") && WindowStatus.lyricsWin) ipcRenderer.invoke("toggleLyrics", showWindow);
	},
	loadColors() {
		const themeColors = SimAPTools.getTopColors(document.getElementById("album"));
		PlayerBackground.update(`rgb(${themeColors[0].join(",")})`, [
								`rgb(${themeColors[1] ? themeColors[1].join(",") : "255,255,255"})`,
								`rgb(${themeColors[2] ? themeColors[2].join(",") : "255,255,255"})`,
								`rgb(${themeColors[3] ? themeColors[3].join(",") : "255,255,255"})` ]);
		const themeColorNum = Math.min( 255 / (themeColors[0][0] + themeColors[0][1] + themeColors[0][2] + 1), 1);
		document.body.style.setProperty("--SimAPTheme", `rgb(${themeColors[0].map(num => num * themeColorNum).join(",")})`);
		document.body.classList[config.getItem("darkPlayer") ? "add" : "remove"]("darkPlayer");
	},
	toggleFullScreen(isQuit) {
		if (!document.fullscreenElement && document.body.classList.contains("playerShown") && !isQuit) {
			document.body.requestFullscreen();
			document.body.classList.add("fullscreen");
			document.onfullscreenchange = () => {
				if (!document.fullscreenElement) document.body.classList.remove("fullscreen");
				window.dispatchEvent(new Event("resize"));
			};
		} else {
			document.exitFullscreen().catch(() => {});
			document.body.classList.remove("fullscreen");
		}
		window.dispatchEvent(new Event("resize"));
	}
}
ipcRenderer.invoke("musicPause");
config.listenChange("darkPlayer", SimAPUI.loadColors);


// 处理键盘操作
let keydownLock;
document.documentElement.addEventListener("keydown", e => {
	if (keydownLock) return;
	keydownLock = true;
	setTimeout(() => { keydownLock = false; }, 150)
	if (document.activeElement.tagName.toLowerCase() == "input") return;
	const audio = document.getElementById("audio");
	const duration = document.getElementById("progressDuration").textContent;
	switch (e.key) {
		case " ":
			SimAPControls.togglePlay(true);
			break;
		case "ArrowUp":
			const upVol = Math.min(1, config.getItem("volume") + .05);
			config.setItem("volume", upVol);
			setMiniModeStatus(`音量：${Math.round(upVol * 100)}%`);
			break;
		case "ArrowDown":
			const downVol = Math.max(0, config.getItem("volume") - .05);
			config.setItem("volume", downVol);
			setMiniModeStatus(`音量：${Math.round(downVol * 100)}%`);
			break;
		case "ArrowRight":
			const value1 = Math.min(audio.duration, audio.currentTime + 5);
			audio.currentTime = value1;
			setMiniModeStatus(`${SimAPTools.formatTime(value1)} / ${duration}`);
			break;
		case "ArrowLeft":
			const value2 = Math.max(0, audio.currentTime - 5);
			audio.currentTime = value2;
			setMiniModeStatus(`${SimAPTools.formatTime(value2)} / ${duration}`);
			break;
		case "Escape":
			SimAPUI.hide();
			document.body.classList.remove("volume");
			break;
		case "F11":
			SimAPUI.toggleFullScreen();
			break;
	}
});


// 音量相关操作
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
SimAPVolume.ondrag = SimAPVolumeBottom.ondrag = value => { config.setItem("volume", value); }
document.body.onpointerdown = () => {document.body.classList.remove("volume");};
addEventListener("blur", () => {document.body.classList.remove("volume");});
document.querySelector(".volBtn").onpointerdown = e => {e.stopPropagation();};
const handleWheel = e => {
	e.preventDefault();
	let value = config.getItem("volume");
	value = e.deltaY > 0 ? Math.max(0, value - .05) : Math.min(1, value + .05);
	config.setItem("volume", value);
	setMiniModeStatus(`音量：${Math.round(value * 100)}%`);
};
document.addEventListener("wheel", e => { if (document.body.classList.contains("volume")) handleWheel(e); }, {passive: false});
document.querySelector(".volBtn").onwheel = () => { document.body.classList.add("volume"); };
document.querySelector(".volBtnBottom").onwheel = e => { handleWheel(e); };
document.querySelector(".bottom").onwheel = e => { if (document.body.classList.contains("miniMode")) handleWheel(e); };



// 响应配置更新
config.listenChange("backgroundBlur", SimAPControls.loadConfig);
config.listenChange("lyricBlur", SimAPControls.loadConfig);
config.listenChange("lyricSize", SimAPControls.loadConfig);
config.listenChange("lyricSpace", SimAPControls.loadConfig);
config.listenChange("lyricTranslation", () => {SimAPControls.loadConfig(); updateDesktopLyricsConfig();});
