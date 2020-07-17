(function () {
    'use strict';

    class PageLoader {
        constructor(document) {
            this.document = document;
        }
        show(page) {
            const newBody = page.querySelector('body');
            const newHead = page.querySelector('head');

            this.document.querySelector('head').innerHTML = newHead.innerHTML;

            const body = this.document.querySelector('body');
            body.innerHTML = newBody.innerHTML;

            body.querySelectorAll('script')
                .forEach(s => s.parentNode.replaceChild(this._scriptElement(s), s));
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

    class PreLinks {
        constructor(document, cache, history, progressMethod) {
            this.document = document;
            this.cache = cache;
            this.history = history;
            this.progressMethod = progressMethod;
            this.loader = new PageLoader(document);
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
                .then(p => this.loader.show(p))
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

    class PageCache {
        constructor(limit, alwaysForce = false) {
            this.cache = new LmitedPageCache(limit && limit > 1 ? limit : 10);
            this.alwaysForce = !!alwaysForce;
            this.loading = new Set();

            console.debug('PageCache constructed.');
        }
        async load(link, force = false) {
            let cache = this.cache;
            if (force || this.alwaysForce || !this.loading.has(link) && !cache.has(link)) {
                this.loading.add(link);

                const html = await htmlPage(link);
                
                cache = cache.put(link, html);
                this.cache = cache;

                this.loading.delete(link);

                console.debug('Loaded', link);

            } else {
                cache.hit(link);
            }
            return cache;
        }
        async page(link) {
            let cache = this.cache;
            if (!this.cache.has(link)) {
                cache = await this.load(link);
            
            } else if (this._forceLoad(this.cache.get(link))) {
                cache = await this.load(link, true);
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
        _forceLoad(page) {
            const meta = page.querySelector('head meta[name="prelinks-cache-control"]');
            return meta && meta.getAttribute('content') === 'no-cache';
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
