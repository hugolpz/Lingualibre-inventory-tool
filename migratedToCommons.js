// ==UserScript==
// @name         Lingua Libre Migration Redirect
// @description  Redirects migrated Lingua Libre pages to their new location on Wikimedia Commons
// @author       Yug
// @version      1.0
// @match        https://lingualibre.org/wiki/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Transformation rules from json/replaces.json (type: "rename" only)
    const transformRules = [
        { match: "Category:Tool", replace: "Category:Lingua Libre tool" },
        { match: "Category:Speakers in", replace: "Category:Voice contributors in" },
        { match: "LinguaLibre:", replace: "Commons:Lingua Libre/" },
        { match: "List:", replace: "Commons:Lingua Libre/Lists/" },
        { match: "Welcome/", replace: "Welcome-LL/" },
        { match: "Help:Main", replace: "Help:Lingua Libre" },
        { match: "Help:", replace: "Help:Lingua Libre/" },
        // Namespaces that keep the same name but redirect to Commons
        { match: "^(User:|Category:|Translations:|Template:)", replace: "$1", redirectToCommons: true },
    ];

    /**
     * Apply transformation rules to a page title
     * @param {string} title - The page title to transform
     * @returns {string|null} - The transformed title, or null if no transformation applied
     */
    function transformPageTitle(title) {
        let transformed = title;
        let hasChanged = false;

        for (const rule of transformRules) {
            const regex = new RegExp(rule.match, 'g');
            const newTitle = transformed.replace(regex, rule.replace);
            
            // Check if title changed OR if it's a redirectToCommons rule
            if (newTitle !== transformed) {
                transformed = newTitle || title;
                hasChanged = true;
            } else if (rule.redirectToCommons && regex.test(title)) {
                // Title didn't change but should redirect to Commons
                hasChanged = true;
            }
        }

        return hasChanged ? transformed : null;
    }

    /**
     * Check if a page exists on Commons using the MediaWiki API
     * @param {string} pageTitle - The page title to check
     * @returns {Promise<boolean>} - True if page exists with content, false otherwise
     */
    async function pageExistsOnCommons(pageTitle) {
        const apiUrl = 'https://commons.wikimedia.org/w/api.php';
        const params = new URLSearchParams({
            action: 'query',
            titles: pageTitle,
            prop: 'revisions',
            rvprop: 'content',
            format: 'json',
            origin: '*'
        });

        try {
            const response = await fetch(`${apiUrl}?${params}`);
            const data = await response.json();
            
            if (!data.query || !data.query.pages) {
                return false;
            }

            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            
            // Check if page exists (pageId !== '-1') and has content
            if (pageId === '-1') {
                return false;
            }

            const page = pages[pageId];
            return page.revisions && page.revisions.length > 0;
            
        } catch (error) {
            console.error('migratedToCommons.js: Error checking Commons page:', error);
            return false;
        }
    }

    /**
     * Replace the page content with a redirect message
     * @param {string} pageTitle - The original page title
     * @param {string} newPageTitle - The new page title on Commons
     */
    function showRedirectMessage(pageTitle, newPageTitle) {
        const contentElement = document.getElementById('mw-content-text');
        
        if (!contentElement) {
            console.warn('migratedToCommons.js: Could not find #mw-content-text element');
            return;
        }

        const newPageContent = `
<div id="mw-content-text" lang="en" dir="ltr" class="mw-content-ltr">
  <div class="mw-parser-output">
    <div class="redirectMsg">
      <p><b>This page now redirects to Wikimedia Commons:</b></p>
      <ul class="redirectText">
        <li><a href="https://commons.wikimedia.org/wiki/${encodeURIComponent(newPageTitle)}" title="${pageTitle}">:c:${newPageTitle}</a></li>
      </ul>
      <small>See also the <a href="https://commons.wikimedia.org/wiki/Commons:Lingua_Libre" title="Lingua Libre:Migration to Wikimedia Commons">migration announcement</a> for more details.</small>
    </div>
  </div>
</div>`;

        contentElement.outerHTML = newPageContent;
        
        console.log(`migratedToCommons.js: Redirected "${pageTitle}" to "${newPageTitle}"`);
    }

    /**
     * Main function - checks if current page should be redirected
     */
    async function init() {
        // Get the current page title from MediaWiki config
        const pageTitle = mw.config.get('wgPageName').replace(/_/g, ' ');
        
        // Check if we're on a regular page (not special page, not editing, etc.)
        const action = mw.config.get('wgAction');
        const namespace = mw.config.get('wgNamespaceNumber');
        
        // Only run on view action (not edit, history, etc.)
        if (action !== 'view') {
            return;
        }

        // Apply transformation rules
        const newPageTitle = transformPageTitle(pageTitle);
        
        // If transformation was applied, check if page exists on Commons
        if (newPageTitle) {
            const exists = await pageExistsOnCommons(newPageTitle);
            
            if (exists) {
                showRedirectMessage(pageTitle, newPageTitle);
            } else {
                console.log(`migratedToCommons.js: Page "${newPageTitle}" does not exist on Commons yet`);
            }
        }
    }

    // Wait for MediaWiki to be ready
    if (typeof mw !== 'undefined' && mw.loader) {
        mw.loader.using(['mediawiki.util'], function() {
            init();
        });
    } else {
        // Fallback if mw is not available
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

})();
