class ContextMenu {
    dom;
    isSubmenu;
    submenuShowTimer = null;
    submenuRemoveTimer = null;

    constructor(items, { isSubmenu, parentItem } = {}) {
        this.isSubmenu = isSubmenu;
        this.dom = document.createElement("div");
        this.dom.classList.add("context-menu");
        this.dom.addEventListener("mousedown", (evt) => {
            evt.stopPropagation();
        });
        this.dom.addEventListener("mouseenter", () => {
            if (isSubmenu) {
                parentItem.classList.add("item-focused");
            }
            else {
                for (let i = 0; i < this.dom.getElementsByClassName("item-focused").length; i += 1) {
                    this.dom.getElementsByClassName("item-focused")[i].classList.remove("item-focused");
                    i -= 1;
                }
            }
        });

        for (let item of items) {
            if (!item) {
                continue;
            }
            let d;
            if (item.label) {
                d = document.createElement("div");
                d.classList.add("item");
                d.textContent = item.label;
				d.style.setProperty("--icon", item.icon ? `'\\${item.icon}'` : "");
                if (item.submenu) {
                    if (item.submenu.length == 0) {
                        item.submenu = [{
                            label: "（空）",
                            disabled: true
                        }];
                    }
                    d.classList.add("sub");
                    d.addEventListener("mouseenter", () => {
                        let submenu = new ContextMenu(item.submenu, {
                            isSubmenu: true,
                            parentItem: d
                        });
                        this.submenuShowTimer && clearTimeout(this.submenuShowTimer);
                        this.submenuShowTimer = setTimeout(() => {
                            if (this.dom.nextElementSibling) {
                                this.dom.nextElementSibling.remove();
                            }
                            submenu.popup([
                                this.dom.offsetLeft + d.offsetLeft + d.clientWidth - 2,
                                this.dom.offsetTop + d.offsetTop - 7,
                            ], [d.clientWidth - 4, -d.clientHeight - 9]);
                        }, 250);
                    });
                    d.addEventListener("mouseleave", () => {
                        this.submenuShowTimer && clearTimeout(this.submenuShowTimer);
                        if (!this.dom.nextElementSibling) {
                            return;
                        }
                        this.submenuRemoveTimer && clearTimeout(this.submenuRemoveTimer);
                        this.submenuRemoveTimer = setTimeout(() => {
                            if (this.dom.nextElementSibling) {
                                this.dom.nextElementSibling.remove();
                            }
                        }, 200);
                        this.dom.nextElementSibling.addEventListener("mouseenter", () => {
                            this.submenuRemoveTimer && clearTimeout(this.submenuRemoveTimer);
                        });
                    });
                }
                if (item.click) {
                    d.addEventListener("click", () => {
                        this.dom.parentElement.remove();
                        setTimeout(() => {
                            item.click();
                        }, 100);
                    });
                }
                if (item.disabled) {
                    d.classList.add("disabled");
                }
            }
            else if (item.type == "separator") {
                d = document.createElement("hr");
                d.classList.add("separator");
            }
            this.dom.appendChild(d);
        }
    };

    popup([x, y], [offsetX, offsetY] = [0, 0]) {
        let maskDom = document.getElementById("context-menu-mask");
        if (!maskDom) {
            if (this.isSubmenu) {
                return;
            }
            maskDom = document.createElement("div");
            maskDom.id = "context-menu-mask";
            maskDom.addEventListener("mousedown", function (evt) {
                if (evt.button == 0) {
                    this.remove();
                }
            });
            maskDom.addEventListener("mousedown", function () {
                this.remove();
            });
            document.body.appendChild(maskDom);
        }
        maskDom.appendChild(this.dom);

        this.dom.style.left = `${(x + this.dom.clientWidth < window.innerWidth) ? x : x - this.dom.clientWidth - offsetX}px`;
        this.dom.style.top = `${(y + this.dom.clientHeight < window.innerHeight) ? y : y - this.dom.clientHeight - offsetY}px`;

        setTimeout(() => {
            this.dom.style.opacity = "1";
        }, 100);
    };
};

function closeContextMenu() {
    let maskDom = document.getElementById("context-menu-mask");
    if (maskDom) {
        maskDom.remove();
    }
};
window.addEventListener("resize", closeContextMenu);
window.addEventListener("blur", closeContextMenu);