// ==UserScript==
// @name         Lingua Libre Namespace Fetcher
// @namespace    
// @version      1.0
// @description 1. Provides a button to open a modal ; 2. Fetch and display namespace statistics on Lingua Libre ; 3. Logs list of pagenames
// @author       Yug
// @match        https://lingualibre.org/wiki/*
// ==/UserScript==

(function() {
    'use strict';

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
        #ll-namespace-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #a2a9b1;
            border-radius: 8px;
            padding: 20px;
            max-width: 90vw;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            font-family: sans-serif;
            min-width: 600px;
        }
        #ll-namespace-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 999;
        }
        #ll-namespace-table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 20px;
        }
        #ll-namespace-table th,
        #ll-namespace-table td {
            border: 1px solid #a2a9b1;
            padding: 8px 12px;
            text-align: left;
        }
        #ll-namespace-table th {
            background-color: #eaecf0;
            font-weight: bold;
        }
        .ll-status-include {
            background-color: #d4edda !important;
            color: #155724;
        }
        .ll-status-exclude {
            background-color: #f8d7da !important;
            color: #721c24;
        }
        .ll-close-btn {
            float: right;
            background: #0645ad;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 10px;
        }
        .ll-close-btn:hover {
            background: #0b0080;
        }
        .ll-progress {
            margin: 10px 0;
            padding: 10px;
            background: #f8f9fa;
            border-left: 4px solid #0645ad;
            font-family: monospace;
        }
        .ll-refresh-btn {
            background: #00af89;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 10px;
            margin-right: 10px;
        }
        .ll-refresh-btn:hover {
            background: #008a6a;
        }
        .ll-refresh-btn:disabled {
            background: #a2a9b1;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);

    // Namespace data
    const namespaces = [
        { id: 2, name: "User:*", quantity: 0, plan:'❌ Discard', pages: [] },
        { id: 4, name: "Lingualibre:*", quantity: 0, plan:'✅ Import', pages: [] },
        { id: 8, name: "MediaWiki:*", quantity: 0, plan:'❌ Discard', pages: [] },
        { id: 10, name: "Template:*", quantity: 0, plan:'🧹 Clean up', pages: [] },
        { id: 12, name: "Help:*", quantity: 0, plan:'✅ Import', pages: [] },
        { id: 14, name: "Category:*", quantity: 0, plan:'🧹 Clean up', pages: [] },
        { id: 142, name: "List:*", quantity: 0, plan:'🧹 Clean up', pages: [] },
        { id: 1198, name: "Translations:*", quantity: 0, plan:'✅ Import', pages: [] },
        { id: 2300, name: "Gadget:*", quantity: 0, plan:'❌ Discard', pages: [] }
    ];
    let isRefreshing = false;

    // Fetch pages in namespace
    async function fetchPagesInNamespace(nsId, nsTitle, apcontinue = null, collectedPages = new Set()) {
        const endpoint = "https://lingualibre.org/api.php";
        const params = new URLSearchParams({
            action: "query",
            format: "json",
            list: "allpages",
            apnamespace: nsId,
            aplimit: "500",
            origin: "*"
        });
        if (apcontinue) {
            params.set("apcontinue", apcontinue);
        }
        const url = `${endpoint}?${params.toString()}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.error) {
                throw new Error(`API Error: ${data.error.info || data.error.code}`);
            }
            
            if (data.query && data.query.allpages) {
                for (const page of data.query.allpages) {
                    collectedPages.add(page.title);
                }
            }
            
            if (data.continue && data.continue.apcontinue) {
                await fetchPagesInNamespace(nsId, nsTitle, data.continue.apcontinue, collectedPages);
            }
        } catch (error) {
            console.error(`Error fetching pages for namespace ${nsId} (${nsTitle}):`, error);
        }

        return collectedPages;
    }

    // Update table
    function updateNamespaceTable() {
        const tableBody = document.getElementById('ll-namespace-table-body');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        namespaces.forEach(ns => {
            const row = document.createElement('tr');
            const status = ns.quantity > 0 ? '✅' : '❌';
            const statusClass = ns.quantity > 0 ? 'll-status-include' : 'll-status-exclude';
            const plan = ns.plan;
            
            row.innerHTML = `
                <td>${ns.id}</td>
                <td style="font-family: monospace;">${ns.name}</td>
                <td style="text-align: right; font-weight: bold;" class="${statusClass}">${status+' '+ ns.quantity.toLocaleString()}</td>
                <td  style="text-align: center;">${plan}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // Update progress
    function updateProgress(message) {
        const progressDiv = document.getElementById('ll-progress');
        if (progressDiv) {
            progressDiv.textContent = message;
        }
    }

    // Process namespaces
    async function processNamespaces() {
        if (isRefreshing) return;
        
        isRefreshing = true;
        const refreshBtn = document.getElementById('ll-refresh-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
        }

        console.log("🚀 Starting namespace data fetch...");
        updateProgress("Starting namespace data fetch...");
        
        for (let i = 0; i < namespaces.length; i++) {
            try {
                const ns = namespaces[i];
                updateProgress(`Processing ${i + 1}/${namespaces.length}: ${ns.name}`);
                console.log(`📋 Processing namespace ${i + 1}/${namespaces.length}: ${ns.name}`);
                
                const pages = await fetchPagesInNamespace(ns.id, ns.name);
                ns.quantity = pages.size;
                ns.pages = Array.from(pages);

                console.log(`✅ ${pages.size} pages for ${ns.name}`);
                console.log(`Pages for ${ns.name}:`, pages);
                updateNamespaceTable();
                
                // Add delay between requests (except for the last one)
                if (i < namespaces.length - 1) {
                    updateProgress(`Waiting before next request... (${i + 1}/${namespaces.length} completed)`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (err) {
                console.error(`❌ Failed to fetch data for ${namespaces[i].name}:`, err);
                updateProgress(`Error processing ${namespaces[i].name}: ${err.message}`);
            }
        }
        
        console.log("🎉 All namespace data processing completed!");
        updateProgress("✅ All namespace data processing completed!");
        
        isRefreshing = false;
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Data';
        }
    }

    // Create modal
    function createModal() {
        // Remove existing modal if present
        const existingOverlay = document.getElementById('ll-namespace-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'll-namespace-overlay';
        overlay.addEventListener('click', () => overlay.remove());

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'll-namespace-modal';
        modal.addEventListener('click', (e) => e.stopPropagation());

        modal.innerHTML = `
            <button class="ll-close-btn" onclick="document.getElementById('ll-namespace-overlay').remove()">Close</button>
            <button class="ll-refresh-btn" id="ll-refresh-btn">Refresh Data</button>
            <h2>Lingua Libre Namespace Statistics</h2>
            <div id="ll-progress" class="ll-progress">Click "Refresh Data" to fetch current statistics</div>
            <table id="ll-namespace-table">
                <thead>
                    <tr>
                        <th style="text-align:center;">NS</th>
                        <th style="text-align:center;">Prefix</th>
                        <th style="text-align:right;">Count</th>
                        <th style="text-align:center;">Approach</th>
                    </tr>
                </thead>
                <tbody id="ll-namespace-table-body">
                </tbody>
            </table>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Add refresh button event listener
        const refreshBtn = document.getElementById('ll-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', processNamespaces);
        }

        // Initialize table
        updateNamespaceTable();
    }

    // Add link to MediaWiki sidebar
    function addSidebarLink() {
        // Try different sidebar locations based on MediaWiki skin
        const toolbox = document.getElementById('p-tb');
        const navigation = document.getElementById('p-navigation');
        const sidebar = document.getElementById('mw-panel');
        
        let targetElement = null;
        
        if (toolbox && toolbox.querySelector('ul')) {
            // Vector skin toolbox
            targetElement = toolbox.querySelector('ul');
        } else if (navigation && navigation.querySelector('ul')) {
            // Some skins have navigation
            targetElement = navigation.querySelector('ul');
        } else if (sidebar) {
            // Fallback to main sidebar
            const firstPortlet = sidebar.querySelector('.portal ul');
            if (firstPortlet) {
                targetElement = firstPortlet;
            }
        }
        
        if (targetElement) {
            const listItem = document.createElement('li');
            listItem.innerHTML = '<a href="#" id="ll-namespace-link">Namespace Stats</a>';
            
            const link = listItem.querySelector('#ll-namespace-link');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                createModal();
            });
            
            targetElement.appendChild(listItem);
            console.log('✅ Lingua Libre Namespace Fetcher: Added sidebar link');
        } else {
            // Fallback: add to page content if sidebar not found
            console.warn('⚠️ Sidebar not found, adding link to page content');
            addContentLink();
        }
    }

    // Fallback: add link to page content
    function addContentLink() {
        const content = document.getElementById('mw-content-text');
        if (content) {
            const linkDiv = document.createElement('div');
            linkDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 100; background: #0645ad; padding: 10px; border-radius: 5px;';
            linkDiv.innerHTML = '<a href="#" id="ll-namespace-link" style="color: white; text-decoration: none; font-weight: bold;">📊 Namespace Stats</a>';
            
            const link = linkDiv.querySelector('#ll-namespace-link');
            link.addEventListener('click', (e) => {
                e.preventDefault();
                createModal();
            });
            
            document.body.appendChild(linkDiv);
        }
    }

    // Initialize when page loads
    function initialize() {
        // Wait for MediaWiki to load
        if (typeof mw !== 'undefined' && mw.config) {
            addSidebarLink();
        } else {
            // Fallback if MediaWiki not detected
            setTimeout(initialize, 1000);
        }
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
