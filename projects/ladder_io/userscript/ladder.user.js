// ==UserScript==
// @name         Ladder Paywall Remover
// @namespace    http://ladder.io
// @version      1.0
// @description  Automatically remove paywall popups, restore scroll, unblur content
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const BLOCK_KEYWORDS = [
        "adblock", "membership", "subscribe", "subscription",
        "pay to view", "paywall", "upgrade to continue",
        "become a member", "disable your adblocker",
        "support us", "exclusive content"
    ];

    function looksLikePopup(el) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || el.offsetParent === null) return false;

        const isOverlay = (
            style.position === "fixed" || style.position === "absolute"
        ) && (
            parseInt(style.zIndex) > 1000 ||
            el.className.toLowerCase().includes("overlay") ||
            el.className.toLowerCase().includes("backdrop")
        );

        const text = (el.innerText || "").toLowerCase();
        const hasBadText = BLOCK_KEYWORDS.some(keyword => text.includes(keyword));

        return isOverlay || hasBadText;
    }

    function nukeElement(el) {
        el.remove();

        if (document.body.style.overflow === "hidden" || document.documentElement.style.overflow === "hidden") {
            document.body.style.overflow = "auto";
            document.documentElement.style.overflow = "auto";
        }

        document.querySelectorAll('*').forEach(e => {
            const style = getComputedStyle(e);
            if (style.filter && style.filter.includes("blur")) e.style.filter = "none";
            if (style.backdropFilter && style.backdropFilter.includes("blur")) e.style.backdropFilter = "none";
            if (parseFloat(style.opacity) < 1 && e !== document.body && e !== document.documentElement) e.style.opacity = "1";
        });
    }

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (looksLikePopup(node)) {
                    nukeElement(node);
                } else {
                    node.querySelectorAll("*").forEach(child => {
                        if (looksLikePopup(child)) nukeElement(child);
                    });
                }
            }
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
})();
