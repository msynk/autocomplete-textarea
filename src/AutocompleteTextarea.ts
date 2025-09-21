(function () {
    class GhostTextarea extends HTMLElement {
        static get observedAttributes() {
            return ["ghosttext", "placeholder"];
        }

        private _ghostText: string | null | undefined;
        private _overlay: HTMLDivElement | null | undefined;
        private _textarea: HTMLTextAreaElement | null | undefined;

        constructor() {
            super();
            this.attachShadow({ mode: "open" });
            this.shadowRoot?.appendChild(template.content.cloneNode(true));

            this._textarea = this.shadowRoot?.querySelector("textarea");
            this._overlay = this.shadowRoot?.querySelector(".overlay");

            this._ghostText = "";
        }

        connectedCallback() {
            if (this.hasAttribute("placeholder")) {
                this._textarea?.setAttribute("placeholder", this.getAttribute("placeholder") || '');
            }

            if (this.hasAttribute("ghosttext")) {
                this._ghostText = this.getAttribute("ghosttext");
            }

            this._textarea?.addEventListener("input", () => this.updateOverlay());
            this._textarea?.addEventListener("keyup", () => this.updateOverlay());
            this._textarea?.addEventListener("click", () => this.updateOverlay());
            this._textarea?.addEventListener("scroll", (e) => {
                if (!this._overlay || !this._textarea) return;
                this._overlay.scrollTop = this._textarea.scrollTop;
                this._overlay.scrollLeft = this._textarea.scrollLeft;
            })

            this.updateOverlay();
        }

        attributeChangedCallback(name: string, oldValue: string, newValue: string) {
            if (name === "ghosttext") {
                this._ghostText = newValue || "";
                this.updateOverlay();
            } else if (name === "placeholder") {
                this._textarea?.setAttribute("placeholder", newValue || "");
            }
        }

        set ghostText(value: string) {
            this.setAttribute("ghosttext", value);
        }

        get ghostText(): string | null | undefined {
            return this._ghostText;
        }

        updateOverlay() {
            if (!this._overlay || !this._textarea) return;

            const value = this._textarea.value;

            if (!value) {
                return this._overlay.innerHTML = "";
            }

            this._overlay.innerHTML = this.escapeHtml(value) + this.escapeHtml(this._ghostText);
        }

        escapeHtml(text: string | null | undefined): string {
            if (!text) return '';

            return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || ''));
        }
    }


    const template = document.createElement("template");
    template.innerHTML = `
  <style>
    .wrapper {
        display: flex;
        position: relative;
        width: fit-content;
        height: fit-content;
    }

    .overlay,
    .textarea {
        width: 100%;
        padding: 8px;
        height: 150px;
        font-size: 16px;
        line-height: 1.4;
        word-wrap: break-word;
        white-space: pre-wrap;
        box-sizing: border-box;
        font-family: monospace;
    }

    .overlay {
        top: 0;
        left: 0;
        z-index: 0;
        width: 100%;
        height: 100%;
        color: #aaa;
        overflow: auto;
        position: absolute;
        pointer-events: none;
    }

    .textarea {
        z-index: 1;
        border: none;
        position: relative;
        outline: 1px solid;
        background: transparent;
    }
  </style>

  <div class="wrapper">
    <div class="overlay"></div>
    <textarea></textarea>
  </div>
`;

    customElements.define("ghost-textarea", GhostTextarea);

    (window as any).GhostTextarea = GhostTextarea;
}())