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
        .ll-statusIcon-include {
            background-color: #d4edda !important;
            color: #155724;
        }
        .ll-statusIcon-exclude {
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
        .ll-update-btn {
            background: #ff8c00;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 10px;
            margin-right: 10px;
        }
        .ll-update-btn:hover {
            background: #cc7000;
        }
        .ll-update-btn:disabled {
            background: #a2a9b1;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);

    // Namespace data - will be loaded from JSON
    let namespaces = [];
    let isRefreshing = false;
    let namespacesLoaded = false;
    
    // Load namespaces.json
    fetch('./json/namespaces.json')
        .then(response => response.json())
        .then(data => {
            namespaces = data;
            namespacesLoaded = true;
            console.log('✅ Loaded namespaces.json:', namespaces);
        })
        .catch(error => {
            console.error('❌ Error loading namespaces.json:', error);
            alert('Failed to load namespaces.json. Please check the file exists and is valid JSON.');
        });

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
                // Add delay before continuation request to avoid rate limiting
                updateProgress(`Fetching more pages for ${nsTitle}... (${collectedPages.size} collected so far)`);
                await new Promise(resolve => setTimeout(resolve, 400)); // 400ms delay
                await fetchPagesInNamespace(nsId, nsTitle, data.continue.apcontinue, collectedPages);
            }
        } catch (error) {
            console.error(`Error fetching pages for namespace ${nsId} (${nsTitle}):`, error);
            
            // Add retry logic for rate limit errors (503) or network errors
            if (error.message.includes('503') || error.message.includes('NetworkError')) {
                console.warn(`⚠️ Rate limit hit for ${nsTitle}, waiting 3 seconds before retry...`);
                updateProgress(`Rate limit hit for ${nsTitle}, waiting before retry...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Retry once
                try {
                    console.log(`🔄 Retrying ${nsTitle}...`);
                    return await fetchPagesInNamespace(nsId, nsTitle, apcontinue, collectedPages);
                } catch (retryError) {
                    console.error(`❌ Retry failed for ${nsTitle}:`, retryError);
                    updateProgress(`Error: Failed to fetch ${nsTitle} after retry`);
                }
            }
        }

        return collectedPages;
    }

    // Save to localStorage
    function saveToLocalStorage(namespace, pages) {
        const key = namespace.replace(':*', '').toLowerCase();
        try {
            localStorage.setItem(`ll_namespace_${key}`, JSON.stringify(pages));
            console.log(`✅ Saved ${pages.length} pages to localStorage: ll_namespace_${key}`);
        } catch (error) {
            console.error(`Error saving to localStorage for ${key}:`, error);
        }
    }

    // Update table
    function updateNamespaceTable() {
        const tableBody = document.getElementById('ll-namespace-table-body');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        namespaces.forEach(ns => {
            const row = document.createElement('tr');
            const statusIcon = ns.quantity > 0 ? '✅' : '❌';
            const statusClass = ns.quantity > 0 ? 'll-statusIcon-include' : 'll-statusIcon-exclude';
            const status = ns.status;
            
            row.innerHTML = `
                <td>${ns.id}</td>
                <td style="font-family: monospace;">${ns.title}</td>
                <td style="text-align: right; font-weight: bold;" class="${statusClass}">${statusIcon+' '+ ns.quantity.toLocaleString()}</td>
                <td  style="text-align: center;">${status}</td>
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
        // Check if namespaces are loaded
        if (!namespacesLoaded || namespaces.length === 0) {
            updateProgress("⚠️ Waiting for namespaces.json to load...");
            console.warn('⚠️ namespaces.json not loaded yet, waiting...');
            
            // Wait for up to 5 seconds for the JSON to load
            let attempts = 0;
            while (!namespacesLoaded && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (!namespacesLoaded || namespaces.length === 0) {
                updateProgress("❌ Error: namespaces.json failed to load");
                alert('Error: namespaces.json failed to load. Please refresh the page.');
                return;
            }
        }
        
        if (isRefreshing) return;
        
        isRefreshing = true;
        const refreshBtn = document.getElementById('ll-refresh-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
        }

        console.log("🚀 Starting namespace data fetch...");
        console.log(`📊 Processing ${namespaces.length} namespaces:`, namespaces);
        updateProgress("Starting namespace data fetch...");
        
        for (let i = 0; i < namespaces.length; i++) {
            try {
                const ns = namespaces[i];
                updateProgress(`Processing ${i + 1}/${namespaces.length}: ${ns.title}`);
                console.log(`📋 Processing namespace ${i + 1}/${namespaces.length}: ${ns.title} (ID: ${ns.id})`);
                
                const pages = await fetchPagesInNamespace(ns.id, ns.title);
                ns.quantity = pages.size;
                ns.pages = Array.from(pages);

                // Save to localStorage
                saveToLocalStorage(ns.title, ns.pages);

                console.log(`✅ ${pages.size} pages for ${ns.title}`);
                console.log(`Pages for ${ns.title}:`, pages);
                updateNamespaceTable();
                
                // Add delay between requests (except for the last one)
                if (i < namespaces.length - 1) {
                    updateProgress(`Waiting before next namespace... (${i + 1}/${namespaces.length} completed)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (err) {
                console.error(`❌ Failed to fetch data for ${namespaces[i].title}:`, err);
                updateProgress(`Error processing ${namespaces[i].title}: ${err.message}`);
            }
        }
        
        console.log("🎉 All namespace data processing completed!");
        updateProgress("✅ All namespace data processing completed!");
        
        isRefreshing = false;
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Fetch & Save Data';
        }
    }

    // Update webpage data from localStorage
    function updateWebpageData() {
        const updateBtn = document.getElementById('ll-update-btn');
        if (updateBtn) {
            updateBtn.disabled = true;
            updateBtn.textContent = 'Updating...';
        }

        console.log("🔄 Updating webpage from localStorage...");
        updateProgress("Loading data from localStorage...");

        let updatedCount = 0;
        namespaces.forEach(ns => {
            const key = ns.title.replace(':*', '').toLowerCase();
            const storageKey = `ll_namespace_${key}`;
            
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored) {
                    const pages = JSON.parse(stored);
                    
                    // Update the corresponding window object
                    const jsVarName = key.toLowerCase();
                    if (window[jsVarName]) {
                        window[jsVarName].list = pages;
                        console.log(`✅ Updated window.${jsVarName}.list with ${pages.length} items from localStorage`);
                        updatedCount++;
                    } else {
                        console.warn(`⚠️ window.${jsVarName} not found`);
                    }
                }
            } catch (error) {
                console.error(`Error loading ${storageKey} from localStorage:`, error);
            }
        });

        updateProgress(`✅ Updated ${updatedCount} namespaces from localStorage.`);
        
        // Refresh root namespaces using the DRY function from index.html
        if (typeof window.initializeRootNamespaces === 'function') {
            window.initializeRootNamespaces();
            console.log('✅ Refreshed template_root and translations_root');
        } else {
            console.warn('⚠️ window.initializeRootNamespaces not found');
        }
        
        // Trigger the page's processData function if it exists
        if (typeof window.processData === 'function') {
            console.log("🔄 Triggering page data reprocessing...");
            setTimeout(() => {
                window.processData();
                updateProgress(`✅ Page data refreshed with localStorage data!`);
                if (updateBtn) {
                    updateBtn.disabled = false;
                    updateBtn.style.background = '#28a745';
                    updateBtn.textContent = '✓ Updated';
                    
                    // Reset button after 2 seconds
                    setTimeout(() => {
                        updateBtn.style.background = '';
                        updateBtn.textContent = 'Update Webpage\'s Data';
                    }, 2000);
                }
            }, 500);
        } else {
            console.warn("⚠️ window.processData not found, page may need manual refresh");
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = 'Update Webpage\'s Data';
            }
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
            <button class="ll-refresh-btn" id="ll-refresh-btn">Fetch & Save Data</button>
            <button class="ll-update-btn" id="ll-update-btn">Update Webpage's Data</button>
            <h2>Lingua Libre Namespace Statistics</h2>
            <div id="ll-progress" class="ll-progress">Click "Fetch & Save Data" to refresh from API, or "Update Webpage's Data" to load from localStorage</div>
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

        // Add update button event listener
        const updateBtn = document.getElementById('ll-update-btn');
        if (updateBtn) {
            updateBtn.addEventListener('click', updateWebpageData);
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

    // Expose createModal globally for use outside MediaWiki
    window.openNamespaceManager = createModal;

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();