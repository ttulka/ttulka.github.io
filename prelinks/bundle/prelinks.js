(function () {
    'use strict';

    class PreLinks {
        constructor(document, loader, history) {
            this.document = document;
            this.loader = loader;
            this.history = history;
            this.anchors = [];

            this._onClickEvent = this._onClickEvent.bind(this);
            this._onMouseenterEvent = this._onMouseenterEvent.bind(this);
            this._onHistoryPoppedEvent = this._onHistoryPoppedEvent.bind(this);
            
            console.debug('PreLinks constructed.');
        }
        init(currentUrl) {
            document.querySelectorAll('a').forEach(a => {
                this.anchors.push(a);
                a.addEventListener('click', this._onClickEvent);
                a.addEventListener('mouseenter', this._onMouseenterEvent);
            });

            this.history.addEventListener('popped', this._onHistoryPoppedEvent);
            
            this.loader.add(currentUrl, this.document);
                    
            console.debug('Prelinks initialized.');
        }
        destroy() {        
            this.anchors.forEach(a => {
                a.removeEventListener('click', this._onClickEvent);
                a.removeEventListener('mouseenter', this._onMouseenterEvent);
            });

            this.history.removeEventListener('popped', this._onHistoryPoppedEvent);

            console.debug('Prelinks destroyed.');
        }
        _showLink(link) {
            this.loader.show(link)
                .then(_ => {
                    this.destroy();
                    this.init(link);
                })
                .catch(err => console.error('Cannot show the page.', link, err));
        }
        _loadLink(link) {
            this.loader.load(link)
                .catch(err => console.error('Cannot load the page.', link, err));
        }
        _onClickEvent(e) {
            e.preventDefault();
            const link = e.target.href;
            if (link) {            
                console.debug('Link clicked', link);
                this.history.push(link);
                this._showLink(link);
            }
        }
        _onMouseenterEvent(e) {
            const link = e.target.href;
            if (link) {
                console.debug('Link entered', link);
                this._loadLink(link);
            }
        }
        _onHistoryPoppedEvent(e) {
            const link = e.detail;
            if (link) {
                console.debug('Link popped', link);
                this._showLink(link);     
            }
        }
    }

    class PageLoader {
        constructor(document, history) {
            this.document = document;
            this.pages = new Map();
            this.loading = new Set();
            console.debug('PageLoader constructed.');
        }
        async load(link) {
            if (!this.loading.has(link) && !this.pages.has(link)) {
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
        _onPopstateEvent(e) {
            if (e.state) {
                this.dispatchEvent(new CustomEvent('popped', { detail: e.state }));
            }
        }
        push(link) {
            this.history.pushState(link, link, link);
            console.debug('Link pushed to history', link);
        }
    }

    (function () {
        const history = new LinksHistory(
            window,
            window.history);
        const prelinks = new PreLinks(
            window.document,
            new PageLoader(window.document),
            history);

        prelinks.init(window.location.href);
        history.start(window.location.href);

        window.addEventListener('unload', e => {
            prelinks.destroy();
            history.stop();
        });
    })();

}());
