
class SimLRC {
	constructor(lrc) {
		// 解析歌词
		const lrcSpilitted = lrc.split("\n");
		this.lrcParsed = {};
		for (let lineNum in lrcSpilitted) {
			const line = lrcSpilitted[lineNum];
			const regex = /\[\d+\:\d+\.\d+\]/g;
			const tags = (line.match(regex) || []).map(match => match.slice(1, -1));
			const text = line.replace(regex, "").trim();
			if (!tags || !text) continue;
			tags.forEach(tag => {
				const [minutes, seconds] = tag.split(':').map(Number);
				const msTime = Math.round(minutes * 60000 + seconds * 1000);
				if (msTime || msTime === 0) {
					if (!this.lrcParsed[msTime]) this.lrcParsed[msTime] = [];
					this.lrcParsed[msTime].push(text);
				}
			});
			if (!this.lrcParsed[0]) {
				const firstTs = Object.keys(this.lrcParsed)[0];
				this.lrcParsed[0] = this.lrcParsed[firstTs];
				delete this.lrcParsed[firstTs];
			}
		}
		if (!Object.keys(this.lrcParsed).length) this.lrcParsed = {0: ["暂无歌词"]};
	}
	
	render(container, audio, options = {}) {
		if (!container || !audio) return;
		// 初始化配置项
		const defaultOptions = {
			blurStep: 1,
			blurMin: 2,
			blurMax: 5,
			normalColor: "#00000088",
			activeColor: "#000000",
			clickUpdate: true,
			multiLangSupport: true,
			align: "center",
			inactiveZoom: .8,
			lineSpace: .8,
			scrollTimeout: 3000,
		};
		options = Object.assign(defaultOptions, options);
		// 渲染歌词HTML
		container.innerHTML = "";
		for (let timestamp in this.lrcParsed) {
			const currentLrc = this.lrcParsed[timestamp];
			if (options.multiLangSupport) {
				// 启用多语言支持，则同时间戳不同歌词在同一个div渲染
				const lrcDiv = document.createElement("div");
				lrcDiv.dataset.stamp = timestamp;
				currentLrc.forEach((text, index) => {
					const textElement = document.createElement(index ? "small" : "span");
					textElement.textContent = text;
					lrcDiv.appendChild(textElement);
				});
				container.appendChild(lrcDiv);
			} else {
				// 禁用多语言支持，则同时间戳不同歌词分开渲染
				currentLrc.forEach(text => {
					const lrcDiv = document.createElement("div");
					lrcDiv.dataset.stamp = timestamp;
					lrcDiv.textContent = text;
					container.appendChild(lrcDiv);
				});
			}
		}
		// 设置样式
		container.classList.add("SimLRC");
		container.style.setProperty("--align", options.align);
		container.style.setProperty("--normalColor", options.normalColor);
		container.style.setProperty("--activeColor", options.activeColor);
		container.style.setProperty("--hoverColor", options.clickUpdate ? options.activeColor : options.normalColor);
		container.style.setProperty("--inactiveZoom", options.inactiveZoom);
		container.style.setProperty("--lineSpace", options.lineSpace + "em");
		// 监听事件
		const refreshLrcProgress = forceScroll => {
			const currentTime = audio.currentTime * 1000;
			let lrcEles = Array.from(container.getElementsByTagName("div"));
			for (let index in lrcEles) {
				let div = lrcEles[index];
				if (div.dataset.stamp <= currentTime && (!div.nextElementSibling || div.nextElementSibling.dataset.stamp > currentTime)) {
					// 执行回调
					if (!div.classList.contains("active") && options.callback) options.callback(div.querySelector("span") ? div.querySelector("span").textContent : div.textContent);
					if (!div.classList.contains("active") || forceScroll) {
						// 取消用户滚动模式
						if (forceScroll) {
							container.classList.remove("scrolling");
							clearTimeout(this.scrollTimeoutId);
						}
						// 设置为当前歌词并滚动
						div.classList.add("active");
						if (!container.classList.contains("scrolling")) div.scrollIntoView({ behavior: "smooth", block: "center" });
						// 渲染歌词模糊效果
						if (options.blurStep && options.blurMax) {
							div.style.filter = "none";
							const prevSiblings = [];
							let prev = div.previousElementSibling;
							while (prev) {
								prevSiblings.push(prev);
								prev = prev.previousElementSibling;
							}
							let next = div.nextElementSibling;
							const nextSiblings = [];
							while (next) {
								nextSiblings.push(next);
								next = next.nextElementSibling;
							}
							for (let index = 0; index <= Math.max(prevSiblings.length, nextSiblings.length); index++) {
								const blurPixel = Math.min(options.blurMin + options.blurStep * index, options.blurMax);
								if (prevSiblings[index]) prevSiblings[index].style.filter = `blur(${blurPixel}px)`;
								if (nextSiblings[index]) nextSiblings[index].style.filter = `blur(${blurPixel}px)`;
							}
						}
					}
				} else div.classList.remove("active");
			}
		};
		audio.addEventListener("timeupdate", () => { refreshLrcProgress(); });
		window.addEventListener("resize", () => { refreshLrcProgress(true); });
		if (options.clickUpdate) {
			Array.from(container.getElementsByTagName("div")).forEach(div => {
				div.onclick = () => { audio.currentTime = div.dataset.stamp / 1000; refreshLrcProgress(true); };
			});
		}
		refreshLrcProgress(true);
		setTimeout(() => {container.querySelector("div.active").scrollIntoView({block: "center", behavior: "smooth"});});
		// 处理用户滚动
		const handleUserScroll = () => {
			if (document.body.classList.contains("volume")) return;
			clearTimeout(this.scrollTimeoutId);
			this.scrollTimeoutId = setTimeout(() => {
				container.classList.remove("scrolling");
				refreshLrcProgress(true);
			}, options.scrollTimeout);
			container.classList.add("scrolling");
		}
		container.onwheel = handleUserScroll;
	}
}
