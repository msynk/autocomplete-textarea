(function () {
    const template = document.createElement('template');
    template.innerHTML = `
<style>
    [data-suggestion-visible]::selection {
        color: #999;
    }
    .caret {
        position: absolute;
        width: 0.8px;
        background: red;
        display: none;
        animation: blink 1.025s step-end infinite;
    }
    @keyframes blink {
        from, to {
            opacity: 100%;
        }

        50% {
            opacity: 0%;
        }
    }
</style>
<textarea></textarea>
<div class="caret"></div>
`;

    class GhostTextarea2 extends HTMLElement {
        suggestionDisplay;
        typingDebounceTimeout = null;
        pendingSuggestionAbortController;

        static get observedAttributes() {
            return ['ghost', 'placeholder', 'value', 'disabled', 'name', 'rows', 'cols'];
        }

        _ghost = null;
        _textarea = null;

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this.shadowRoot?.appendChild(template.content.cloneNode(true));

            this._textarea = this.shadowRoot?.querySelector('textarea');

            this._ghost = '';
        }

        connectedCallback() {
            this.suggestionDisplay = new InlineSuggestionDisplay(this, this._textarea);

            this._textarea.addEventListener('keydown', e => this.handleKeyDown(e));
            this._textarea.addEventListener('keyup', e => this.handleKeyUp(e));
            this._textarea.addEventListener('mousedown', () => this.removeExistingOrPendingSuggestion());
            this._textarea.addEventListener('focusout', () => this.removeExistingOrPendingSuggestion());

            this._textarea.addEventListener('scroll', () => this.suggestionDisplay.reject(), { passive: true });

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
                    this.dispatchEvent(new Event(e));
                })
            );
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (name === 'placeholder') {
                this._textarea.setAttribute('placeholder', newValue || '');
            } else if (name === 'ghost') {
                this._ghost = newValue || '';
            } else if (name === 'value') {
                this._textarea.value = newValue || '';
                this._textarea.setAttribute('value', newValue || '');
            } else if (['disabled', 'name', 'rows', 'cols'].includes(name)) {
                if (newValue === null) {
                    this._textarea.removeAttribute(name);
                } else {
                    this._textarea.setAttribute(name, newValue);
                }
            }
        }

        get value() {
            return this._textarea.value;
        }
        set value(v) {
            this._textarea.value = v;
        }

        set ghost(value) {
            this.setAttribute('ghost', value);
        }
        get ghost() {
            return this._ghost;
        }

        handleKeyDown(event) {
            switch (event.key) {
                case 'Tab':
                    if (this.suggestionDisplay.isShowing()) {
                        this.suggestionDisplay.accept();
                        event.preventDefault();
                    }
                    break;
                case 'Alt':
                case 'Control':
                case 'Shift':
                case 'Command':
                    break;
                default:
                    const keyMatchesExistingSuggestion = this.suggestionDisplay.isShowing() && this.suggestionDisplay.currentSuggestion.startsWith(event.key);
                    if (keyMatchesExistingSuggestion) {
                        insertTextAtCaretPosition(this._textarea, event.key);
                        event.preventDefault();

                        this.suggestionDisplay.show(this.suggestionDisplay.currentSuggestion.substring(event.key.length));
                        scrollTextAreaDownToCaretIfNeeded(this._textarea);
                        // this._textarea.scrollTop = this._textarea.scrollHeight;
                    } else {
                        this.removeExistingOrPendingSuggestion();
                    }
                    break;
            }
        }
        handleKeyUp(event) {
            // If a suggestion is already visible, it must match the current keystroke or it would
            // already have been removed during keydown. So we only start the timeout process if
            // there's no visible suggestion.
            if (!this.suggestionDisplay.isShowing()) {
                clearTimeout(this.typingDebounceTimeout);
                this.typingDebounceTimeout = setTimeout(() => this.handleTypingPaused(), 350);
            }
        }
        handleTypingPaused() {
            if (document.activeElement !== this) return;

            const isAtEndOfCurrentLine = this._textarea.selectionStart === this._textarea.selectionEnd &&
                (this._textarea.selectionStart === this._textarea.value.length || this._textarea.value[this._textarea.selectionStart] === '\n');

            if (!isAtEndOfCurrentLine) return;

            this.requestSuggestionAsync();
        }
        removeExistingOrPendingSuggestion() {
            clearTimeout(this.typingDebounceTimeout);

            this.pendingSuggestionAbortController?.abort();
            this.pendingSuggestionAbortController = null;

            this.suggestionDisplay.reject();
        }
        async requestSuggestionAsync() {
            this.pendingSuggestionAbortController?.abort();
            this.pendingSuggestionAbortController = new AbortController();

            const snapshot = {
                abortSignal: this.pendingSuggestionAbortController.signal,
                textAreaValue: this._textarea.value,
                cursorPosition: this._textarea.selectionStart,
            };

            let suggestionText;
            try {
                await new Promise(resolve => setTimeout(resolve, 100));
                suggestionText = "This is a simulated suggestion.";
            } catch (ex) {
                if (ex instanceof DOMException && ex.name === 'AbortError') {
                    return;
                }
            }

            if (suggestionText
                && snapshot.textAreaValue === this._textarea.value
                && snapshot.cursorPosition === this._textarea.selectionStart) {
                if (!suggestionText.endsWith(' ')) {
                    suggestionText += ' ';
                }

                this.suggestionDisplay.show(suggestionText);
            }
        }
    }

    class InlineSuggestionDisplay {
        latestSuggestionText = '';
        suggestionStartPos = null;
        suggestionEndPos = null;
        fakeCaret = null;
        originalValueProperty;
        owner;
        textArea;

        constructor(owner, textArea) {
            this.textArea = textArea;
            this.owner = owner;
            this.originalValueProperty = findPropertyRecursive(textArea, 'value');
            const self = this;
            Object.defineProperty(textArea, 'value', {
                get() {
                    const trueValue = self.originalValueProperty.get.call(textArea);
                    return self.isShowing()
                        ? trueValue.substring(0, self.suggestionStartPos) + trueValue.substring(self.suggestionEndPos)
                        : trueValue;
                },
                set(v) {
                    self.originalValueProperty.set.call(textArea, v);
                }
            });
        }

        get valueIncludingSuggestion() {
            return this.originalValueProperty.get.call(this.textArea);
        }

        set valueIncludingSuggestion(val) {
            this.originalValueProperty.set.call(this.textArea, val);
        }

        isShowing() {
            return this.suggestionStartPos !== null;
        }

        show(suggestion) {
            this.latestSuggestionText = suggestion;
            this.suggestionStartPos = this.textArea.selectionStart;
            this.suggestionEndPos = this.suggestionStartPos + suggestion.length;

            this.textArea.setAttribute('data-suggestion-visible', '');
            this.valueIncludingSuggestion = this.valueIncludingSuggestion.substring(0, this.suggestionStartPos) + suggestion + this.valueIncludingSuggestion.substring(this.suggestionStartPos);
            this.textArea.setSelectionRange(this.suggestionStartPos, this.suggestionEndPos);

            this.fakeCaret ??= new Caret(this.owner, this.textArea);
            this.fakeCaret.show();
        }

        get currentSuggestion() {
            return this.latestSuggestionText;
        }

        accept() {
            this.textArea.setSelectionRange(this.suggestionEndPos, this.suggestionEndPos);
            this.suggestionStartPos = null;
            this.suggestionEndPos = null;
            this.fakeCaret?.hide();
            this.textArea.removeAttribute('data-suggestion-visible');

            // The newly-inserted text could be so long that the new caret position is off the bottom of the textarea.
            // It won't scroll to the new caret position by default
            scrollTextAreaDownToCaretIfNeeded(this.textArea);
            // this.textArea.scrollTop = this.textArea.scrollHeight;
        }

        reject() {
            if (!this.isShowing()) {
                return; // No suggestion is shown
            }

            const prevSelectionStart = this.textArea.selectionStart;
            const prevSelectionEnd = this.textArea.selectionEnd;
            this.valueIncludingSuggestion = this.valueIncludingSuggestion.substring(0, this.suggestionStartPos) + this.valueIncludingSuggestion.substring(this.suggestionEndPos);

            if (this.suggestionStartPos === prevSelectionStart && this.suggestionEndPos === prevSelectionEnd) {
                // For most interactions we don't need to do anything to preserve the cursor position, but for
                // 'scroll' events we do (because the interaction isn't going to set a cursor position naturally)
                this.textArea.setSelectionRange(prevSelectionStart, prevSelectionStart /* not 'end' because we removed the suggestion */);
            }

            this.suggestionStartPos = null;
            this.suggestionEndPos = null;
            this.textArea.removeAttribute('data-suggestion-visible');
            this.fakeCaret?.hide();
        }
    }

    class Caret {
        caret;
        textArea;

        constructor(owner, textArea) {
            this.owner = owner;
            this.textArea = textArea;

            this.caret = owner.shadowRoot?.querySelector('.caret');
        }

        show() {
            const caretOffset = getCaretOffsetFromOffsetParent(this.textArea);
            const style = this.caret.style;
            style.display = 'block';
            style.top = caretOffset.top + 'px';
            style.left = caretOffset.left + 'px';
            style.height = caretOffset.height + 'px';
            style.zIndex = this.textArea.style.zIndex;
            style.backgroundColor = caretOffset.caretColor;
        }

        hide() {
            this.caret.style.display = 'none';
        }
    }

    function findPropertyRecursive(obj, propName) {
        while (obj) {
            const descriptor = Object.getOwnPropertyDescriptor(obj, propName);
            if (descriptor) return descriptor;
            obj = Object.getPrototypeOf(obj);
        }

        throw new Error(`Property ${propName} not found on object or its prototype chain`);
    }

    function scrollTextAreaDownToCaretIfNeeded(textArea) {
        textArea.scrollTop = textArea.scrollHeight + 100;
        return;

        // Note that this only scrolls *down*, because that's the only scenario after a suggestion is accepted
        const pos = getPosition(textArea);
        // const lineHeightInPixels = parseFloat(window.getComputedStyle(textArea).lineHeight);
        const lineHeightInPixels = parseFloat(pos.lineHeight);
        if (pos.top > textArea.clientHeight + textArea.scrollTop - lineHeightInPixels) {
            textArea.scrollTop = pos.top - textArea.clientHeight + lineHeightInPixels;
        }
    }

    function getCaretOffsetFromOffsetParent(elem) {
        const elemStyle = window.getComputedStyle(elem);
        const pos = getPosition(elem);

        const scrollTop = elem.scrollTop;
        const scrollHeight = elem.scrollHeight;
        const scrollOffset = scrollTop > scrollHeight ? scrollHeight : scrollTop;

        return {
            top: pos.top + parseFloat(elemStyle.borderTopWidth) + elem.offsetTop - scrollOffset,
            left: pos.left + parseFloat(elemStyle.borderLeftWidth) + elem.offsetLeft - elem.scrollLeft - 0.25,
            height: pos.height,
            caretColor: elemStyle.caretColor,
        }
    }

    function insertTextAtCaretPosition(textArea, text) {
        // Even though document.execCommand is deprecated, it's still the best way to insert text, because it's
        // the only way that interacts correctly with the undo buffer. If we have to fall back on mutating
        // the .value property directly, it works but erases the undo buffer.
        if (document.execCommand) {
            document.execCommand('insertText', false, text);
        } else {
            let caretPos = textArea.selectionStart;
            textArea.value = textArea.value.substring(0, caretPos)
                + text
                + textArea.value.substring(textArea.selectionEnd);
            caretPos += text.length;
            textArea.setSelectionRange(caretPos, caretPos);
        }
    }

    function escapeHtml(text) {
        if (!text) return '';

        return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || ''));
    }

    function getPosition(element) {
        const position = element.selectionStart;
        const startRange = element.value.slice(0, position);
        const endRange = element.value.slice(position);

        const id = 'marker-' + Math.random().toString(36);

        let html = `<span style="position: relative; display: inline;">${cleanse(startRange)}</span>`;
        html += `<span id="${id}" style="position: relative; display: inline;">|</span>`;
        html += `<span style="position: relative; display: inline;">${cleanse(endRange)}</span>`;

        const mirror = element.ownerDocument.createElement('div');
        const css = getCss();
        Object.keys(css).forEach(key => {
            mirror.style[key] = css[key];
        });
        mirror.innerHTML = html;
        element.parentNode.insertBefore(mirror, element.nextSibling);

        const marker = element.parentNode.getElementById(id);
        const rect = {
            left: marker.offsetLeft,
            top: marker.offsetTop,
            height: marker.offsetHeight
        };
        mirror.parentNode.removeChild(mirror);

        rect.pos = element.selectionStart;
        rect.lineHeight = css.lineHeight;

        return rect;

        function cleanse(val) {
            let value = val.replace(/<|>|`|"|&/g, '?')
                .replace(/\r\n|\r|\n/g, '<br/>');
            return value;
        };

        function getCss() {
            const attributes = [
                'borderBottomWidth',
                'borderLeftWidth',
                'borderRightWidth',
                'borderTopStyle',
                'borderRightStyle',
                'borderBottomStyle',
                'borderLeftStyle',
                'borderTopWidth',
                'boxSizing',
                'fontFamily',
                'fontSize',
                'fontWeight',
                'height',
                'letterSpacing',
                'lineHeight',
                'marginBottom',
                'marginLeft',
                'marginRight',
                'marginTop',
                'outlineWidth',
                'overflow',
                'overflowX',
                'overflowY',
                'paddingBottom',
                'paddingLeft',
                'paddingRight',
                'paddingTop',
                'textAlign',
                'textOverflow',
                'textTransform',
                'whiteSpace',
                'width',
                'wordBreak',
                'wordWrap',
            ];
            const css = {
                position: 'absolute',
                left: -9999,
                top: 0,
                zIndex: -2000
            };
            const computedStyle = getComputedStyle(element);
            attributes.forEach((attr) => {
                css[attr] = computedStyle[attr];
            });
            return css;
        };
    };

    customElements.define('ghost-textarea2', GhostTextarea2);

    window.GhostTextarea2 = GhostTextarea2;
}())