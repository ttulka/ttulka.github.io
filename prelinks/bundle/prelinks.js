(function () {
    'use strict';

    class PreLinks {
        constructor(document, loader, history, progressMethods) {
            this.document = document;
            this.loader = loader;
            this.history = history;
            this.anchors = [];

            const progressMethodId = this._progressMethodIdFromHead(document);
            this.progressMethod = progressMethods.find(({ id }) => id === progressMethodId);

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

            this.loader.add(link, this.document);

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
            this.loader.show(link)
                .then(_ => {
                    this._destroy();
                    this._init(link);
                    this.hideProgress();
                })
                .catch(err => console.error('Cannot show the page.', link, err));
        }
        loadLink(link) {
            this.loader.load(link)
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
            if (e.target.getAttribute('data-prelink') !== 'false') {
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
            if (e.target.getAttribute('data-prelink') !== 'false') {
                const link = e.target.href;
                if (link) {
                    console.debug('Link entered', link);
                    this.loadLink(link);
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
        _progressMethodIdFromHead() {
            const progressMeta = this.document.querySelector('head meta[name="prelinks-progress"]');
            return progressMeta ? progressMeta.getAttribute('content') : 'none';
        }
    }

    class PageLoader {
        constructor(document, history) {
            this.document = document;
            this.pages = new Map();
            this.loading = new Set();
            console.debug('PageLoader constructed.');
        }
        async load(link, force = false) {
            if (force || !this.loading.has(link) && !this.pages.has(link)) {
                this.loading.add(link);

                const html = await fetch(link)
                    .then(r => r.text())
                    .then(r => new DOMParser().parseFromString(r, 'text/html'));
                this.pages.set(link, html);

                this.loading.delete(link);

                console.debug('Loaded', link);
            }
        }
        async show(link) {
            if (!this.pages.has(link)) {
                await this.load(link);
            }
            if (this._forceLoad(this.pages.get(link))) {
                await this.load(link, true);
            }
            const page = this.pages.get(link).cloneNode(true);
            const body = page.querySelector('body');
            const head = page.querySelector('head');

            this.document.querySelector('head').innerHTML = head.innerHTML;

            const pageBody = this.document.querySelector('body');
            pageBody.innerHTML = body.innerHTML;

            pageBody.querySelectorAll('script').forEach(s => s.parentNode.replaceChild(this._scriptElement(s), s));

            

            console.debug('Shown', link);
        }
        add(link, document) {
            if (!this.pages.has(link)) {
                this.pages.set(link, document.cloneNode(true));
                console.debug('Loaded', link);
            }
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
        _forceLoad(page) {
            const meta = page.querySelector('head meta[name="prelinks-cache-control"]');
            return meta && meta.getAttribute('content') === 'no-cache';
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

    (function () {
        const prelinks = new PreLinks(
            window.document,
            new PageLoader(window.document),
            new LinksHistory(
                window,
                window.history),
            [new ProgressMethod('blur', 'filter', 'blur(1rem)')]);

        prelinks.start(window.location.href);

        window.addEventListener('unload', _ => prelinks.stop());
    })();

}());
