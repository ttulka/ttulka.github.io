(function () {
    'use strict';

    class ShowPage {
        constructor(document) {
            this.document = document;
        }
        show(page) {
            this._mergeHeaders(this.document.querySelector('head'), page.querySelector('head'));
            this._mergeBody(this.document.querySelector('body'), page.querySelector('body'));
        }
        _mergeBody(body, newBody) {
            body.innerHTML = newBody.innerHTML;

            body.querySelectorAll('script')
                .forEach(s => s.parentNode.replaceChild(this._scriptElement(s), s));
        }
        _mergeHeaders(head, newHead) {
            const headers = this._headers(head);
            const newHeaders = this._headers(newHead);
            const textHeaders = this._textHeaders(head);
            const newTextHeaders = this._textHeaders(newHead);
            headers
                .filter(h => !this._hasHeader(newHeaders, h))
                .forEach(({ node }) => head.removeChild(node));
            newHeaders
                .filter(h => !this._hasHeader(headers, h))
                .forEach(({ node }) => head.appendChild(node));

            newTextHeaders.forEach(({ name, node }) => {
                const old = textHeaders.find(h => name === h.name);
                if (old) {
                    head.replaceChild(node, old.node);
                } else {
                    head.appendChild(node);
                }
            });
        }
        _hasHeader(headers, { name, attributes }) {
            return headers.find(h => name === h.name && isSameArray(attributes, h.attributes));
        }
        _headers(head) {
            const headers = [];
            for (const ch of head.children) {
                if (ch.innerText) {
                    continue;
                }
                const attributes = [];
                for (const { name, value } of ch.attributes) {
                    attributes.push({ name, value });
                }
                headers.push({ name: ch.nodeName, attributes, node: ch });
            }
            return headers;
        }
        _textHeaders(head) {
            const headers = [];
            for (const ch of head.children) {
                if (ch.innerText) {
                    headers.push({ name: ch.nodeName, node: ch });
                }
            }
            return headers;
        }
        _scriptElement(element) {
            if (element.id === 'prelinks') {
                return element;
            }
            const scriptEl = document.createElement("script");
            scriptEl.textContent = element.textContent;
            scriptEl.async = false;
            this._copyElementAttributes(scriptEl, element);
            return scriptEl;
        }
        _copyElementAttributes(dest, src) {
            for (const { name, value } of src.attributes) {
                dest.setAttribute(name, value);
            }
        }
    }

    function isSameArray(arr1, arr2) {
        return arr1.length === arr2.length
            && arr1.reduce((acc, cur) => acc &&
                arr2.find(({ name, value }) =>
                    cur.name === name && cur.value === value), true);
    }

    class PreLinks {
        constructor(document, cache, history, progressMethod) {
            this.document = document;
            this.cache = cache;
            this.history = history;
            this.progressMethod = progressMethod;
            this.showPage = new ShowPage(document);
            this.anchors = [];

            this._onClickEvent = this._onClickEvent.bind(this);
            this._onMouseenterEvent = this._onMouseenterEvent.bind(this);
            this._onHistoryPoppedEvent = this._onHistoryPoppedEvent.bind(this);

            console.debug('PreLinks constructed.');
        }
        start(currentUrl) {
            this.history.start(currentUrl);
            this._init(currentUrl);
        }
        stop() {
            this._destroy();
        }
        _init(link) {
            document.querySelectorAll('a').forEach(a => {
                this.anchors.push(a);
                a.addEventListener('click', this._onClickEvent);
                a.addEventListener('mouseenter', this._onMouseenterEvent);
            });

            this.history.addEventListener('popped', this._onHistoryPoppedEvent);

            this.cache.put(link, this.document);

            console.debug('Prelinks initialized.');
        }
        _destroy() {
            this.anchors.forEach(a => {
                a.removeEventListener('click', this._onClickEvent);
                a.removeEventListener('mouseenter', this._onMouseenterEvent);
            });

            this.history.removeEventListener('popped', this._onHistoryPoppedEvent);

            console.debug('Prelinks destroyed.');
        }
        showLink(link) {
            this.showProgress();
            this.cache.page(link)
                .then(p => this.showPage.show(p))
                .then(_ => {
                    this._destroy();
                    this._init(link);
                    this.hideProgress();
                })
                .catch(err => console.error('Cannot show the page.', link, err));
        }
        loadLink(link, force = false) {
            this.cache.load(link, force)
                .catch(err => console.error('Cannot load the page.', link, err));
        }
        showProgress() {
            if (this.progressMethod) {
                this.progressMethod.show(this.document);
            }
        }
        hideProgress() {
            if (this.progressMethod) {
                this.progressMethod.hide(this.document);
            }
        }
        _onClickEvent(e) {
            if (e.target.getAttribute('data-prelinks') !== 'false') {
                e.preventDefault();
                const link = e.target.href;
                if (link) {
                    console.debug('Link clicked', link);
                    this.history.push(link);
                    this.showLink(link);
                }
            }
        }
        _onMouseenterEvent(e) {
            if (e.target.getAttribute('data-prelinks') !== 'false') {
                const link = e.target.href;
                if (link) {
                    console.debug('Link entered', link);
                    const force = e.target.getAttribute('data-prelinks-cache') === 'false';
                    this.loadLink(link, force);
                }
            }
        }
        _onHistoryPoppedEvent(e) {
            const link = e.detail;
            if (link) {
                console.debug('Link popped', link);
                this.showLink(link);
            }
        }
    }

    class PageCache extends EventTarget {
        constructor(limit, alwaysForce = false) {
            super();
            this.cache = new LmitedPageCache(limit && limit > 1 ? limit : 10);
            this.alwaysForce = !!alwaysForce;
            this.loading = new Set();

            console.debug('PageCache constructed.');
        }
        async load(link, force = false) {
            let cache = this.cache;
            if (this.loading.has(link)) {
                return cache;
            }
            if (force || this.alwaysForce || !cache.has(link)) {
                this.loading.add(link);

                const page = await htmlPage(link);

                cache = cache.put(link, page);
                this.cache = cache;

                this.loading.delete(link);
                this.dispatchEvent(new CustomEvent('loaded', { detail: { link, page } }));

                console.debug('Loaded', link);

            } else {
                cache.hit(link);
            }
            return cache;
        }
        async page(link) {
            const onPageLoaded = new Promise(resolve => {
                const listener = ({ detail }) => {
                    if (detail.link === link) {
                        this.removeEventListener('loaded', listener);
                        resolve(detail.page);
                    }
                };
                this.addEventListener('loaded', listener, false);
            });

            if (this.loading.has(link)) {
                return onPageLoaded;
            }
            const cache = this.cache;
            if (!cache.has(link)) {
                this.load(link);
                return onPageLoaded;
            }
            return cache.get(link).cloneNode(true);
        }
        put(link, document) {
            const cache = this.cache;
            if (!cache.has(link)) {
                this.cache = cache.put(link, document.cloneNode(true));
                console.debug('Loaded', link);
            }
        }
    }

    class LmitedPageCache {
        constructor(limit, initCache = new Map()) {
            this.limit = limit;
            this.pages = initCache;
        }
        get(link) {
            if (this.pages.has(link)) {
                return this.pages.get(link).document;
            }
        }
        put(link, document) {
            const newCache = new LmitedPageCache(this.limit, this.pages);

            const hits = newCache.pages.has(link) ? newCache.pages.get(link).hits + 1 : 1;
            newCache.pages.set(link, { document, hits });

            newCache._cleanup(link);
            return newCache;
        }
        has(link) {
            return this.pages.has(link);
        }
        hit(link) {
            const page = this.pages.get(link);
            if (page) {
                page.hits++;
            }
        }
        _cleanup(currentLink) {
            if (this.pages.size > this.limit) {
                const entries = this.pages.entries();
                let toRemove;
                let min = Number.MAX_VALUE;
                for (let [link, page] of entries) {
                    if (page.hits < min && link !== currentLink) {
                        toRemove = link;
                        min = page.hits;
                    }
                }
                if (toRemove) {
                    this.pages.delete(toRemove);

                    console.debug('Removed from cache', toRemove);
                }
            }
        }
    }

    function htmlPage(link) {
        return fetch(link)
            .then(r => r.text())
            .then(r => new DOMParser().parseFromString(r, 'text/html'))
    }

    class LinksHistory extends EventTarget {
        constructor(window, history) {
            super();
            this.window = window;
            this.history = history;

            this._onPopstateEvent = this._onPopstateEvent.bind(this);
        }
        start(url) {
            this.history.replaceState(url, url, url);

            window.addEventListener('popstate', this._onPopstateEvent);
        }
        stop() {
            window.removeEventListener('popstate', this._onPopstateEvent);
        }
        push(link) {
            this.history.pushState(link, link, link);
            console.debug('Link pushed to history', link);
        }
        _onPopstateEvent(e) {
            if (e.state) {
                this.dispatchEvent(new CustomEvent('popped', { detail: e.state }));
            }
        }
    }

    class ProgressMethod {
        constructor(id, styleId, styleValue) {
            this.id = id;
            this.styleId = styleId;
            this.styleValue = styleValue;
            this.origin = '';
        }
        show(document) {
            this.origin = document.body.style[this.styleId];
            document.body.style[this.styleId] = this.styleValue;
        }
        hide(document) {
            document.body.style[this.styleId] = this.origin;
        }
    }

    (function () {
        const progressMethods = [
            new ProgressMethod('blur', 'filter', 'blur(1rem)')
        ];

        const prelinks = new PreLinks(
            window.document,
            new PageCache(
                settingValue('cache-limit'),
                settingValue('cache-control') === 'no-cache'),
            new LinksHistory(
                window,
                window.history),
            progressMethods.find(({ id }) => id === settingValue('progress', 'none'))
        );

        prelinks.start(window.location.href);

        window.addEventListener('unload', _ => prelinks.stop());

        function settingValue(name, def = null) {
            const meta = window.document.querySelector(`head meta[name="prelinks-${name}"]`);
            return meta && meta.getAttribute('content') || def;
        }
    })();

}());
