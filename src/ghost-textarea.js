(function () {
    const template = document.createElement('template');
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
        all: unset;
        padding: 0;
        width: 100%;
        font-size: 16px;
        line-height: 1.5;
        white-space: pre-wrap;
        box-sizing: border-box;
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
        resize: both;
        position: relative;
        outline: 1px solid;
        background: transparent;
    }
  </style>

  <div class="wrapper">
    <div class="overlay"></div>
    <textarea class="textarea"></textarea>
  </div>
`;

    class GhostTextarea extends HTMLElement {
        static get observedAttributes() {
            return ['ghost', 'placeholder', 'value', 'disabled', 'name', 'rows', 'cols'];
        }

        _ghost = null;
        _overlay = null;
        _textarea = null;

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this.shadowRoot?.appendChild(template.content.cloneNode(true));

            this._textarea = this.shadowRoot?.querySelector('.textarea');
            this._overlay = this.shadowRoot?.querySelector('.overlay');

            this._ghost = '';
        }

        connectedCallback() {
            ['placeholder', 'value'].forEach(attr => {
                if (this.hasAttribute(attr)) {
                    this._textarea.setAttribute(attr, this.getAttribute(attr) || '');
                }
            });

            if (this.hasAttribute('ghost')) {
                this._ghost = this.getAttribute('ghost');
            }

            ['input', 'change', 'focus', 'blur', 'keydown', 'keyup', 'click'].forEach(evt =>
                this._textarea.addEventListener(evt, e => {
                    this.updateOverlay();
                    this.dispatchEvent(new Event(e.type, { bubbles: true, composed: true }));
                })
            );

            this._textarea.addEventListener('scroll', (e) => {
                if (!this._overlay || !this._textarea) return;
                this._overlay.scrollTop = this._textarea.scrollTop;
                this._overlay.scrollLeft = this._textarea.scrollLeft;
            })

            this.updateOverlay();
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (name === 'placeholder') {
                this._textarea.setAttribute('placeholder', newValue || '');
            } else if (name === 'ghost') {
                this._ghost = newValue || '';
                this.updateOverlay();
            } else if (name === 'value') {
                this._textarea.value = newValue || '';
                this._textarea.setAttribute('value', newValue || '');
                this.updateOverlay();
            } else if (['disabled', 'name', 'rows', 'cols'].includes(name)) {
                if (newValue === null) {
                    this._textarea.removeAttribute(name);
                } else {
                    this._textarea.setAttribute(name, newValue);
                }
                this.updateOverlay();
            }
        }

        get value() {
            return this._textarea.value;
        }
        set value(v) {
            this._textarea.value = v;
            this.updateOverlay();
        }

        set ghost(value) {
            this.setAttribute('ghost', value);
        }

        get ghost() {
            return this._ghost;
        }

        updateOverlay() {
            if (!this._overlay || !this._textarea) return;

            const value = this._textarea.value;

            if (!value) {
                return this._overlay.innerHTML = '';
            }

            this._overlay.innerHTML = escapeHtml(value) + escapeHtml(this._ghost);
        }
    }

    function escapeHtml(text) {
        if (!text) return '';

        return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || ''));
    }

    customElements.define('ghost-textarea', GhostTextarea);

    window.GhostTextarea = GhostTextarea;
}())