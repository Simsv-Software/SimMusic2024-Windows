
class SimProgress {
	constructor(element) {
		// 初始化
		this.progressElement = element;
		element.innerHTML = "<div><div></div></div>";
		// 事件监听
		if (!element.classList.contains("SimProgress")) {
			// 拖动处理
			const handleDrag = e => {
				e.preventDefault();
				const clickX = (e.pageX || e.changedTouches[0].pageX || e.touches[0].pageX) - element.getBoundingClientRect().left;
				const progress = Math.min(Math.max(clickX / element.clientWidth, 0), 1);
				element.style.setProperty("--SimProgressWidth", progress * 100 + "%");
				this.value = this.min + (this.max - this.min) * progress;
			}
			// 鼠标事件
			element.addEventListener("mousedown", () => {
				document.addEventListener("mousemove", handleDrag);
				element.classList.add("dragging");
			}, {passive: true});
			element.addEventListener("mouseup", handleDrag);
			document.addEventListener("mouseup", () => {
				document.removeEventListener("mousemove", handleDrag);
				if (this.onchange && element.classList.contains("dragging")) this.onchange(this.value);
				element.classList.remove("dragging");
			});
			// 触摸事件
			element.addEventListener("touchstart", () => {
				document.addEventListener("touchmove", handleDrag, {passive: false});
				element.classList.add("dragging");
			}, {passive: true});
			element.addEventListener("touchend", handleDrag);
			document.addEventListener("touchend", () => {
				document.removeEventListener("touchmove", handleDrag, {passive: false});
				if (this.onchange && element.classList.contains("dragging")) this.onchange(this.value);
				element.classList.remove("dragging");
			});
		}
		// 读取信息
		element.classList.add("SimProgress");
		this.min = Number(element.getAttribute("min")) ?? 0;
		this.max = Number(element.getAttribute("max")) ?? this.min + 100;
		this.setValue(Number(element.getAttribute("value")) ?? this.min);
	}
	setValue(value = this.value) {
		if (value > this.max || value < this.min) value = this.min;
		if (this.progressElement.classList.contains("dragging")) return;
		this.value = value;
		this.progressElement.style.setProperty("--SimProgressWidth", (this.value - this.min) / (this.max - this.min) * 100 + "%");
	}
}
